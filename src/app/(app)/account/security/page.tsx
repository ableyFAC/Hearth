import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import AccountSecurity from "../AccountSecurity";

export default async function AccountSecurityPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Account security</h1>
        <p className="mt-1 text-sm text-stone-500">
          Update your password and manage your account.
        </p>
      </div>
      <AccountSecurity />
    </div>
  );
}
