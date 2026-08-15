"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";

// A request is one short question, not an essay. Capped server-side because
// the textarea's maxLength is only a client hint.
const MAX_QUESTION = 2000;

// A homeowner asks for a guide we don't have yet. Captured so we know what to
// add next.
export async function requestTopicAction(formData: FormData) {
  const question = ((formData.get("question") as string) || "")
    .trim()
    .slice(0, MAX_QUESTION);
  if (!question) return;

  const supabase = createClient() as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return; // no anonymous writes

  // Free-text a person on the team reads, so it gets the same throttle as the
  // support forms (migration 0068). Fails open on a DB hiccup: only an
  // explicit `allowed === false` blocks, so a limiter outage never stops a
  // real homeowner from asking for a guide.
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `learn:${user.id}`,
    p_limit: 10,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    setFlash(
      "You've asked for a few guides already. Please wait a bit before asking for another.",
      "error"
    );
    return;
  }

  const { error } = await supabase
    .from("learning_requests")
    .insert({ user_id: user.id, question });

  if (error) setFlash("Couldn't save that request. Please try again.", "error");
  else setFlash("Thanks. We'll add a guide for that.", "success");
  revalidatePath("/learn");
}
