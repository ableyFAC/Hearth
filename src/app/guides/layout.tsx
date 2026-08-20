import Link from "next/link";
import { getVerifiedUser } from "@/lib/auth";
import Logo from "@/components/Logo";

// Shared shell for the public /guides pages: informational content meant to
// be indexed and read by anonymous search visitors (see the middleware
// allowlist in src/lib/supabase/middleware.ts). Same quiet header/footer on
// every guide so the section reads as one place, not six one-off pages.
//
// Session-aware header: a signed-in reader (with a personal AI experience one
// click away) landing on "Get started free" after clicking in from search or
// a guide link is a tonal whiplash, and dishonest besides - they already
// started.
//
// STAYS DYNAMIC, and this is the one thing keeping the whole /guides section
// (11 guide pages plus the index) off static generation. The root layout no
// longer reads the flash cookie (see src/app/layout.tsx and FlashToast), so
// this getVerifiedUser() call - and the second session read inside GuideCta at
// the foot of every guide - is now the sole blocker. `export const revalidate`
// on the guide pages would do nothing while this layout reads the session: a
// layout's dynamic read opts its whole subtree out.
//
// Deliberately not changed. Guides are exactly where a signed-in reader lands
// from search, and the header CTA is the thing this layout exists to get right:
// prerendering it would ship "Get started free" to someone who already has an
// account and swap it after hydration. The correct fix, if the static win is
// ever wanted, is to resolve the session in the browser inside one small client
// component shared by this header and GuideCta, so the guide BODY prerenders
// and only the CTA is deferred. That is a bigger change than a revalidate
// export and it belongs in its own pass.
//
// The honest accounting of what the check costs today: it does cost something.
// These pages are dynamically rendered, so no static-generation opportunity is
// lost as long as that stays true, but the auth check
// itself is a real network round trip to Supabase's auth server, and it sits
// on the blocking path in front of the guide's own content. What used to make
// it expensive was paying for it more than once: this layout asked, then
// GuideCta asked AGAIN further down the same render, sequentially, and the
// middleware had already asked before either of them ran. Three round trips
// for one question. Now the middleware skips /guides entirely (it is on the
// public allowlist, see src/lib/supabase/middleware.ts) and this and GuideCta
// share one request-cached answer, so a guide render pays the round trip once.
// getVerifiedUser() is error-safe for anonymous visitors: it just resolves to
// a null user, never throws.
export default async function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getVerifiedUser();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold text-stone-900 dark:text-stone-100"
        >
          <Logo className="h-6 w-6 text-bark-700 dark:text-stone-400" /> Hearth
        </Link>
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-bark-500 hover:text-bark-700 dark:border-white/10 dark:text-stone-300 dark:hover:text-stone-300"
          >
            Open your dashboard
          </Link>
        ) : (
          <Link
            href="/get-started"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-bark-500 hover:text-bark-700 dark:border-white/10 dark:text-stone-300 dark:hover:text-stone-300"
          >
            Get started free
          </Link>
        )}
      </header>

      {children}

      <footer className="mx-auto mt-16 max-w-2xl border-t border-stone-200 px-6 py-6 text-center dark:border-white/10">
        <p className="inline-flex w-full items-center justify-center gap-1.5 text-xs text-stone-500 dark:text-stone-400">
          <Logo className="h-4 w-4 text-bark-700 dark:text-stone-400" /> Hearth · Your home, looked after
        </p>
        <p className="mt-2 text-xs">
          <Link
            href="/guides"
            className="text-stone-500 hover:text-bark-700 hover:underline dark:text-stone-400 dark:hover:text-stone-300"
          >
            All guides
          </Link>{" "}
          ·{" "}
          <Link
            href="/privacy"
            className="text-stone-500 hover:text-bark-700 hover:underline dark:text-stone-400 dark:hover:text-stone-300"
          >
            Privacy
          </Link>{" "}
          ·{" "}
          <Link
            href="/terms"
            className="text-stone-500 hover:text-bark-700 hover:underline dark:text-stone-400 dark:hover:text-stone-300"
          >
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}
