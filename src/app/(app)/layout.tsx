import { redirect } from "next/navigation";
import { getActiveProperty, getProperties } from "@/lib/property";
import { getRole } from "@/lib/contractor";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import { hasPlus } from "@/lib/subscription";
import Nav from "@/components/Nav";
import NewMessageNotifier from "@/components/NewMessageNotifier";
import AskHearthDock from "@/components/AskHearthDock";

// Shell for all signed-in homeowner screens. Pros are bounced to their own area;
// then we guarantee a claimed home exists.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if ((await getRole()) === "contractor") redirect("/pro");

  const [active, homes, profile, user, plus] = await Promise.all([
    getActiveProperty(),
    getProperties(),
    getUserProfile(),
    getUser(),
    hasPlus(),
  ]);
  if (!active) redirect("/onboarding");

  // Prefer the name from auth metadata (set at sign-up, always present) and fall
  // back to the profile row, then email.
  const metaName = (user?.user_metadata?.full_name as string | undefined)?.trim();
  const name = metaName || profile?.full_name || profile?.email || null;

  return (
    <div className="min-h-screen">
      <Nav homes={homes} activeId={active.id} name={name} hasPlus={plus} />
      {/* Extra bottom padding on phones keeps content clear of the fixed
          Ask Hearth dock. */}
      <main className="mx-auto max-w-5xl px-6 pb-24 pt-8 sm:pb-8">
        {children}
      </main>
      {/* A personalized opener so Ask Hearth speaks first about the home's top
          item. The layout no longer computes it: getProactiveGreeting() costs
          three DB queries (issues, home_systems, maintenance_tasks, two of
          which the Home page reads again for itself), and it was paying them
          on EVERY signed-in page view to produce a string that is only ever
          read if someone opens the dock. Suspense kept it off the critical
          path for first byte, but the queries still ran every time.
          The dock now fetches it from /api/ask-greeting on first open, and
          prefetches on hover, so a page view that never touches Ask Hearth
          costs nothing at all. */}
      <AskHearthDock greetingUrl="/api/ask-greeting" />
      <NewMessageNotifier role="homeowner" />
    </div>
  );
}
