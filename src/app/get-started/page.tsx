import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getRole } from "@/lib/contractor";
import { safeNextPath } from "@/lib/safeNext";
import { Home, Hammer } from "lucide-react";

export const metadata: Metadata = {
  // The root layout's title template appends "| Hearth"; don't repeat it here.
  title: "Get started",
  description:
    "Tell Hearth who you are: homeowners get a home that's looked after, pros get leads with the fee shown up front. Free to start, no card needed.",
};

// Role chooser for NEW users. After "Get started" they pick homeowner or
// contractor and we send them to the matching sign-up (which tags the account's
// role). Already-signed-in users with a known role skip straight into their
// side of the app; a signed-in user with no role yet still gets the chooser.
//
// ?next=: carried in from /signin (a signed-out visitor who hit a gated CTA,
// bounced to sign-in, then chose to sign up instead) and threaded through to
// whichever sign-up page they pick, so their original destination survives
// the "who are you?" fork instead of being dropped here.
export default async function GetStarted({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const next = safeNextPath(
    typeof searchParams?.next === "string" ? searchParams.next : null
  );
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const role = await getRole();
    if (role) redirect(next ?? (role === "contractor" ? "/pro" : "/dashboard"));
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
        Who are you?
      </h1>
      <p className="mt-3 text-stone-600 dark:text-stone-300">
        Choose how you&apos;d like to use Hearth.
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
        Free, about 30 seconds, no card needed.
      </p>

      <div className="mt-10 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        <a
          href={`/homeowner-signup${nextQuery}`}
          className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-12 shadow-sm transition hover:border-bark-500 hover:shadow-md dark:border-white/10 dark:bg-stone-800"
        >
          <Home className="h-9 w-9 text-bark-700 dark:text-stone-400" aria-hidden="true" />
          <div className="mt-4 text-lg font-medium text-stone-900 dark:text-stone-100">
            I&apos;m a homeowner
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Track your home and find a pro.
          </p>
        </a>

        <a
          href={`/contractor-signup${nextQuery}`}
          className="flex flex-col items-center justify-center rounded-2xl border border-stone-200 bg-white px-6 py-12 shadow-sm transition hover:border-bark-500 hover:shadow-md dark:border-white/10 dark:bg-stone-800"
        >
          <Hammer className="h-9 w-9 text-bark-700 dark:text-stone-400" aria-hidden="true" />
          <div className="mt-4 text-lg font-medium text-stone-900 dark:text-stone-100">
            I&apos;m a contractor
          </div>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Get matched with homeowner leads.
          </p>
        </a>
      </div>

      <p className="mt-8 text-sm text-stone-500 dark:text-stone-400">
        Already have an account?{" "}
        <a
          href={`/signin${nextQuery}`}
          className="font-medium text-bark-700 hover:underline dark:text-stone-300"
        >
          Sign in
        </a>
      </p>
      <a href="/" className="mt-3 text-sm text-stone-500 hover:underline dark:text-stone-400">
        ← Back
      </a>
    </main>
  );
}
