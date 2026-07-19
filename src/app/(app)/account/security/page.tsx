import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import AccountSecurityPanel from "@/components/AccountSecurityPanel";
import {
  updateEmailAction,
  updatePasswordAction,
  signOutOthersAction,
  deleteAccountAction,
} from "../actions";

// The only home of account security for homeowners: email, password,
// sessions, data export, and deletion. Identity (name, phone) lives at
// /account, so nothing here is duplicated there.
export default async function AccountSecurityPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  const user = await getUser();
  const email = user?.email || profile.email || null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Account security</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Your sign-in email, password, sessions, and account deletion.
        </p>
      </div>
      <AccountSecurityPanel
        email={email}
        updateEmailAction={updateEmailAction}
        updatePasswordAction={updatePasswordAction}
        signOutOthersAction={signOutOthersAction}
        deleteAccountAction={deleteAccountAction}
        privacyHref="/account/privacy"
      />
    </div>
  );
}
