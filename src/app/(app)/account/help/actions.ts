"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cappedField, cappedFieldOrNull, FIELD_MAX } from "@/lib/formFields";
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

  // Cap support submissions per user with the same fixed-window limiter as
  // onboarding's parcel lookup (migration 0068). Fails open on a DB hiccup:
  // only an explicit `allowed === false` blocks, so a rate-limiter outage
  // never stops a legit homeowner from reaching support.
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `support:${user.id}`,
    p_limit: 5,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    setFlash(
      "You've sent several messages already. Please wait a bit before sending another.",
      "error"
    );
    return;
  }

  // Same caps as the public contact form (src/app/contact/actions.ts): the
  // fields land in the same support_messages table and are read by the same
  // people, so they get the same ceilings. The inputs' maxLength is only a
  // client hint - a server action takes whatever FormData it is handed.
  const message = cappedField(formData, "message", FIELD_MAX.message);
  if (!message) {
    setFlash("Please write a short message first.", "error");
    return;
  }

  const { error } = await supabase.from("support_messages").insert({
    user_id: user?.id ?? null,
    name: cappedFieldOrNull(formData, "name", FIELD_MAX.name),
    email: cappedFieldOrNull(formData, "email", FIELD_MAX.email),
    phone: cappedFieldOrNull(formData, "phone", FIELD_MAX.phone),
    message,
  });

  if (error) setFlash("Couldn't send your message. Please try again.", "error");
  else setFlash("Thanks. We got your message and will get back to you.", "success");
  revalidatePath("/account/help");
}
