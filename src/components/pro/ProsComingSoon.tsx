import Link from "next/link";
import Logo from "@/components/Logo";
import ProWaitlistForm from "@/components/pro/ProWaitlistForm";

// The ONE page every closed contractor door renders during the homeowner
// preview (src/lib/previewMode.ts): /pros, /contractor-signup,
// /pro/onboarding, the pro role choice on /welcome/role, and the pro shell
// itself for a contractor who already has an account.
//
// A server component on purpose. Only the form below needs client state, so
// the heading, the copy and the sign-out escape hatch ship as plain HTML and
// this page renders on a signed-out visitor with no JavaScript at all.
//
// NO PITCH, NO PRICES, NO PROMISES. This page is what a lawyer reads if they
// open /pros during the review, so it says the one true thing - the pro side
// is not open yet - and collects an email. Nothing here may mention lead fees,
// memberships, guarantees or verification.
export default function ProsComingSoon({
  // Rendered for a signed-in contractor whose shell we are standing in front
  // of (pro/layout.tsx): without it a pro who lands here has no way out of
  // their own account. Off by default, since the public doors (/pros,
  // /contractor-signup) are reached signed-out.
  showSignOut = false,
  // Where the waitlist row records this signup from, so the team can tell a
  // /pros visitor apart from a contractor who was already part-way through
  // onboarding. Display/analytics only; it decides nothing.
  source = "pros",
  // The signed-in viewer's OWN homeowner side, or null when nobody is signed
  // in. Supplied by the two callers that have a session in hand
  // (pro/layout.tsx, pro/onboarding/page.tsx) via homeownerLanding() in
  // src/lib/previewModeServer.ts, which is the single definition of this pair
  // of destinations: /dashboard for an account that has a home, /onboarding
  // for one that does not.
  //
  // NULL IS THE SIGNED-OUT DEFAULT, and it is what keeps the public doors
  // (/pros, /contractor-signup) exactly as they were: no button, and both the
  // logo and the footer link still point at the marketing root. This component
  // decides nothing about who is signed in - it only renders what it is told.
  homeownerHref = null,
  // Does that homeowner side already exist? Only the WORDS depend on it: an
  // account with a home is going back to something, an account without one is
  // starting the first-home setup on the same login. The destination itself is
  // already baked into homeownerHref.
  hasHome = false,
}: {
  showSignOut?: boolean;
  source?: string;
  homeownerHref?: string | null;
  hasHome?: boolean;
}) {
  // Signed in, so "OakTend" and "Back to OakTend" mean THEIR OakTend. Pointing
  // those at "/" was the whole trap: the root page sends a signed-in user to
  // landingFor(sides), which answers "/pro" for an account that prefers the
  // contractor side, so both links looked like a page refresh and a dual-sided
  // account could not reach the home it owns. Signed-out visitors keep "/",
  // which for them is the public landing page.
  const homeLink = homeownerHref ?? "/";

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col px-6 py-12">
      <header className="flex items-center justify-between gap-4">
        <Link
          href={homeLink}
          className="flex items-center gap-2 text-lg font-semibold text-stone-900 dark:text-stone-100"
        >
          <Logo className="h-6 w-6 text-oaktend-700 dark:text-oaktend-400" />
          <span>
            OakTend{" "}
            <span className="font-normal text-stone-500 dark:text-stone-400">
              for Pros
            </span>
          </span>
        </Link>
        {showSignOut && (
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="text-sm text-stone-500 underline hover:text-stone-700 max-sm:inline-flex max-sm:min-h-11 max-sm:items-center dark:text-stone-400 dark:hover:text-stone-200"
            >
              Sign out
            </button>
          </form>
        )}
      </header>

      <main id="main" className="mt-12">
        <h1 className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
          Pros are coming soon
        </h1>
        <p className="mt-4 text-stone-600 dark:text-stone-300">
          OakTend for Pros opens after our homeowner preview.
        </p>
        <p className="mt-2 text-stone-600 dark:text-stone-300">
          Leave your email and we&rsquo;ll tell you first.
        </p>

        {/* THE WAY OUT, above the form on purpose: a signed-in pro who is also
            a homeowner (or could be) came here to use OakTend, not to join a
            waitlist for an account they already have. Still no pitch and no
            prices - it names a destination inside the product and nothing
            else, so the page a lawyer opens is unchanged in substance. */}
        {homeownerHref && (
          <div className="mt-8">
            <Link href={homeownerHref} className="btn-primary">
              {hasHome
                ? "Go to your homeowner account"
                : "Use OakTend as a homeowner"}
            </Link>
            {/* One line, and only for the account that has no home side yet:
                "use OakTend as a homeowner" must not read as "give up your pro
                signup". Nothing is deleted when they go - the contractors row
                and the waitlist email both stay exactly where they are. */}
            {!hasHome && (
              <p className="mt-2 text-sm text-stone-500 dark:text-stone-400">
                Your pro profile stays saved for when Pros open.
              </p>
            )}
          </div>
        )}

        <div className="mt-8">
          <ProWaitlistForm source={source} />
        </div>
      </main>

      <footer className="mt-auto pt-12 text-sm text-stone-500 dark:text-stone-400">
        <Link href={homeLink} className="underline hover:text-stone-700 dark:hover:text-stone-200">
          Back to OakTend
        </Link>
      </footer>
    </div>
  );
}
