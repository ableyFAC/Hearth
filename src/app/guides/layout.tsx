import { createClient } from "@/lib/supabase/server";

// Shared shell for the public /guides pages: informational content meant to
// be indexed and read by anonymous search visitors (see the middleware
// allowlist in src/lib/supabase/middleware.ts). Same quiet header/footer on
// every guide so the section reads as one place, not six one-off pages.
//
// Session-aware header: a signed-in reader (with a personal AI experience one
// click away) landing on "Get started free" after clicking in from search or
// a guide link is a tonal whiplash, and dishonest besides - they already
// started. These pages are already dynamically rendered (the root layout
// reads cookies for auth), so checking auth.getUser() here adds no new
// rendering cost. getUser() is error-safe for anonymous visitors: it just
// resolves to a null user, never throws.
export default async function GuidesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-2xl items-center justify-between px-6 pt-6">
        <a
          href="/"
          className="flex items-center gap-2 font-semibold text-stone-900"
        >
          <span aria-hidden>🏡</span> Hearth
        </a>
        {user ? (
          <a
            href="/dashboard"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-hearth-400 hover:text-hearth-700"
          >
            Open your dashboard
          </a>
        ) : (
          <a
            href="/get-started"
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:border-hearth-400 hover:text-hearth-700"
          >
            Get started free
          </a>
        )}
      </header>

      {children}

      <footer className="mx-auto mt-16 max-w-2xl border-t border-stone-200 px-6 py-6 text-center">
        <p className="text-xs text-stone-400">
          🏡 Hearth · Your home, looked after
        </p>
        <p className="mt-2 text-xs">
          <a
            href="/guides"
            className="text-stone-500 hover:text-hearth-700 hover:underline"
          >
            All guides
          </a>{" "}
          ·{" "}
          <a
            href="/privacy"
            className="text-stone-500 hover:text-hearth-700 hover:underline"
          >
            Privacy
          </a>{" "}
          ·{" "}
          <a
            href="/terms"
            className="text-stone-500 hover:text-hearth-700 hover:underline"
          >
            Terms
          </a>
        </p>
      </footer>
    </div>
  );
}
