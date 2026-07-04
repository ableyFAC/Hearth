"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveProperty } from "@/lib/property";
import { leadFeeFor, labelFor, JOB_CATEGORIES } from "@/lib/constants";
import { setFlash } from "@/lib/flash";
import { hasPlus } from "@/lib/subscription";

// Homeowner posts a job (Indeed-style). No pro is picked here: the lead is left
// unassigned (contractor_id null) so matching pros can apply to it. The chosen
// pro is selected later from the applicants.
export async function postJobAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const category = formData.get("category") as string;
  const issueId = (formData.get("issue_id") as string) || null;
  const timing = (formData.get("timing") as string) || null;
  const message = ((formData.get("message") as string) || "").trim() || null;

  // Homeowners share one gate account, so we can't derive a real identity from
  // auth - capture contact on the form and snapshot it onto the job.
  const homeownerName = (formData.get("homeowner_name") as string) || null;
  const homeownerEmail =
    (formData.get("homeowner_email") as string) || user.email || null;
  const homeownerPhone = (formData.get("homeowner_phone") as string) || null;

  // The job description pros see: the homeowner's own words, falling back to the
  // linked issue's text.
  let issueDescription: string | null = message;
  let issueSeverity: string | null = null;
  if (issueId) {
    const { data: issue } = await supabase
      .from("issues")
      .select("description, severity")
      .eq("id", issueId)
      .maybeSingle();
    issueDescription = message ?? issue?.description ?? null;
    issueSeverity = issue?.severity ?? null;
  }

  const address = [property.address_line1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  // Guard against a double-submit posting the same job twice: if an identical
  // open posting was just created (same property + category), reuse it.
  const { data: recent } = await supabase
    .from("contractor_leads")
    .select("id, created_at")
    .eq("property_id", property.id)
    .eq("category", category)
    .is("contractor_id", null)
    .eq("status", "new")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 15000) {
    redirect("/contractors?posted=1");
  }

  // Free vs Plus open-job limits: a free homeowner may have 3 open jobs at a
  // time (plenty for any normal household, and it keeps junk postings down);
  // Plus removes the cap. An open listing is one no pro has been picked for yet.
  const plus = await hasPlus();
  const limit = plus ? Infinity : 3;
  const { count: openCount } = await supabase
    .from("contractor_leads")
    .select("id", { count: "exact", head: true })
    .eq("property_id", property.id)
    .is("contractor_id", null)
    .eq("status", "new");
  if ((openCount ?? 0) >= limit) {
    // Only free homeowners can reach this: Plus is unlimited.
    redirect("/plus?reason=job_limit");
  }

  const { error } = await supabase.from("contractor_leads").insert({
    property_id: property.id,
    issue_id: issueId,
    contractor_id: null, // open job: pros apply, homeowner picks later
    category,
    status: "new",
    payout_amount: leadFeeFor(category),
    homeowner_name: homeownerName,
    homeowner_email: homeownerEmail,
    homeowner_phone: homeownerPhone,
    property_address: address,
    issue_description: issueDescription,
    issue_severity: issueSeverity,
    timing,
  });
  if (error) throw new Error(error.message);

  // Mark the originating issue so we don't keep nudging the owner about it.
  if (issueId) {
    await supabase
      .from("issues")
      .update({ converted_to_lead: true })
      .eq("id", issueId);
  }

  // Nudge matching pros that a fresh job just came in, so they see it while
  // it's still open and worth racing other applicants for. Best-effort only:
  // a notification hiccup should never break the homeowner's post.
  try {
    const admin = createAdminClient();
    const { data: matches } = await admin
      .from("contractors")
      .select("user_id")
      .not("user_id", "is", null)
      .contains("categories", [category])
      .limit(50);
    const categoryLabel = labelFor(JOB_CATEGORIES, category);
    for (const match of matches ?? []) {
      if (!match.user_id) continue;
      await admin.from("notifications").insert({
        user_id: match.user_id,
        kind: "new_lead",
        title: `New ${categoryLabel} job posted nearby`,
        body: "A homeowner just posted a job. Apply before other pros do.",
        url: "/pro",
      });
    }
  } catch {
    // Notifications are a nice-to-have here, not part of the posting flow.
  }

  revalidatePath("/contractors");
  revalidatePath("/issues");
  // Unique token so the post form remounts and the job fields reset for the next
  // posting (contact stays, since it's prefilled from the profile).
  redirect(`/contractors?posted=${Date.now()}`);
}

// Homeowner edits a posted job (category, timing, details, contact). RLS limits
// the update to a lead on a property the caller owns.
export async function updateJobAction(formData: FormData) {
  const supabase = createClient();
  const leadId = String(formData.get("lead_id"));
  const category = formData.get("category") as string;
  const timing = (formData.get("timing") as string) || null;
  const message = ((formData.get("message") as string) || "").trim() || null;
  const homeownerName = (formData.get("homeowner_name") as string) || null;
  const homeownerEmail = (formData.get("homeowner_email") as string) || null;
  const homeownerPhone = (formData.get("homeowner_phone") as string) || null;

  const { error } = await supabase
    .from("contractor_leads")
    .update({
      category,
      payout_amount: leadFeeFor(category),
      timing,
      issue_description: message,
      homeowner_name: homeownerName,
      homeowner_email: homeownerEmail,
      homeowner_phone: homeownerPhone,
    })
    .eq("id", leadId);
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else setFlash("Job updated.", "success");
  revalidatePath("/contractors");
}

// Homeowner closes (cancels) a job posting. Only allowed before any pro has
// applied - once a pro has paid the apply fee, the owner must pick from the
// applicants rather than cancel (the fee is non-refundable).
export async function closeJobAction(formData: FormData) {
  const supabase = createClient();
  const leadId = String(formData.get("lead_id"));
  const reason = (formData.get("reason") as string) || "";

  const { count } = await (supabase as any)
    .from("lead_applications")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId);
  if ((count ?? 0) > 0) {
    setFlash(
      "Pros have already applied, so this job can't be closed. Pick one from the applicants.",
      "error"
    );
    revalidatePath("/contractors");
    return;
  }

  // RLS limits the delete to a lead on a property the caller owns.
  const { error } = await supabase
    .from("contractor_leads")
    .delete()
    .eq("id", leadId);
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else setFlash(reason ? `Job closed: ${reason}.` : "Job closed.", "info");
  revalidatePath("/contractors");
  revalidatePath("/dashboard");
}

// Homeowner picks a pro from the applicants. The DB function assigns + unlocks
// the chosen pro (they get contact + chat) and declines the rest.
export async function chooseApplicantAction(formData: FormData) {
  const supabase = createClient() as any;
  const applicationId = String(formData.get("application_id"));
  const { error } = await supabase.rpc("choose_applicant", {
    p_application: applicationId,
  });
  if (error) setFlash("Something went wrong. Please try again.", "error");
  else
    setFlash(
      "Pro selected. They now have your contact and can message you.",
      "success"
    );
  revalidatePath("/contractors");
}
