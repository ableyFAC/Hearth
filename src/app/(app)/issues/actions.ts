"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { setFlash } from "@/lib/flash";

export async function reportIssueAction(formData: FormData) {
  const property = await getActiveProperty();
  if (!property) throw new Error("No active property");
  const supabase = createClient();

  const category = formData.get("category") as string;
  const { data: issue, error } = await supabase
    .from("issues")
    .insert({
      property_id: property.id,
      system_id: (formData.get("system_id") as string) || null,
      category,
      severity: formData.get("severity") as string,
      description: (formData.get("description") as string) || null,
    })
    .select("id")
    .single();

  if (error || !issue) throw new Error(error?.message ?? "insert failed");

  // Attach any uploaded photos.
  const urls = formData.getAll("photo_urls") as string[];
  if (urls.length) {
    await supabase.from("photos").insert(
      urls.map((url) => ({
        property_id: property.id,
        related_type: "issue",
        related_id: issue.id,
        url,
      }))
    );
  }

  setFlash("Issue logged. Let's find you a pro.");
  revalidatePath("/issues");
  revalidatePath("/dashboard");

  // Hand the owner straight into the "get a pro" flow for this issue.
  redirect(`/contractors?issue=${issue.id}&category=${category}`);
}

export async function updateIssueAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  // RLS limits the update to an issue on a property the caller owns.
  const { error } = await supabase
    .from("issues")
    .update({
      category: formData.get("category") as string,
      severity: formData.get("severity") as string,
      description: (formData.get("description") as string) || null,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  setFlash("Issue updated");
  revalidatePath("/issues");
  revalidatePath("/dashboard");
}

// When an issue is resolved, lift the "bad condition" flag it put on its system
// so the Home page stops flagging that system as red. We only clear a LOW rating
// (<=2) - the state a problem would have caused - and never touch a healthy one.
// This makes the most recent action (resolving) override the earlier one
// (logging the issue, which lowered the condition), so Home and Issues agree.
async function liftSystemConditionForIssue(supabase: any, issueId: string) {
  const { data: issue } = await supabase
    .from("issues")
    .select("system_id")
    .eq("id", issueId)
    .maybeSingle();
  if (!issue?.system_id) return;
  const { data: sys } = await supabase
    .from("home_systems")
    .select("id, condition_rating")
    .eq("id", issue.system_id)
    .maybeSingle();
  if (sys && sys.condition_rating != null && sys.condition_rating <= 2) {
    await supabase
      .from("home_systems")
      .update({ condition_rating: null })
      .eq("id", sys.id);
  }
}

export async function resolveIssueAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  const { error } = await supabase
    .from("issues")
    .update({ status: "resolved" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await liftSystemConditionForIssue(supabase, id);
  setFlash("Issue resolved");
  revalidatePath("/issues");
  revalidatePath("/dashboard");
}

// Undo: reopen a resolved issue (accidental check-off).
export async function reopenIssueAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("issues")
    .update({ status: "open" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/issues");
  revalidatePath("/dashboard");
}

// Resolve via the checkbox toggle (takes an id, not FormData).
export async function checkResolveIssueAction(id: string) {
  const supabase = createClient();
  const { error } = await supabase
    .from("issues")
    .update({ status: "resolved" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  await liftSystemConditionForIssue(supabase, id);
  revalidatePath("/issues");
  revalidatePath("/dashboard");
}
