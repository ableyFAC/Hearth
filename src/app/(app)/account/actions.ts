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

  // Name + phone — the public profile row.
  const { error: profileError } = await supabase
    .from("users")
    .update({ full_name, phone })
    .eq("id", user.id);
  if (profileError) throw new Error(profileError.message);

  // Email and password go through Auth. Email changes trigger a confirmation
  // link to the new address, so the change isn't live until they click it.
  const authChanges: { email?: string; password?: string } = {};
  if (email && email !== user.email) authChanges.email = email;
  if (password) authChanges.password = password;

  let emailPending = false;
  if (Object.keys(authChanges).length > 0) {
    const { error: authError } = await supabase.auth.updateUser(authChanges);
    if (authError) {
      setFlash(authError.message, "error");
      redirect("/account");
    }
    emailPending = Boolean(authChanges.email);
  }

  setFlash(
    emailPending
      ? "Saved. Check your new email to confirm the change."
      : "Account updated."
  );
  revalidatePath("/account");
  redirect("/account");
}
