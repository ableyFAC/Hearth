"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";
import { labelFor, JOB_CATEGORIES, LEAD_STATUSES } from "@/lib/constants";
import { agingLeadFee } from "@/lib/leadPricing";

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

  const existing = await getCurrentContractor();

  if (existing) {
    // The license is a verified legal identifier - once set it's locked and
    // can't be changed from the profile. Keep the existing value so a missing
    // (read-only) field can't wipe or swap it.
    if (existing.license_number) {
      fields.license_number = existing.license_number;
    }
    const { error } = await supabase
      .from("contractors")
      .update(fields)
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    setFlash("Profile saved.");
    revalidatePath("/pro/profile");
    redirect("/pro/profile");
  }

  // First-time setup. vetted = true so the company is matchable immediately
  // (in production this would be a manual verification step).
  const { error } = await supabase.from("contractors").insert({
    ...fields,
    user_id: user.id,
    vetted: true,
  });
  if (error) throw new Error(error.message);
  setFlash("You're all set. Leads will appear here.");
  revalidatePath("/", "layout");
  redirect("/pro");
}

async function assertContractor() {
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/signin");
  return contractor;
}

export async function updateLeadStatusAction(formData: FormData) {
  const leadId = formData.get("id") as string;
  const status = formData.get("status") as string;
  // Only accept a known status value; never write arbitrary client input.
  if (!LEAD_STATUSES.some((s) => s.value === status)) {
    setFlash("Unknown status.", "error");
    return;
  }
  await assertContractor();
  const supabase = createClient();
  // RLS also guarantees the lead is assigned to this contractor.
  const { error } = await supabase
    .from("contractor_leads")
    .update({ status })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
  setFlash(`Lead marked ${labelFor(LEAD_STATUSES, status)}`);
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
