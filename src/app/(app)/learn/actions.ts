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

  const { error } = await supabase
    .from("learning_requests")
    .insert({ user_id: user?.id ?? null, question });

  if (error) setFlash(error.message, "error");
  else setFlash("Thanks. We'll add a guide for that.", "success");
  revalidatePath("/learn");
}
