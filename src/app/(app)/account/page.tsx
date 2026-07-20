import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import { getOrCreateReferralCode } from "@/lib/referralCode";
import ProfileInfoForm from "./ProfileInfoForm";
import AccountTabs from "./AccountTabs";
import InviteNeighbor from "./InviteNeighbor";

// Edit profile: identity only (name, phone). Everything security-shaped -
// email, password, sessions, deletion - still lives at /account/security, now
// presented as a sibling tab of Edit profile (see AccountTabs), so each
// setting exists in exactly one place.
export default async function AccountPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  // Mirror the toolbar's name resolution so the field shows the same value.
  const user = await getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = profile.full_name || metaName || "";

  // Lazily produce this homeowner's invite link. Null (feature not live on
  // this DB yet, or an unusual failure) just hides the invite card - it never
  // affects the rest of the account page.
  const inviteCode = await getOrCreateReferralCode();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <AccountTabs active="profile" />
      <ProfileInfoForm profile={profile} name={name} />
      {inviteCode && <InviteNeighbor code={inviteCode} />}
    </div>
  );
}
