"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createJsClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentContractor } from "@/lib/contractor";
import { hasProPlan } from "@/lib/subscription";
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

// Change the signed-in pro's email. Supabase sends a confirmation link to the
// new address; nothing changes until it's clicked, so this is safe to offer
// without a current-password gate (the link itself is the proof).
export async function updateEmailAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const email = (formData.get("email") as string)?.trim() || "";
  if (!email || !email.includes("@")) {
    setFlash("That email address doesn't look right.", "error");
    redirect("/pro/profile");
  }
  if (email === user.email) {
    setFlash("That's already your sign-in email.", "error");
    redirect("/pro/profile");
  }

  const { error } = await supabase.auth.updateUser({ email });
  if (error) {
    setFlash(error.message, "error");
    redirect("/pro/profile");
  }

  setFlash("Check your new email to confirm the change.");
  redirect("/pro/profile");
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
    redirect("/pro/profile");
  }

  setFlash("Signed out everywhere else. This device stays signed in.");
  redirect("/pro/profile");
}

// Save the Pro-member extras for the public page (/p/<id>): logo, about, and
// the private license/insurance vault that powers the "on file" badge. The
// vault details never appear publicly; public_pro_profile (0033) reduces them
// to booleans. Everything is validated here, membership is re-checked
// server-side, and a failed write (e.g. migration 0033 not applied yet)
// degrades to a soft flash instead of crashing.
export async function savePublicPageAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  if (!(await hasProPlan())) {
    setFlash("Page extras are a Hearth Pro member perk.", "error");
    redirect("/pro/profile");
  }

  const str = (name: string) => String(formData.get(name) ?? "").trim();

  // About: cap server-side; the textarea's maxLength is only a hint.
  const about = str("about");
  if (about.length > 1000) {
    setFlash("The about section must be 1,000 characters or fewer.", "error");
    redirect("/pro/profile");
  }

  // Logo: only accept a URL that points inside THIS contractor's folder of the
  // pro-logos bucket, so the column can't be pointed at an arbitrary image.
  const logoRaw = str("logo_url");
  const logo_url =
    logoRaw && logoRaw.includes(`/pro-logos/${contractor.id}/`)
      ? logoRaw
      : null;

  // Vault fields. The license number is locked once set (same rule as the
  // profile form), so a missing read-only field can't wipe or swap it.
  const license_number = contractor.license_number
    ? contractor.license_number
    : str("license_number").slice(0, 60) || null;

  const stateRaw = str("license_state").toUpperCase();
  if (stateRaw && !/^[A-Z]{2}$/.test(stateRaw)) {
    setFlash("License state should be a 2-letter code, like CA.", "error");
    redirect("/pro/profile");
  }

  const insurance_carrier = str("insurance_carrier").slice(0, 120) || null;

  const expiresRaw = str("insurance_expires");
  if (expiresRaw && Number.isNaN(new Date(expiresRaw).getTime())) {
    setFlash("That insurance expiry date doesn't look right.", "error");
    redirect("/pro/profile");
  }

  const fields: Record<string, unknown> = {
    about: about || null,
    license_number,
    license_state: stateRaw || null,
    insurance_carrier,
    insurance_expires: expiresRaw || null,
  };
  // Only overwrite the logo when a new upload came through, so saving the
  // form without touching the logo never clears it.
  if (logo_url) fields.logo_url = logo_url;
  // Stamp the vault whenever it holds anything, so the badge has a "when".
  if (license_number || stateRaw || insurance_carrier || expiresRaw) {
    fields.license_insurance_updated_at = new Date().toISOString();
  }

  // Cast: the 0033 columns aren't in the generated types (database.types.ts
  // is not regenerated here).
  const { error } = await (supabase.from("contractors") as any)
    .update(fields)
    .eq("id", contractor.id);
  if (error) {
    setFlash("Couldn't save your page extras. Please try again.", "error");
    redirect("/pro/profile");
  }

  setFlash("Public page updated.");
  revalidatePath("/pro/profile");
  redirect("/pro/profile");
}

// Permanently delete the signed-in user's account. Uses the service role to
// remove the auth user (cascading to their public.users row and anything keyed
// to it), then clears the session. Requires re-entering the current password
// first (same bar as updatePasswordAction) so a hijacked / shared session - or
// a stray click - can't destroy the account with no proof of identity.
export async function deleteAccountAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) redirect("/signin");

  const current = (formData.get("current_password") as string) || "";
  if (!current) {
    setFlash("Current password is incorrect.", "error");
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

  const admin = createAdminClient();
  // Remove the public company listing first so it can't linger as an orphaned
  // record (their wallet/reviews cascade with it; leads simply detach).
  const { error: listingError } = await admin
    .from("contractors")
    .delete()
    .eq("user_id", user.id);
  if (listingError) {
    setFlash("Couldn't save your changes. Please try again.", "error");
    redirect("/pro/profile");
  }

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    setFlash("Couldn't save your changes. Please try again.", "error");
    redirect("/pro/profile");
  }

  await supabase.auth.signOut();
  setFlash("Your account has been deleted.");
  redirect("/");
}
