"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";
import { labelFor, LEAD_STATUSES } from "@/lib/constants";

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
    // The license is a verified legal identifier — once set it's locked and
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
  setFlash("You're all set — leads will appear here");
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

export async function markLeadPaidAction(formData: FormData) {
  const leadId = formData.get("id") as string;
  const paid = formData.get("paid") === "true";
  await assertContractor();
  const supabase = createClient();
  const { error } = await supabase
    .from("contractor_leads")
    .update({ paid, paid_at: paid ? new Date().toISOString() : null })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
  setFlash(paid ? "Marked as paid" : "Marked as unpaid", "info");
  revalidatePath("/pro/billing");
  revalidatePath("/pro");
}
