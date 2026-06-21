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

export async function resolveIssueAction(formData: FormData) {
  const id = formData.get("id") as string;
  const supabase = createClient();
  const { error } = await supabase
    .from("issues")
    .update({ status: "resolved" })
    .eq("id", id);
  if (error) throw new Error(error.message);
  setFlash("Issue resolved");
  revalidatePath("/issues");
  revalidatePath("/dashboard");
}
