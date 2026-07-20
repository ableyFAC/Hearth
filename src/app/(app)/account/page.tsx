import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import ProfileInfoForm from "./ProfileInfoForm";

// Edit profile: identity only (name, phone). Everything security-shaped -
// email, password, sessions, deletion - lives at /account/security, so each
// setting exists in exactly one place.
export default async function AccountPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  // Mirror the toolbar's name resolution so the field shows the same value.
  const user = await getUser();
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = profile.full_name || metaName || "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">Edit profile</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Your personal details. To edit your home, use Home Profile. For your
          email, password, or account deletion, see{" "}
          <Link
            href="/account/security"
            className="font-medium text-bark-700 hover:underline dark:text-stone-300"
          >
            Account security
          </Link>
          .
        </p>
      </div>
      <ProfileInfoForm profile={profile} name={name} />
    </div>
  );
}
