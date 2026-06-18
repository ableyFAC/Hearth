"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { leadFeeFor } from "@/lib/constants";

export async function requestProAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const category = formData.get("category") as string;
  const issueId = (formData.get("issue_id") as string) || null;
  const contractorId = (formData.get("contractor_id") as string) || null;
  const timing = (formData.get("timing") as string) || null;

  // Homeowners share one gate account, so we can't derive a real identity from
  // auth — capture contact on the request form and snapshot it onto the lead.
  const homeownerName = (formData.get("homeowner_name") as string) || null;
  const homeownerEmail =
    (formData.get("homeowner_email") as string) || user.email || null;
  const homeownerPhone = (formData.get("homeowner_phone") as string) || null;

  let issueDescription: string | null = null;
  let issueSeverity: string | null = null;
  if (issueId) {
    const { data: issue } = await supabase
      .from("issues")
      .select("description, severity")
      .eq("id", issueId)
      .maybeSingle();
    issueDescription = issue?.description ?? null;
    issueSeverity = issue?.severity ?? null;
  }

  const address = [property.address_line1, property.city, property.state]
    .filter(Boolean)
    .join(", ");

  const { error } = await supabase.from("contractor_leads").insert({
    property_id: property.id,
    issue_id: issueId,
    contractor_id: contractorId,
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
  redirect("/contractors?requested=1");
}
