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
import { findActiveJobConflicts } from "@/lib/activeJobConflicts";
import type { Json } from "@/lib/database.types";

// Server-side counterpart to src/lib/analytics.ts's track(): that helper
// fires via navigator.sendBeacon, which doesn't exist in a server action, so
// this writes straight to app_events with the admin client instead. Mirrors
// src/app/api/track/route.ts's own insert: same table, same
// isMissingSchemaError fallback to a log line if migration 0091 hasn't run
// on this DB yet, and never throws, so a call site never needs its own
// try/catch around it.
async function trackServerEvent(
  userId: string | null,
  event: string,
  props?: Record<string, unknown>
) {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_events").insert({
      event,
      props: (props ?? null) as Json | null,
      user_id: userId,
    });
    if (error && !isMissingSchemaError(error)) {
      console.error(`trackServerEvent(${event}): insert failed:`, error.message);
    } else if (error) {
      console.log("[track]", event, props ?? {});
    }
  } catch (err) {
    console.error(
      `trackServerEvent(${event}) failed:`,
      err instanceof Error ? err.message : err
    );
  }
}

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
    // 0078 revokes UPDATE on license_verified_status/_at/_verify_detail from
    // `authenticated` (a contractor could otherwise self-forge a "verified"
    // badge), so this write goes through the admin client instead of the
    // user-scoped `supabase` param. Still safe: `fields` is derived entirely
    // from the CSLB lookup above (never client input), and contractorId is
    // always the caller's own contractor id, resolved by every caller via
    // assertContractor()/getCurrentContractor(), never client-supplied.
    const admin = createAdminClient();
    const { error } = await (admin.from("contractors") as any)
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
// code must NEVER block onboarding. Delegated to the resolve_referral_code
// RPC (0067): after that migration stripped column-level SELECT on
// contractors, a direct .from("contractors") read of another pro's row would
// be blocked by RLS, so the three lookups (full id, slug, 8-hex prefix) live
// in one SECURITY DEFINER function instead.
async function resolveReferralCode(
  supabase: ReturnType<typeof createClient>,
  raw: FormDataEntryValue | null
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("resolve_referral_code", {
      p_code: String(raw ?? ""),
    });
    return (data as string | null) ?? null;
  } catch {
    // Ignore silently: referral attribution is strictly best-effort.
    return null;
  }
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

  // Orange County launch gate (0074). Same missing-column-safe pattern as
  // service_state above: only overwrite when the submitting form actually
  // carries the field. The onboarding form renders `serves_orange_county` as
  // two required radios ("true"/"false"), so a submit from that form always
  // posts one of those strings here; a form that doesn't render the field at
  // all (e.g. the profile edit form) posts null and must never wipe a stored
  // value.
  const ocEntry = formData.get("serves_orange_county");
  const servesOrangeCounty = ocEntry !== null && String(ocEntry) === "true";
  const ocWrite =
    ocEntry !== null ? { serves_orange_county: servesOrangeCounty } : {};
  const hasOcWrite = ocEntry !== null;

  const existing = await getCurrentContractor();

  if (existing) {
    // The license is a legal identifier: locked once VERIFIED (0037), not
    // before. Until a check confirms the number, the pro can still correct a
    // typo. A form that didn't carry the field at all (a read-only or absent
    // input posts nothing) keeps the stored value either way, so a lean form
    // can't wipe or swap it.
    const licenseEntry = formData.get("license_number");
    const licenseVerified =
      (existing as any).license_verified_status === "verified";
    if (
      existing.license_number &&
      (licenseVerified || licenseEntry === null)
    ) {
      fields.license_number = existing.license_number;
    }
    // A changed number resets verification to square one: any earlier check
    // proved a different license. 'pending' when a number is on file,
    // 'unverified' when it was cleared, per 0037's vocabulary.
    const licenseChanged =
      fields.license_number !== (existing.license_number ?? null);
    const licenseWrite = licenseChanged
      ? {
          license_verified_status: fields.license_number
            ? "pending"
            : "unverified",
          license_verified_at: null,
          license_verify_detail: null,
        }
      : {};
    let { error } = await supabase
      .from("contractors")
      .update({ ...fields, ...stateWrite, ...ocWrite } as any)
      .eq("id", existing.id);
    // Same graceful missing-column retry as the insert path below: if 0046
    // (or 0074) hasn't run yet, save everything else rather than failing the
    // whole form.
    if (error && (hasStateWrite || hasOcWrite) && isMissingSchemaError(error)) {
      ({ error } = await supabase
        .from("contractors")
        .update(fields)
        .eq("id", existing.id));
    }
    if (error) throw new Error(error.message);

    // license_verified_status/_at/_verify_detail are trust columns 0078
    // revokes UPDATE on for `authenticated` (self-forged "verified" badges),
    // so this reset can't go through the user client above. Admin client,
    // scoped to existing.id: the caller's own contractor, resolved by
    // getCurrentContractor() at the top of this action, never client input.
    if (licenseChanged) {
      const admin = createAdminClient();
      const { error: licenseError } = await admin
        .from("contractors")
        .update(licenseWrite as any)
        .eq("id", existing.id);
      if (licenseError && !isMissingSchemaError(licenseError)) {
        throw new Error(licenseError.message);
      }
    }

    // Real CSLB check (0055), only when this save actually changed the
    // license number on file (first time, or a pre-verification typo fix: a
    // verified number is locked above, so it never re-triggers here). CSLB
    // is California's registry, so the lookup only runs for companies
    // serving CA; any other state's license stays 'pending' (on file, not
    // yet checkable) instead of collecting a public "failed" badge from a
    // registry that was never going to have it. Re-checking an unchanged
    // license is "Verify now" (verifyLicenseNowAction below) or the weekly
    // recheck cron. Best-effort: a CSLB hiccup must never block the profile
    // save that already succeeded.
    const effectiveServiceState = hasStateWrite
      ? serviceState
      : (((existing as any).service_state as string | null) ?? null);
    if (
      licenseChanged &&
      fields.license_number &&
      effectiveServiceState === "CA"
    ) {
      try {
        await verifyContractorLicense(
          supabase,
          existing.id,
          fields.license_number,
          // The number just changed, so no earlier check applies to it:
          // don't let the old number's timestamp debounce this one away.
          null
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

  // Orange County launch gate (0074), first-time company creation only. A pro
  // who didn't check the box never gets a contractors row at all: instead
  // they land on a waitlist so Hearth can reach out when it opens in their
  // area. Best-effort insert (the unique index on lower(email), role means a
  // resubmit is silently a no-op, not an error) - the reject must go through
  // either way.
  if (!servesOrangeCounty) {
    try {
      const waitlistEmail = (fields.contact_email || user.email || "").trim();
      if (waitlistEmail) {
        await (supabase as any).from("market_waitlist").insert({
          email: waitlistEmail,
          role: "pro",
          state: serviceState,
        });
      }
    } catch (err) {
      console.error(
        "market_waitlist insert failed:",
        err instanceof Error ? err.message : err
      );
    }
    // Honest end state instead of dumping them back on a blank form (which
    // lost every field they'd just typed): redirect to a query flag
    // OnboardingCompanyForm reads to show an in-panel confirmation, plus a
    // working sign-out link, instead of a toast over an empty form. Mirrors
    // the homeowner out_of_area step's tone (src/app/onboarding/OnboardingForm.tsx).
    redirect("/pro/onboarding?waitlisted=1");
  }

  // First-time setup. `vetted` is a matchability flag, not a trust claim:
  // true is what lets matching include the company, and nothing has actually
  // been vetted at signup. No homeowner-facing copy may call a pro "vetted"
  // off this column; the real trust signals are the CSLB license check
  // (0055) and the opt-in background check (0057). id is generated here
  // (instead of left to the column default) so a CSLB check right after the
  // insert has the new row's id without a second round trip.
  const newContractorId = randomUUID();
  const base = {
    id: newContractorId,
    ...fields,
    user_id: user.id,
    // Matchable immediately; see the note above. Not a vetting claim.
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

  // license_verified_status is a trust column: 0078 revokes INSERT (as well
  // as UPDATE) on it for `authenticated`, so it can no longer be set on this
  // user-scoped insert (a brand-new pro could otherwise self-grant a
  // 'verified' badge on the row they're creating). It's left out here
  // entirely; the column's own default ('unverified', 0037) applies, and the
  // 'pending' queue-up for a supplied license number is written separately
  // below via the admin client, scoped to the row just created. If a column
  // doesn't exist yet (migration not run), retry without the extras so
  // onboarding never breaks, same pattern as pro/help/actions. The retry is
  // gated on the missing-column fingerprint specifically: retrying on a
  // transient error would silently drop referral attribution on an insert
  // that might succeed the second time.
  let { error } = await supabase
    .from("contractors")
    .insert({ ...base, ...referral, ...stateWrite } as any);
  if (error && (referredBy || hasStateWrite)) {
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

  // A supplied license number is only "on file", not checked: queue it as
  // 'pending' (0037) so nothing downstream can claim a verification that
  // never ran. license_verified_status is one of the trust columns 0078
  // revokes INSERT/UPDATE on for `authenticated`, so this can't ride the
  // insert above; write it via the admin client instead, scoped to
  // newContractorId (generated at the top of this action, never
  // client-supplied). Best-effort: a hiccup here leaves the safe
  // 'unverified' default in place rather than blocking account creation,
  // which already succeeded above; the CSLB check right below (CA only)
  // will still run either way and can move status past 'unverified' itself.
  if (fields.license_number) {
    const admin = createAdminClient();
    const { error: pendingError } = await admin
      .from("contractors")
      .update({ license_verified_status: "pending" })
      .eq("id", newContractorId);
    if (pendingError) {
      console.error(
        "contractors pending-status write failed:",
        pendingError.message
      );
    }
  }

  // Real CSLB check (0055) for a license number supplied at onboarding.
  // California companies only: CSLB is CA's registry, so any other state's
  // license stays 'pending' (on file, awaiting a check) instead of getting a
  // public "failed" badge from a lookup that could never succeed.
  // Best-effort: a CSLB hiccup must never block account creation, which
  // already succeeded above.
  if (fields.license_number && serviceState === "CA") {
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

// "Verify now" / "Reverify" button on /pro/profile: an on-demand CSLB check
// for a pro whose license number is on file but not yet verified. The button
// lives inside the profile <form>, so the action receives the form's data and
// checks the license number currently in the input, not a stale DB value: a
// pro who fixes a typo and clicks "Reverify" means the corrected number, and
// a changed number is persisted (reset to 'pending', per 0037) before the
// check. Same verifyContractorLicense used by saveCompanyAction and the
// weekly recheck cron, so the debounce and the never-downgrade-on-'error'
// rule apply here too; the debounce is skipped when the number changed, since
// the previous check proved a different license.
export async function verifyLicenseNowAction(formData: FormData) {
  const contractor = await assertContractor();

  const stored = contractor.license_number ?? null;
  const licenseVerified =
    (contractor as any).license_verified_status === "verified";
  // A verified number is locked (mirrors saveCompanyAction), and a form
  // without the field (read-only or absent input posts nothing) keeps the
  // stored value, so neither path can swap a locked license.
  const licenseEntry = formData.get("license_number");
  const typed =
    licenseEntry === null ? null : String(licenseEntry).trim() || null;
  const licenseNumber =
    licenseVerified || licenseEntry === null ? stored : typed;
  if (!licenseNumber) {
    setFlash("Add a license number first.", "error");
    revalidatePath("/pro/profile");
    return;
  }

  // CSLB covers California licenses only, so a pro who explicitly serves
  // another state is refused honestly: their license stays on file, not
  // publicly "failed" by a registry that was never going to have it. A
  // null/blank service_state ("All states", or a pre-0046 row) IS eligible:
  // this is an explicit user-initiated check, and a non-CSLB number safely
  // parses as not-found.
  const serviceState =
    (((contractor as any).service_state as string | null) ?? null) || null;
  if (serviceState !== null && serviceState !== "CA") {
    setFlash(
      "Automatic license checks currently cover California (CSLB) licenses only. Yours stays on file; set State You Serve to California to run a CSLB check.",
      "info"
    );
    revalidatePath("/pro/profile");
    return;
  }

  const supabase = createClient();

  // A corrected (unsaved) number is persisted first, resetting verification
  // to square one: any earlier check proved a different license. If this
  // write fails, bail rather than check a number that isn't on file.
  const licenseChanged = licenseNumber !== stored;
  if (licenseChanged) {
    const { error } = await (supabase.from("contractors") as any)
      .update({ license_number: licenseNumber })
      .eq("id", contractor.id);
    if (error) {
      console.error("verifyLicenseNowAction: license save failed:", error.message);
      setFlash("Couldn't save the corrected license number. Try again.", "error");
      revalidatePath("/pro/profile");
      return;
    }

    // license_verified_status/_at/_verify_detail are trust columns 0078
    // revokes UPDATE on for `authenticated`; write via the admin client.
    // Scoped to contractor.id: the caller's own contractor, from
    // assertContractor() above, never client-supplied.
    const admin = createAdminClient();
    const { error: resetError } = await (admin.from("contractors") as any)
      .update({
        license_verified_status: "pending",
        license_verified_at: null,
        license_verify_detail: null,
      })
      .eq("id", contractor.id);
    if (resetError) {
      console.error(
        "verifyLicenseNowAction: license reset failed:",
        resetError.message
      );
      setFlash("Couldn't save the corrected license number. Try again.", "error");
      revalidatePath("/pro/profile");
      return;
    }
  }

  const result = await verifyContractorLicense(
    supabase,
    contractor.id,
    licenseNumber,
    // A just-changed number was never checked: the old number's timestamps
    // must not debounce this check away.
    licenseChanged ? null : contractor.license_verified_at,
    licenseChanged ? null : (contractor as any).license_verify_detail
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

  // checkr_candidate_id/background_check_status are trust columns 0078
  // revokes UPDATE on for `authenticated`; write via the admin client. The
  // value comes from the Checkr candidate just created above (never client
  // input), and the write is scoped to contractor.id: the caller's own
  // contractor, from assertContractor() above.
  const admin = createAdminClient();
  const { error } = await (admin.from("contractors") as any)
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
    .select("status, category")
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
    // "job_won" (src/app/api/track/route.ts): fires on the same real
    // transition INTO Won as the review ask above, independent of Pro plan
    // status. No PII, just the category.
    await trackServerEvent(contractor.user_id, "job_won", {
      category: before.category,
    });
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

  // Orange County launch gate (0074), defense-in-depth: open_jobs_for_me()
  // already hides jobs from a pro who hasn't confirmed Orange County, but a
  // direct POST to this action (stale tab, replayed request) must be refused
  // before any fee is spent, not just hidden from the board. assertContractor
  // already loaded the full row via the admin client, so this is a read of
  // data already in hand, not a second query.
  if (!(contractor as any).serves_orange_county) {
    setFlash("Hearth is Orange County only right now.", "error");
    revalidatePath("/pro");
    return;
  }

  // Marketplace integrity: a pro with an active job for this homeowner in
  // this category already has them in Messages, so a second apply fee would
  // double-charge them for the same relationship. Checked here (friendly
  // error, no charge attempted) and again inside apply_to_lead (0060) as the
  // hard backstop. Completed/closed jobs never block: rehires stay open.
  const conflicts = await findActiveJobConflicts(contractor.id, [leadId]);
  const conflict = conflicts.get(leadId);
  if (conflict) {
    setFlash(
      `You already have an active ${labelFor(JOB_CATEGORIES, conflict.category)} job with this homeowner. Message them there instead; once that job wraps up, you can apply to their new ones again.`,
      "error"
    );
    revalidatePath("/pro");
    return;
  }

  // Advisory pre-check (see migration 0092's RESIDUAL note): apply_to_lead
  // has no awareness of owner_closed_at, so without this a pro could still
  // pay to apply to a job the homeowner already closed. RLS only lets a pro
  // SELECT a lead once they're the assigned contractor ("leads contractor
  // select", 0005), which an unassigned open job never is, so this reads
  // through the admin client rather than the user-scoped one. Advisory only:
  // a race between this check and the RPC below is acceptable (ghost
  // protection still refunds an apply fee paid in that window), and this
  // never touches apply_to_lead's own SQL or any money logic.
  const admin = createAdminClient();
  const { data: leadClosedCheck, error: leadClosedError } = await admin
    .from("contractor_leads")
    .select("owner_closed_at")
    .eq("id", leadId)
    .maybeSingle();
  if (leadClosedError && !isMissingSchemaError(leadClosedError)) {
    console.error(
      "applyToJobAction: owner_closed_at pre-check failed:",
      leadClosedError.message
    );
  }
  if (!leadClosedError && (leadClosedCheck as any)?.owner_closed_at) {
    setFlash(
      "The homeowner closed this job before you applied, so you were not charged.",
      "error"
    );
    revalidatePath("/pro");
    return;
  }
  // Any error here (0092 not run yet, or an unrelated hiccup) falls through
  // and lets apply_to_lead run exactly as it did before this check existed:
  // this pre-check is advisory only and must never itself block a legit apply.

  const supabase = createClient() as any;
  const { data, error } = await supabase.rpc("apply_to_lead", {
    p_lead: leadId,
    p_message: message,
  });
  if (error)
    // The DB raises 'Job is full' at the applicant cap and 'Already working
    // with this homeowner' at the relationship guard (0060) - both different
    // problems than a short wallet, so each gets its own message instead of
    // the raw error.
    setFlash(
      error.message.includes("Job is full")
        ? "This job is full: 3 pros already applied. Try another job."
        : error.message.includes("Already working with this homeowner")
          ? "You already have an active job with this homeowner in this category. Message them there instead."
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
        // Reuses the admin client created for the owner_closed_at pre-check
        // above, rather than opening a second one.
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
          // "pro_apply" (src/app/api/track/route.ts): fires once per
          // successful, fee-charged application. No PII, just the category.
          await trackServerEvent(contractor.user_id, "pro_apply", {
            category: lead.category,
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
