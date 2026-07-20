"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safeNext";
import GoogleSignInButton from "@/components/GoogleSignInButton";

// Read ?next= straight off the browser URL (used at submit time). Guarded by
// the shared safeNextPath so a malicious absolute/protocol-relative value
// never gets followed.
function currentNextPath(): string | null {
  if (typeof window === "undefined") return null;
  return safeNextPath(new URLSearchParams(window.location.search).get("next"));
}

// Unified sign-in form for everyone. After authentication we send the user to
// the page they were originally headed to (?next=, set by the middleware when
// it bounced them here), or to "/", which reads their role and routes
// homeowners to /dashboard and contractors to /pro - so a single sign-in
// works for both sides. The server wrapper (./page.tsx) handles the
// already-signed-in case before this form ever renders.
export default function SignInForm({
  next,
  authFailed,
}: {
  next: string | null;
  // Set when /auth/callback couldn't exchange the link's code for a session
  // (?error=auth_failed): usually an expired or already-used email link.
  authFailed?: boolean;
}) {
  const supabase = createClient();
  // Same ?next=, from the server-provided prop instead of window so it's
  // available for the "Get started" link below with no hydration mismatch:
  // a signed-out visitor who lands here via a gated CTA and decides to sign
  // up instead of signing in should not lose their destination (see
  // /get-started and the sign-up pages, which carry it the rest of the way).
  const getStartedHref = next
    ? `/get-started?next=${encodeURIComponent(next)}`
    : "/get-started";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setBusy(false);
      setStatus(
        /invalid login credentials/i.test(error.message)
          ? "Email or password is incorrect. New here? Get started below."
          : error.message
      );
      return;
    }

    // Back to where they were headed, or "/" for role-based routing.
    window.location.href = currentNextPath() ?? "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Sign in to Hearth
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Homeowners and contractors, same sign-in.
          </p>
        </div>

        {authFailed && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            That link expired or was already used. Sign in, or request a new
            link.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <p className="mt-1.5 text-right text-xs">
              <a
                href="/reset-password"
                className="text-bark-700 hover:underline dark:text-stone-300"
              >
                Forgot password?
              </a>
            </p>
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {status && (
          <p className="mt-4 rounded-lg bg-bark-50 p-3 text-center text-sm text-bark-700 dark:bg-bark-700/40 dark:text-stone-300">
            {status}
          </p>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
          <span className="text-xs text-stone-500 dark:text-stone-400">or</span>
          <div className="h-px flex-1 bg-stone-200 dark:bg-white/10" />
        </div>

        <GoogleSignInButton next={next} onError={setStatus} />

        <div className="mt-6 border-t border-stone-100 pt-4 text-center dark:border-white/10">
          <p className="text-sm text-stone-500 dark:text-stone-400">New to Hearth?</p>
          <a
            href={getStartedHref}
            className="btn-secondary mt-2 inline-block w-full"
          >
            Get started
          </a>
        </div>
      </div>
    </main>
  );
}
