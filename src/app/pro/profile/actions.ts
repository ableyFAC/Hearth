"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";

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
    redirect("/pro/profile");
  }
  if (next !== confirm) {
    setFlash("New passwords don't match.", "error");
    redirect("/pro/profile");
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
    redirect("/pro/profile");
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    setFlash("Couldn't save your changes. Please try again.", "error");
    redirect("/pro/profile");
  }

  setFlash("Password updated.");
  redirect("/pro/profile");
}

// Permanently delete the signed-in user's account. Uses the service role to
// remove the auth user (cascading to their public.users row and anything keyed
// to it), then clears the session.
export async function deleteAccountAction() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const admin = createAdminClient();
  // Remove the public company listing first so it can't linger as an orphaned
  // record (their wallet/reviews cascade with it; leads simply detach).
  await admin.from("contractors").delete().eq("user_id", user.id);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    setFlash("Couldn't save your changes. Please try again.", "error");
    redirect("/pro/profile");
  }

  await supabase.auth.signOut();
  setFlash("Your account has been deleted.");
  redirect("/");
}
