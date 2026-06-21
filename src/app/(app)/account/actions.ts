"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
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

// Change the signed-in user's password. Verifies the current password first by
// re-authenticating with a throwaway client (so the live session/cookies aren't
// touched), then checks the new password matches its confirmation.
export async function updatePasswordAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/signin");

  const current = (formData.get("current_password") as string) || "";
  const next = (formData.get("new_password") as string) || "";
  const confirm = (formData.get("confirm_password") as string) || "";

  if (next.length < 6) {
    setFlash("New password must be at least 6 characters.", "error");
    redirect("/account");
  }
  if (next !== confirm) {
    setFlash("New passwords don't match.", "error");
    redirect("/account");
  }

  // Verify the current password without disturbing the active session.
  const verifier = createJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: current,
  });
  if (verifyError) {
    setFlash("Current password is incorrect.", "error");
    redirect("/account");
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    setFlash(error.message, "error");
    redirect("/account");
  }

  setFlash("Password updated.");
  redirect("/account");
}

// Permanently delete the signed-in homeowner's account. Uses the service role
// to remove the auth user (cascading to their public.users row and the homes /
// systems keyed to it), then clears the session.
export async function deleteAccountAction() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    setFlash(error.message, "error");
    redirect("/account");
  }

  await supabase.auth.signOut();
  setFlash("Your account has been deleted.");
  redirect("/");
}
