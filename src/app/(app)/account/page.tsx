import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import AccountForm from "./AccountForm";

export default async function AccountPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Account</h1>
        <p className="mt-1 text-sm text-stone-500">
          Your personal details. To edit your home, use Home Profile.
        </p>
      </div>

      <AccountForm profile={profile} />
    </div>
  );
}
