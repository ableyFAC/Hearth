"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";
import { NOTIFICATION_CHANNELS } from "./channels";

// Save the homeowner's notification toggles onto their own user row. Each
// checkbox posts "on" when checked, so an absent value means the channel is off.
export async function saveNotificationPrefsAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const prefs: Record<string, boolean> = {};
  for (const c of NOTIFICATION_CHANNELS) {
    prefs[c.key] = formData.get(c.key) === "on";
  }

  const { error } = await supabase
    .from("users")
    .update({ notification_prefs: prefs })
    .eq("id", user.id);

  if (error) setFlash("Couldn't update your settings. Please try again.", "error");
  else setFlash("Notification preferences saved.", "success");
  revalidatePath("/account/notifications");
}
