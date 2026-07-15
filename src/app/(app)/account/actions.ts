"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";

// Update the current homeowner's identity details: name + phone live in the
// public.users row. Email and password are security concerns and are handled
// only by the /account/security actions below - this action ignores any
// email/password fields a crafted POST might include.
export async function saveAccountAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const full_name = (formData.get("full_name") as string)?.trim() || "";
  const phone = (formData.get("phone") as string)?.trim() || null;

  if (!full_name) {
    setFlash("Please enter your name.", "error");
    redirect("/account");
  }

  // Name + phone - the public profile row (best effort).
  const { error: profileError } = await supabase
    .from("users")
    .update({ full_name, phone })
    .eq("id", user.id);
  if (profileError) throw new Error(profileError.message);

  // Mirror the name into auth metadata too. This is what the toolbar reads, so
  // it's reliable even if the users-table write didn't land - and it's always
  // writable (no RLS).
  //
  // NOTE: password is deliberately NOT handled here. Password changes go only
  // through updatePasswordAction(), which re-verifies the current password.
  // Accepting a `password` field here would let a crafted POST (or a hijacked /
  // shared session) silently reset the password with no re-auth - an account-
  // takeover path - since server actions accept any FormData regardless of the
  // rendered form.
  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name },
  });
  if (authError) {
    setFlash(authError.message, "error");
    redirect("/account");
  }

  setFlash("Account updated.");
  // Revalidate the whole layout tree so the toolbar (in the app layout, not the
  // page) picks up the new name everywhere.
  revalidatePath("/", "layout");
  redirect("/account");
}

// Change the signed-in homeowner's email. Supabase sends a confirmation link
// to the new address; nothing changes until it's clicked, so this is safe to
// offer without a current-password gate (the link itself is the proof).
export async function updateEmailAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const email = (formData.get("email") as string)?.trim() || "";
  if (!email || !email.includes("@")) {
    setFlash("That email address doesn't look right.", "error");
    redirect("/account/security");
  }
  if (email === user.email) {
    setFlash("That's already your sign-in email.", "error");
    redirect("/account/security");
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    setFlash(error.message, "error");
    redirect("/account/security");
  }

  setFlash("Check your new email to confirm the change.");
  redirect("/account/security");
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
    redirect("/account/security");
  }
  if (next !== confirm) {
    setFlash("New passwords don't match.", "error");
    redirect("/account/security");
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
    redirect("/account/security");
  }

  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    setFlash(error.message, "error");
    redirect("/account/security");
  }

  setFlash("Password updated.");
  redirect("/account/security");
}

// End every session except this one by revoking the other refresh tokens.
// Supabase doesn't expose a per-device session list to us, so this is the
// whole feature: one honest button instead of a fake device list.
export async function signOutOthersAction() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    setFlash(error.message, "error");
    redirect("/account/security");
  }

  setFlash("Signed out everywhere else. This device stays signed in.");
  redirect("/account/security");
}

// Permanently delete the signed-in homeowner's account. Uses the service role
// to remove the auth user (cascading to their public.users row and the homes /
// systems keyed to it), then clears the session. Requires re-entering the
// current password first (same bar as updatePasswordAction) so a hijacked /
// shared session - or a stray click - can't destroy the account with no proof
// of identity.
export async function deleteAccountAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/signin");

  const current = (formData.get("current_password") as string) || "";
  if (!current) {
    setFlash("Current password is incorrect.", "error");
    redirect("/account/security");
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
    redirect("/account/security");
  }

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
