import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import AccountTabs from "./AccountTabs";

export default async function AccountPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  // Mirror the toolbar's name resolution so the field shows the same value.
  const user = await getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = profile.full_name || metaName || "";

  return (
    <div className="mx-auto max-w-2xl">
      <AccountTabs profile={profile} name={name} />
    </div>
  );
}
