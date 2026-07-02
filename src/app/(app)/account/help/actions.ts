"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";

// Save a homeowner's support message so the team can read and reply. The
// homeowner's contact details are prefilled from their account, but they can
// edit them here.
export async function saveSupportMessageAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Require a session: this endpoint stores attacker-controllable name/email/
  // message that staff later read, so don't accept anonymous writes.
  if (!user) {
    setFlash("Please sign in to contact support.", "error");
    return;
  }

  const message = ((formData.get("message") as string) || "").trim();
  if (!message) {
    setFlash("Please write a short message first.", "error");
    return;
  }

  const str = (k: string) => {
    const v = ((formData.get(k) as string) || "").trim();
    return v.length ? v : null;
  };

  const { error } = await supabase.from("support_messages").insert({
    user_id: user?.id ?? null,
    name: str("name"),
    email: str("email"),
    phone: str("phone"),
    message,
  });

  if (error) setFlash("Couldn't send your message. Please try again.", "error");
  else setFlash("Thanks. We got your message and will get back to you.", "success");
  revalidatePath("/account/help");
}
