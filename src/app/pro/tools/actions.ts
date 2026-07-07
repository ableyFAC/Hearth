"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";

// Delete only counterpart to /api/pro-past-jobs: a past job row is extract
// once (migration 0050 grants no update on the table), so fixing a bad read
// means removing it and reuploading. Contractor scoped the same way as the
// CRM's deleteClientAction (src/app/pro/crm/actions.ts). No redirect here:
// this is called from inside the client heavy ProToolsClient, which keeps
// its own tab and draft state, so a redirect would reset that unnecessarily.
export async function deletePastJobAction(formData: FormData) {
  const contractor = await getCurrentContractor();
  if (!contractor) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("pro_past_jobs")
    .delete()
    .eq("id", id)
    .eq("contractor_id", contractor.id);
  if (error) {
    setFlash("Couldn't remove that past job. Please try again.", "error");
    revalidatePath("/pro/tools");
    return;
  }

  setFlash("Past job removed.");
  revalidatePath("/pro/tools");
}
