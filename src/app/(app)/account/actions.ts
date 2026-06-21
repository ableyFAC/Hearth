"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";

// Update the current homeowner's personal account: name + phone live in the
// public.users row; email and password are managed by Supabase Auth.
export async function saveAccountAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const full_name = (formData.get("full_name") as string)?.trim() || null;
  const phone = (formData.get("phone") as string)?.trim() || null;
  const email = (formData.get("email") as string)?.trim() || null;
  const password = (formData.get("password") as string) || "";

  // Name + phone - the public profile row (best effort).
  const { error: profileError } = await supabase
    .from("users")
    .update({ full_name, phone })
    .eq("id", user.id);
  if (profileError) throw new Error(profileError.message);

  // Mirror the name into auth metadata too. This is what the toolbar reads, so
  // it's reliable even if the users-table write didn't land - and it's always
  // writable (no RLS). Email/password go through Auth as well; an email change
  // triggers a confirmation link, so it isn't live until the user clicks it.
  const authChanges: {
    email?: string;
    password?: string;
    data: { full_name: string | null };
  } = { data: { full_name } };
  if (email && email !== user.email) authChanges.email = email;
  if (password) authChanges.password = password;

  const { error: authError } = await supabase.auth.updateUser(authChanges);
  if (authError) {
    setFlash(authError.message, "error");
    redirect("/account");
  }
  const emailPending = Boolean(authChanges.email);

  setFlash(
    emailPending
      ? "Saved. Check your new email to confirm the change."
      : "Account updated."
  );
  // Revalidate the whole layout tree so the toolbar (in the app layout, not the
  // page) picks up the new name everywhere.
  revalidatePath("/", "layout");
  redirect("/account");
}
