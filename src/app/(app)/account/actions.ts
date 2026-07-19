"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";
import { stripe } from "@/lib/stripe";
import { eraseUserData, type EraseSummary } from "@/lib/privacy";
import { isMissingSchemaError } from "@/lib/dbErrors";

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
  // Checkboxes only appear in FormData when checked, and an unset browser
  // value defaults to "on" - so absence means false, same as the DB default.
  const sms_consent = formData.get("sms_consent") === "on";

  if (!full_name) {
    setFlash("Please enter your name.", "error");
    redirect("/account");
  }

  // Read the current consent flag first: sms_consent_at should only move
  // forward on a false -> true transition (a fresh grant), never on a save
  // that leaves consent already-true untouched, and never on a revocation -
  // that would erase the record of when consent was originally given (TCPA -
  // see src/lib/notify.ts). Best effort: if migration 0073 hasn't reached
  // this database yet the select 42703s, `current` stays null, and
  // priorConsent just defaults to false - harmless, since the update below
  // degrades the exact same way.
  const { data: current } = await supabase
    .from("users")
    .select("sms_consent")
    .eq("id", user.id)
    .maybeSingle();
  const priorConsent = current?.sms_consent === true;

  const consentFields: { sms_consent: boolean; sms_consent_at?: string } = {
    sms_consent,
  };
  if (sms_consent && !priorConsent) {
    consentFields.sms_consent_at = new Date().toISOString();
  }

  // Name + phone + SMS consent - the public profile row (best effort). On
  // the missing-column fingerprint (migration 0073 not yet applied to this
  // database) retry without the consent fields so saving the account never
  // breaks. Same pattern as the contractor_leads insert in
  // src/app/(app)/contractors/actions.ts.
  let { error: profileError } = await supabase
    .from("users")
    .update({ full_name, phone, ...consentFields })
    .eq("id", user.id);
  if (profileError && isMissingSchemaError(profileError)) {
    ({ error: profileError } = await supabase
      .from("users")
      .update({ full_name, phone })
      .eq("id", user.id));
  }
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

// Permanently delete the signed-in homeowner's account, and everything of
// theirs that a plain auth-user delete would leave behind.
//
// eraseUserData() runs FIRST and does the work the FK cascade can't: it
// removes their uploaded files from Storage (no FK or trigger reaches those)
// and deletes the rows whose user reference is ON DELETE SET NULL rather than
// CASCADE - support messages, assistant questions, sent messages, reports -
// each of which keeps personal information in the row itself, so a nulled id
// would not de-identify them. Only then do we delete the auth user, which
// cascades their public.users row and the homes / systems keyed to it.
//
// This is the CCPA right-to-delete path (Cal. Civ. Code 1798.105), so it has
// to actually be complete. Requires re-entering the current password first
// (same bar as updatePasswordAction) so a hijacked / shared session - or a
// stray click - can't destroy the account with no proof of identity; that
// re-auth is also the request verification the regulation asks for.
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

  // Cancel any live Stripe subscription BEFORE deleting the account.
  // subscriptions.user_id is ON DELETE CASCADE (0022), so deleting the auth
  // user drops the row while the card keeps getting billed forever - and the
  // ex-user has no account left to cancel from. If a cancel fails we abort the
  // whole deletion rather than strand a paying subscription with no way out.
  const { data: subs } = await admin
    .from("subscriptions")
    .select("stripe_subscription_id, status")
    .eq("user_id", user.id);
  for (const sub of subs ?? []) {
    if (!sub.stripe_subscription_id || sub.status === "canceled") continue;
    try {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id);
    } catch {
      setFlash(
        "We couldn't cancel your subscription, so we didn't delete your account. Please try again.",
        "error"
      );
      redirect("/account");
    }
  }

  // Purge storage objects and the set-null leftovers before the cascade runs.
  // Best effort: if this throws we still delete the account rather than
  // stranding someone who asked to leave, but we don't claim it was clean.
  // A partial purge is logged (there is no audit-log table yet) so the 45-day
  // response record has something to reconstruct what was and wasn't removed.
  let summary: EraseSummary | null = null;
  try {
    summary = await eraseUserData(user.id);
  } catch (err) {
    console.error("eraseUserData threw for", user.id, err);
  }
  if (summary && summary.failed.length) {
    console.error(
      "eraseUserData partial purge for",
      user.id,
      "- not removed:",
      summary.failed
    );
  }
  // A homeowner can also have a contractor listing. contractors.user_id is ON
  // DELETE SET NULL (0005): if its delete failed the whole company record
  // would be orphaned forever once the auth user is gone. Abort before
  // deleteUser rather than leave that behind - same guard as the pro delete
  // path (src/app/pro/profile/actions.ts).
  if (summary?.contractorDeleteFailed) {
    console.error("eraseUserData contractor delete failed for", user.id);
    setFlash(
      "Couldn't fully delete your account. Please try again.",
      "error"
    );
    redirect("/account");
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    setFlash(error.message, "error");
    redirect("/account");
  }

  await supabase.auth.signOut();
  setFlash("Your account has been deleted.");
  redirect("/");
}
