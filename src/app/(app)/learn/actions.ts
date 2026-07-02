"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";

// A homeowner asks for a guide we don't have yet. Captured so we know what to
// add next.
export async function requestTopicAction(formData: FormData) {
  const question = ((formData.get("question") as string) || "").trim();
  if (!question) return;

  const supabase = createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // no anonymous writes

  const { error } = await supabase
    .from("learning_requests")
    .insert({ user_id: user.id, question });

  if (error) setFlash("Couldn't save that request. Please try again.", "error");
  else setFlash("Thanks. We'll add a guide for that.", "success");
  revalidatePath("/learn");
}
