"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { leadFeeFor } from "@/lib/constants";
import { setFlash } from "@/lib/flash";

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

  revalidatePath("/contractors");
  revalidatePath("/issues");
  redirect("/contractors?posted=1");
}

// Homeowner picks a pro from the applicants. The DB function assigns + unlocks
// the chosen pro (they get contact + chat) and declines the rest.
export async function chooseApplicantAction(formData: FormData) {
  const supabase = createClient() as any;
  const applicationId = String(formData.get("application_id"));
  const { error } = await supabase.rpc("choose_applicant", {
    p_application: applicationId,
  });
  if (error) setFlash(error.message, "error");
  else
    setFlash(
      "Pro selected. They now have your contact and can message you.",
      "success"
    );
  revalidatePath("/contractors");
}
