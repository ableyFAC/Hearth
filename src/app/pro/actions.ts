"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";
import { labelFor, JOB_CATEGORIES, LEAD_STATUSES } from "@/lib/constants";
import { agingLeadFee } from "@/lib/leadPricing";
import { hasProPlan } from "@/lib/subscription";
import { requestReviewForWonLead } from "@/lib/reviewRequest";
import { lookupCslbLicense, type CslbLookupResult } from "@/lib/cslb";
import { createCandidateAndInvite } from "@/lib/checkr";
import { isMissingSchemaError } from "@/lib/dbErrors";

// Real CSLB check (0055) is debounced off the most recent check we recorded:
// license_verified_at (stamped only on a 'verified' outcome) or the
// checked_at stamped inside license_verify_detail on every decided outcome,
// verified or failed. Either one inside the window skips the network call,
// so a burst of profile saves or "Verify now" clicks can't hammer CSLB even
// while a license keeps failing.
const LICENSE_RECHECK_DEBOUNCE_MS = 10 * 60 * 1000;

// Runs a real CSLB lookup for a contractor's license number and writes the
// result onto license_verified_status/_at/_verify_detail (0037/0055).
// Returns null if the debounce window skipped the fetch, otherwise the raw
// CSLB result (so callers can show the pro why a check did or didn't pass).
// An 'error' outcome (CSLB unreachable, timed out, or its page shape
// changed) NEVER changes license_verified_status: a fetch failure must never
// be treated as a failed license check.
async function verifyContractorLicense(
  supabase: ReturnType<typeof createClient>,
  contractorId: string,
  licenseNumber: string,
  currentVerifiedAt: string | null | undefined,
  currentDetail?: unknown
): Promise<CslbLookupResult | null> {
  const lastCheckedAt =
    ((currentDetail as { checked_at?: string } | null | undefined)
      ?.checked_at as string | undefined) ?? currentVerifiedAt;
  if (lastCheckedAt) {
    const age = Date.now() - new Date(lastCheckedAt).getTime();
    if (Number.isFinite(age) && age < LICENSE_RECHECK_DEBOUNCE_MS) return null;
  }

  const result = await lookupCslbLicense(licenseNumber);

  const detail = {
    businessName: result.businessName ?? null,
    statusText: result.statusText ?? null,
    classifications: result.classifications ?? null,
    expires: result.expires ?? null,
    checked_at: new Date().toISOString(),
  };

  let fields: Record<string, unknown> | null = null;
  if (result.outcome === "active") {
    fields = {
      license_verified_status: "verified",
      license_verified_at: new Date().toISOString(),
      license_verify_detail: detail,
    };
  } else if (result.outcome === "not_found" || result.outcome === "inactive") {
    fields = {
      license_verified_status: "failed",
      // Cleared, not kept: the public badge on /p/<id> keys off
      // license_verified_at alone, so leaving a stale timestamp here would
      // keep showing "License verified" for a license that just failed.
      license_verified_at: null,
      license_verify_detail: detail,
    };
  }
  // outcome === 'error': fields stays null, status is left exactly as-is.

  if (fields) {
    const { error } = await (supabase.from("contractors") as any)
      .update(fields)
      .eq("id", contractorId);
    if (error) {
      console.error("license verification write failed:", error.message);
    }
  }

  return result;
}

// Resolve a referral code to a contractor id, or null. A code is another
// pro's slug (0043) or the first 8 hex chars of their contractor id (or the
// full id). Unknown, ambiguous, or malformed codes resolve to null: a bad
// code must NEVER block onboarding. Casts are (as any) because slug and the
// referral columns land via migrations 0043/0044 and aren't in the generated
// types; if those migrations haven't run yet, every branch just returns null.
async function resolveReferralCode(
  supabase: ReturnType<typeof createClient>,
  raw: FormDataEntryValue | null
): Promise<string | null> {
  const code = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!code || code.length > 100) return null;
  try {
    // Full contractor id.
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        code
      )
    ) {
      const { data } = await (supabase as any)
        .from("contractors")
        .select("id")
        .eq("id", code)
        .maybeSingle();
      return data?.id ?? null;
    }
    // Slug (case-insensitive, matching 0043's lower(slug) uniqueness). The
    // shape check keeps ilike wildcards out of the pattern.
    if (/^[a-z0-9][a-z0-9-]*$/.test(code)) {
      const { data } = await (supabase as any)
        .from("contractors")
        .select("id")
        .ilike("slug", code)
        .limit(1);
      if (data?.[0]?.id) return data[0].id;
    }
    // 8-char id prefix. A uuid's first block is its first 8 hex chars and
    // Postgres orders uuids bytewise, so the prefix match is a closed range.
    if (/^[0-9a-f]{8}$/.test(code)) {
      const { data } = await (supabase as any)
        .from("contractors")
        .select("id")
        .gte("id", `${code}-0000-0000-0000-000000000000`)
        .lte("id", `${code}-ffff-ffff-ffff-ffffffffffff`)
        .limit(2);
      const rows = data ?? [];
      if (rows.length === 1) return rows[0].id;
    }
  } catch {
    // Ignore silently: referral attribution is strictly best-effort.
  }
  return null;
}

// Create (onboarding) or update (profile) the current user's contractor company.
export async function saveCompanyAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const categories = formData.getAll("categories").map(String).filter(Boolean);
  const fields = {
    name: formData.get("name") as string,
    license_number: (formData.get("license_number") as string) || null,
    service_area: (formData.get("service_area") as string) || null,
    contact_phone: (formData.get("contact_phone") as string) || null,
    contact_email: (formData.get("contact_email") as string) || user.email || null,
    categories,
  };

  // Service state (0046, state-level locality). Unlike referral attribution
  // this IS editable on later saves, but only when the submitting form
  // actually carried the field: a form without it (e.g. the profile form
  // until it grows the select) must never wipe a stored value. Anything but
  // a clean two-letter code stores null, which the job board treats as
  // "show everything" (cold-start safe). Kept out of `fields` and written
  // via (as any) with a missing-column retry because the column lands in
  // migration 0046 and isn't in the generated types.
  const serviceStateEntry = formData.get("service_state");
  const serviceStateCode = String(serviceStateEntry ?? "")
    .trim()
    .toUpperCase();
  const serviceState = /^[A-Z]{2}$/.test(serviceStateCode)
    ? serviceStateCode
    : null;
  const stateWrite =
    serviceStateEntry !== null ? { service_state: serviceState } : {};
  const hasStateWrite = serviceStateEntry !== null;

  const existing = await getCurrentContractor();

  if (existing) {
    // The license is a legal identifier: once set it's locked and
    // can't be changed from the profile. Keep the existing value so a missing
    // (read-only) field can't wipe or swap it.
    if (existing.license_number) {
      fields.license_number = existing.license_number;
    }
    let { error } = await supabase
      .from("contractors")
      .update({ ...fields, ...stateWrite } as any)
      .eq("id", existing.id);
    // Same graceful missing-column retry as the insert path below: if 0046
    // hasn't run yet, save everything else rather than failing the whole form.
    if (error && hasStateWrite && isMissingSchemaError(error)) {
      ({ error } = await supabase
        .from("contractors")
        .update(fields)
        .eq("id", existing.id));
    }
    if (error) throw new Error(error.message);

    // Real CSLB check (0055), only when this save is what actually puts a
    // license number on file for the first time: license_number is locked
    // once set (above), so an already-verified/pending/failed pro re-saving
    // unrelated fields never re-triggers a CSLB fetch here. Re-checking an
    // existing license is "Verify now" (verifyLicenseNowAction below) or the
    // weekly recheck cron. Best-effort: a CSLB hiccup must never block the
    // profile save that already succeeded.
    if (!existing.license_number && fields.license_number) {
      try {
        await verifyContractorLicense(
          supabase,
          existing.id,
          fields.license_number,
          existing.license_verified_at,
          (existing as any).license_verify_detail
        );
      } catch (err) {
        console.error(
          "license verification failed:",
          err instanceof Error ? err.message : err
        );
      }
    }

    setFlash("Profile saved.");
    revalidatePath("/pro/profile");
    redirect("/pro/profile");
  }

  // First-time setup. vetted = true so the company is matchable immediately
  // (in production this would be a manual verification step). id is
  // generated here (instead of left to the column default) so a CSLB check
  // right after the insert has the new row's id without a second round trip.
  const newContractorId = randomUUID();
  const base = {
    id: newContractorId,
    ...fields,
    user_id: user.id,
    vetted: true,
  };

  // Referral attribution (0044): written ONLY here, on the creating insert,
  // never on later edits. An unresolvable code is dropped silently.
  const referredBy = await resolveReferralCode(
    supabase,
    formData.get("referral_code")
  );
  const referral = referredBy
    ? { referred_by: referredBy, referred_attributed_at: new Date().toISOString() }
    : {};

  // A supplied license number is only "on file", not checked: queue it as
  // 'pending' so nothing downstream can claim a verification that never ran
  // (0037). If a column doesn't exist yet (migration not run), retry
  // without the extras so onboarding never breaks, same pattern as
  // pro/help/actions. The retry is gated on the missing-column fingerprint
  // specifically: retrying on a transient error would silently drop the
  // pending verification flag (and referral attribution) on an insert that
  // might succeed the second time.
  let { error } = fields.license_number
    ? await supabase
        .from("contractors")
        .insert({ ...base, ...referral, ...stateWrite, license_verified_status: "pending" } as any)
    : await supabase
        .from("contractors")
        .insert({ ...base, ...referral, ...stateWrite } as any);
  if (error && (fields.license_number || referredBy || hasStateWrite)) {
    // isMissingSchemaError, not a hand-rolled regex: PostgREST reports a
    // missing INSERT column as PGRST204 "schema cache", which the old
    // pattern here missed, hard-500ing every new pro signup on a live DB
    // without 0046 instead of falling back to the base insert.
    if (isMissingSchemaError(error)) {
      ({ error } = await supabase.from("contractors").insert(base));
    } else {
      console.error("contractors insert failed:", error.message);
    }
  }
  if (error) throw new Error(error.message);

  // Real CSLB check (0055) for a license number supplied at onboarding.
  // Best-effort: a CSLB hiccup must never block account creation, which
  // already succeeded above.
  if (fields.license_number) {
    try {
      await verifyContractorLicense(
        supabase,
        newContractorId,
        fields.license_number,
        null
      );
    } catch (err) {
      console.error(
        "license verification failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  setFlash("You're all set. Leads will appear here.");
  revalidatePath("/", "layout");
  redirect("/pro");
}

async function assertContractor() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/signin");
  return contractor;
}

// "Verify now" button on /pro/profile: an on-demand CSLB re-check for a pro
// whose license number is on file but not yet verified. Same
// verifyContractorLicense used by saveCompanyAction and the weekly recheck
// cron, so the debounce and the never-downgrade-on-'error' rule apply here
// too.
export async function verifyLicenseNowAction() {
  const contractor = await assertContractor();
  const licenseNumber = contractor.license_number;
  if (!licenseNumber) {
    setFlash("Add a license number first.", "error");
    revalidatePath("/pro/profile");
    return;
  }

  const supabase = createClient();
  const result = await verifyContractorLicense(
    supabase,
    contractor.id,
    licenseNumber,
    contractor.license_verified_at,
    (contractor as any).license_verify_detail
  );

  if (!result) {
    setFlash("Already checked recently. Try again in a few minutes.", "info");
  } else if (result.outcome === "active") {
    setFlash("License verified against the CSLB database.", "success");
  } else if (result.outcome === "not_found" || result.outcome === "inactive") {
    setFlash(
      result.statusText
        ? `CSLB says: ${result.statusText}`
        : "CSLB could not confirm this license.",
      "error"
    );
  } else {
    setFlash("Couldn't reach the CSLB site. Try again later.", "info");
  }
  revalidatePath("/pro/profile");
}

// "Start my background check" button on /pro/profile (0057): opt-in only,
// never auto-run. Creates a Checkr candidate + invitation and saves the
// candidate id so the webhook (src/app/api/checkr/webhook) can match Checkr's
// events back to this contractor. Checkr does the rest by email - Hearth
// never collects the candidate's sensitive info itself.
export async function startBackgroundCheckAction(formData: FormData) {
  const contractor = await assertContractor();

  // Every check costs Hearth real money, so only the two states that
  // legitimately allow a (re)start may reach the Checkr API: 'none' (never
  // started) and 'consider' (retry after a non-clear result). 'invited',
  // 'pending', and 'clear' all bail out: this closes the double-click /
  // replayed-POST path that could otherwise create unlimited paid
  // candidates. Read fresh from the DB, not from any client-supplied state.
  const status =
    ((contractor as any).background_check_status as string | undefined) ??
    "none";
  if (status !== "none" && status !== "consider") {
    setFlash(
      status === "clear"
        ? "Your background check has already cleared."
        : "Your background check is already in progress. Check your email for Checkr's invitation.",
      "info"
    );
    revalidatePath("/pro/profile");
    return;
  }

  const email = contractor.contact_email;
  if (!email) {
    setFlash("Add an email address to your profile first.", "error");
    revalidatePath("/pro/profile");
    return;
  }

  // The check runs against a PERSON, so it needs their legal name, not the
  // business name ("Bob's Plumbing LLC" split into first/last would risk a
  // check against a garbled identity). The card's form collects it
  // explicitly and it goes only to Checkr, never stored by Hearth.
  const firstName = String(formData.get("legal_first_name") ?? "")
    .trim()
    .slice(0, 80);
  const lastName = String(formData.get("legal_last_name") ?? "")
    .trim()
    .slice(0, 80);
  if (!firstName || !lastName) {
    setFlash("Enter your legal first and last name to start.", "error");
    revalidatePath("/pro/profile");
    return;
  }

  // Checkr requires a work location state. contractors.service_state (0046)
  // isn't in the generated types, so it's read off an any-cast; a pro who
  // left it blank ("all states") falls back to CA, matching Hearth's
  // current Fountain Valley / Huntington Beach, CA launch markets.
  const workLocationState =
    (contractor as any).service_state || "CA";

  const result = await createCandidateAndInvite({
    email,
    firstName,
    lastName,
    workLocationState,
  });

  if (!result.ok) {
    console.error("startBackgroundCheckAction failed:", result.error);
    setFlash(
      "Couldn't start your background check. Try again in a few minutes.",
      "error"
    );
    revalidatePath("/pro/profile");
    return;
  }

  const supabase = createClient();
  const { error } = await (supabase.from("contractors") as any)
    .update({
      checkr_candidate_id: result.candidateId,
      background_check_status: "invited",
    })
    .eq("id", contractor.id);
  if (error) {
    console.error("startBackgroundCheckAction: save failed:", error.message);
    setFlash(
      "Your check started, but we couldn't save it here. Contact support.",
      "error"
    );
    revalidatePath("/pro/profile");
    return;
  }

  setFlash(
    "Background check started. Check your email for Checkr's invitation.",
    "success"
  );
  revalidatePath("/pro/profile");
}

export async function updateLeadStatusAction(formData: FormData) {
  const leadId = formData.get("id") as string;
  const status = formData.get("status") as string;
  // Only accept a known status value; never write arbitrary client input.
  if (!LEAD_STATUSES.some((s) => s.value === status)) {
    setFlash("Unknown status.", "error");
    return;
  }
  const contractor = await assertContractor();
  const supabase = createClient();
  // Read the current status first so the review ask below fires only on a real
  // transition INTO Won, not on a re-save of an already-closed job. RLS scopes
  // the read to this contractor's own leads, same as the update.
  const { data: before } = await supabase
    .from("contractor_leads")
    .select("status")
    .eq("id", leadId)
    .maybeSingle();
  // RLS also guarantees the lead is assigned to this contractor.
  const { error } = await supabase
    .from("contractor_leads")
    .update({ status })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
  setFlash(`Lead marked ${labelFor(LEAD_STATUSES, status)}`);

  // Hearth Pro perk: when a member marks a job Won, ask the homeowner for a
  // review automatically. Only on the closed transition (never for lost /
  // accepted / new), only for live Pro plans, and best-effort throughout: a
  // hiccup here must never break the status update. `before` also proves the
  // lead really belongs to this contractor before anyone gets pinged.
  if (status === "closed" && before && before.status !== "closed") {
    try {
      if (await hasProPlan()) {
        await requestReviewForWonLead({
          leadId,
          contractorUserId: contractor.user_id,
          businessName: contractor.name,
        });
      }
    } catch (err) {
      console.error(
        "review request:",
        err instanceof Error ? err.message : err
      );
    }
  }

  revalidatePath("/pro");
}

// Apply to an open job. The DB function charges the per-category fee from the
// wallet (cash first, then bonus) and records the application. Returns false if
// the wallet balance is short.
export async function applyToJobAction(formData: FormData) {
  const contractor = await assertContractor();
  const leadId = String(formData.get("id"));
  const message = (formData.get("message") as string) || "";
  const supabase = createClient() as any;
  const { data, error } = await supabase.rpc("apply_to_lead", {
    p_lead: leadId,
    p_message: message,
  });
  if (error)
    // The DB raises 'Job is full' at the applicant cap - a different problem
    // than a short wallet, so it gets its own message instead of the raw error.
    setFlash(
      error.message.includes("Job is full")
        ? "This job is full: 3 pros already applied. Try another job."
        : error.message,
      "error"
    );
  else if (data === false)
    setFlash("Not enough balance. Add funds to apply.", "error");
  else {
    setFlash("Applied. The homeowner will review your application.", "success");
    // Receipt notification: what they applied to and what it cost. Rows are
    // service-role-only inserts (no client policy), so this uses the admin
    // client. Best-effort: a hiccup here must never break a paid application.
    try {
      if (contractor.user_id) {
        const admin = createAdminClient();
        const { data: lead } = await admin
          .from("contractor_leads")
          .select("category, payout_amount, created_at")
          .eq("id", leadId)
          .maybeSingle();
        if (lead) {
          // Same markdown math the leads board shows and the DB charges
          // (leadPricing.ts mirrors 0025_aging_lead_deals.sql).
          const { fee } = agingLeadFee(
            Number(lead.payout_amount ?? 0),
            lead.created_at
          );
          const feeStr = Number.isInteger(fee)
            ? `$${fee}`
            : `$${fee.toFixed(2)}`;
          await admin.from("notifications").insert({
            user_id: contractor.user_id,
            kind: "apply_receipt",
            title: "Application sent",
            body: `You applied to a ${labelFor(JOB_CATEGORIES, lead.category)} job. ${feeStr} was charged to your wallet.`,
            url: "/pro",
          });
        }
      }
    } catch {
      // The receipt is a nice-to-have; the application already went through.
    }
  }
  revalidatePath("/pro");
  revalidatePath("/pro/billing");
}

// NOTE: a markLeadPaidAction used to live here that wrote the client-supplied
// `paid` / `paid_at` fields directly to contractor_leads. `paid` gates access to
// the homeowner's contact info and chat, so letting the client set it was an
// unlock-without-paying risk. It had no callers (unlocking happens only through
// the SECURITY DEFINER charge_lead / choose_applicant flows that confirm
// payment), so it was removed rather than patched.
