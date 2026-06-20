import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import AccountForm from "./AccountForm";

export default async function AccountPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  // Mirror the toolbar's name resolution so the field shows the same value.
  const user = await getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = profile.full_name || metaName || "";

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Account</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your personal details. To edit your home, use Home Profile.
        </p>
      </div>

      <AccountForm profile={profile} name={name} />
    </div>
  );
}
