import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/user";
import NotificationPrefsForm from "./NotificationPrefsForm";

export default async function NotificationsPage() {
  const profile = await getUserProfile();
  if (!profile) redirect("/signin");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Notifications</h1>
        <p className="mt-1 text-sm text-stone-500">
          Choose what Hearth notifies you about. You can change these at any time.
        </p>
      </div>
      <NotificationPrefsForm prefs={profile.notification_prefs} />
    </div>
  );
}
