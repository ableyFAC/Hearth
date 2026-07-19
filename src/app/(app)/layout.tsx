import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getActiveProperty, getProperties } from "@/lib/property";
import { getRole } from "@/lib/contractor";
import { getUserProfile } from "@/lib/user";
import { getUser } from "@/lib/auth";
import { hasPlus } from "@/lib/subscription";
import Nav from "@/components/Nav";
import NewMessageNotifier from "@/components/NewMessageNotifier";
import AskHearthDock from "@/components/AskHearthDock";
import { getProactiveGreeting } from "@/lib/greeting";

// The proactive greeting costs ~3 extra DB queries (issues, home_systems,
// maintenance_tasks) beyond what the shell already needs, and it only feeds
// the Ask Hearth dock's opening line - the dock itself stays closed until the
// user clicks it. Computing it here, wrapped in Suspense, lets Next.js flush
// the Nav + page content as soon as they're ready instead of holding first
// byte for a value nothing above the fold needs. The dock still receives the
// exact same greeting string once it resolves; only its arrival is deferred.
async function AskHearthDockWithGreeting() {
  const greeting = await getProactiveGreeting();
  return <AskHearthDock greeting={greeting} />;
}

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
          item - computed off the blocking path, see AskHearthDockWithGreeting
          above. fallback=null: the FAB itself doesn't reference greeting (it
          only reaches AskHearth once opened), so nothing is lost by letting it
          mount a beat after the rest of the shell. */}
      <Suspense fallback={null}>
        <AskHearthDockWithGreeting />
      </Suspense>
      <NewMessageNotifier role="homeowner" />
    </div>
  );
}
