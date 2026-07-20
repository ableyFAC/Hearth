import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import AccountSecurityPanel from "@/components/AccountSecurityPanel";
import AccountTabs from "../AccountTabs";
import {
  updateEmailAction,
  updatePasswordAction,
  signOutOthersAction,
  deleteAccountAction,
} from "../actions";

// The only home of account security for homeowners: email, password,
// sessions, data export, and deletion. Identity (name, phone) lives at
// /account, so nothing here is duplicated there. Rendered as the second tab
// of the Edit profile shell (see AccountTabs), but kept at its own URL so
// deep links and redirect("/account/security") calls still resolve.
export default async function AccountSecurityPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  const user = await getUser();
  const email = user?.email || profile.email || null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AccountTabs active="security" />
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
