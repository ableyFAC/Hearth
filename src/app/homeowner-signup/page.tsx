"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safeNext";

// Real per-user sign-up. Creates a Supabase Auth account from the user's email
// + password. If email confirmation is OFF in Supabase, the user is signed in
// immediately and sent to claim their home; if it's ON, we tell them to verify.
//
// ?next=: carried in from /get-started (originally from /signin, ultimately
// from the middleware bouncing a signed-out visitor off a gated page). Read
// via the searchParams prop rather than window/useSearchParams so it's
// available with no hydration mismatch or Suspense boundary. Passed through
// to /onboarding on success; the claimed-home gate still routes a brand-new
// homeowner through onboarding first (see onboarding/actions.ts), but their
// destination isn't lost along the way.
export default function HomeownerSignUpPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const supabase = createClient();
  const next = safeNextPath(
    typeof searchParams?.next === "string" ? searchParams.next : null
  );
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }

    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role: "homeowner", full_name: fullName.trim() } },
    });

    if (error) {
      setBusy(false);
      setStatus(
        /registered|exists/i.test(error.message)
          ? "An account with this email already exists. Try signing in instead."
          : error.message
      );
      return;
    }

    // Confirmation OFF → a session is returned immediately → go claim a home.
    if (data.session) {
      window.location.href = `/onboarding${nextQuery}`;
      return;
    }

    // Confirmation ON → no session yet; the user must verify their email first.
    setBusy(false);
    setStatus(
      "Account created! Check your email to confirm it, then come back and sign in."
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="text-3xl">🏡</div>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Create your account
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Start tracking your home with Hearth.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="label" htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              className="input"
              type="text"
              autoComplete="name"
              placeholder="e.g. Alex Rivera"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
              required
            />
          </div>
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
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Creating account…" : "Sign up"}
          </button>
          <p className="text-center text-xs text-stone-400">
            By creating an account you agree to the{" "}
            <a href="/terms" className="text-hearth-700 hover:underline">
              Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" className="text-hearth-700 hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </form>

        {status && (
          <p className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800">
            {status}
          </p>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4 text-center">
          <p className="text-sm text-stone-500">Already have an account?</p>
          <a
            href={`/signin${nextQuery}`}
            className="btn-secondary mt-2 inline-block w-full"
          >
            Sign in
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-stone-400">
        Are you a contractor?{" "}
        <a
          href={`/contractor-signup${nextQuery}`}
          className="text-hearth-700 hover:underline"
        >
          Sign up for Hearth for Pros
        </a>
        .
      </p>
    </main>
  );
}
