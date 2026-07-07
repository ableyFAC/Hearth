"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Only ever follow a RELATIVE path from ?next=: an absolute URL (or a
// protocol-relative //host) in that param would be an open redirect an
// attacker could use to bounce a signed-in victim to a look-alike site.
function safeNextPath(): string | null {
  if (typeof window === "undefined") return null;
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return null;
}

// Unified sign-in for everyone. After authentication we send the user to the
// page they were originally headed to (?next=, set by the middleware when it
// bounced them here), or to "/", which reads their role and routes
// homeowners to /dashboard and contractors to /pro - so a single sign-in
// works for both sides.
export default function SignInPage() {
  const supabase = createClient();
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
    window.location.href = safeNextPath() ?? "/";
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="text-3xl">🏡</div>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Sign in to Hearth
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Homeowners and contractors, same sign-in.
          </p>
        </div>

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
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {status && (
          <p className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800">
            {status}
          </p>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4 text-center">
          <p className="text-sm text-stone-500">New to Hearth?</p>
          <a
            href="/get-started"
            className="btn-secondary mt-2 inline-block w-full"
          >
            Get started
          </a>
        </div>
      </div>
    </main>
  );
}
