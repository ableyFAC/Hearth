import { redirect } from "next/navigation";
import { getActiveProperty, getProperties } from "@/lib/property";
import { getRole } from "@/lib/contractor";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import NewMessageNotifier from "@/components/NewMessageNotifier";

// Shell for all signed-in homeowner screens. Pros are bounced to their own area;
// then we guarantee a claimed home exists.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await getRole()) === "contractor") redirect("/pro");

  const [active, homes, profile, user] = await Promise.all([
    getActiveProperty(),
    getProperties(),
    getUserProfile(),
    getUser(),
  ]);
  if (!active) redirect("/onboarding");

  // Prefer the name from auth metadata (set at sign-up, always present) and fall
  // back to the profile row, then email.
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = metaName || profile?.full_name || profile?.email || null;

  return (
    <div className="min-h-screen">
      <Nav homes={homes} activeId={active.id} name={name} />
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <NewMessageNotifier role="homeowner" />
    </div>
  );
}
