"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { setFlash } from "@/lib/flash";

const HOUSEHOLD_PATH = "/account/household";
const MAX_MEMBERS_PER_HOME = 4;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Invite someone to share day to day access to a home the caller owns. RLS's
// "household_members owner insert" policy re-checks ownership server side, so
// this validation is about friendly error messages, not the real gate.
export async function inviteMemberAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const propertyId = (formData.get("property_id") as string) || "";
  const email = ((formData.get("email") as string) || "").trim().toLowerCase();

  if (!propertyId) {
    setFlash("Choose a home to invite someone to.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  if (!EMAIL_RE.test(email)) {
    setFlash("Enter a valid email address.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  if (user.email && email === user.email.trim().toLowerCase()) {
    setFlash("You can't invite yourself.", "error");
    redirect(HOUSEHOLD_PATH);
  }

  // App side cap: count invited plus active rows on this home before insert.
  const { count, error: countError } = await supabase
    .from("household_members")
    .select("id", { count: "exact", head: true })
    .eq("property_id", propertyId);
  if (countError) {
    setFlash("Couldn't send the invite. Please try again.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  if ((count ?? 0) >= MAX_MEMBERS_PER_HOME) {
    setFlash(
      `This home already has the maximum of ${MAX_MEMBERS_PER_HOME} members.`,
      "error"
    );
    redirect(HOUSEHOLD_PATH);
  }

  const { error } = await supabase.from("household_members").insert({
    property_id: propertyId,
    invited_email: email,
    invited_by: user.id,
  });

  if (error) {
    // 23505: the unique index on (property_id, lower(invited_email)) caught a
    // duplicate invite, either already pending or already an active member.
    if (error.code === "23505") {
      setFlash("That email has already been invited to this home.", "error");
    } else {
      setFlash("Couldn't send the invite. Please try again.", "error");
    }
    redirect(HOUSEHOLD_PATH);
  }

  setFlash(
    `Invited ${email}. If they don't have a Hearth account yet, the invite waits until they sign up with that email.`
  );
  revalidatePath(HOUSEHOLD_PATH);
  redirect(HOUSEHOLD_PATH);
}

// Remove a member or cancel a pending invite. Only the property's owner can
// reach a row that still belongs to someone else, enforced by the
// "household_members owner delete" policy.
export async function removeMemberAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") as string) || "";
  const { error } = await supabase.from("household_members").delete().eq("id", id);
  if (error) {
    setFlash("Couldn't remove that person. Please try again.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  setFlash("Removed from the home.");
  revalidatePath(HOUSEHOLD_PATH);
  redirect(HOUSEHOLD_PATH);
}

// Accept an invite addressed to the caller's own email. The
// "household_members invitee claim" policy is what actually enforces that
// this can only move a legitimate invite (status invited, no member yet, the
// caller's own email) into an active membership tied to the caller's uid.
export async function acceptInviteAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") as string) || "";
  const { error } = await supabase
    .from("household_members")
    .update({
      status: "active",
      member_user_id: user.id,
      accepted_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    setFlash("Couldn't accept that invite. Please try again.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  setFlash("You're in. That home now shows up in your homes list.");
  revalidatePath("/", "layout");
  redirect(HOUSEHOLD_PATH);
}

// Decline an invite before claiming it, covered by the
// "household_members invitee decline" policy.
export async function declineInviteAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") as string) || "";
  const { error } = await supabase.from("household_members").delete().eq("id", id);
  if (error) {
    setFlash("Couldn't decline that invite. Please try again.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  setFlash("Invite declined.");
  revalidatePath(HOUSEHOLD_PATH);
  redirect(HOUSEHOLD_PATH);
}

// Leave a home the caller is an active member of, covered by the
// "household_members member leave" policy (member_user_id = auth.uid()).
export async function leaveHomeAction(formData: FormData) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/signin");

  const id = (formData.get("id") as string) || "";
  const { error } = await supabase.from("household_members").delete().eq("id", id);
  if (error) {
    setFlash("Couldn't leave that home. Please try again.", "error");
    redirect(HOUSEHOLD_PATH);
  }
  setFlash("You've left that home.");
  revalidatePath("/", "layout");
  redirect(HOUSEHOLD_PATH);
}
