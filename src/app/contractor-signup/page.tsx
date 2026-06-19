"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Real per-user contractor sign-up. Creates a Supabase Auth account tagged with
// role=contractor, then sends them to set up their company. If email
// confirmation is OFF in Supabase they're signed in immediately; if ON, we ask
// them to verify first.
export default function ContractorSignUpPage() {
  const supabase = createClient();
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
      options: { data: { role: "contractor" } },
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

    // Confirmation OFF → session returned → go set up the company.
    if (data.session) {
      window.location.href = "/pro/onboarding";
      return;
    }

    // Confirmation ON → must verify email first.
    setBusy(false);
    setStatus(
      "Account created! Check your email to confirm it, then come back and sign in."
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="text-3xl">🛠️</div>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Join Hearth for Pros
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Create your contractor account to start receiving leads.
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
              placeholder="you@company.com"
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
        </form>

        {status && (
          <p className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800">
            {status}
          </p>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4 text-center">
          <p className="text-sm text-stone-500">Already have an account?</p>
          <a href="/signin" className="btn-secondary mt-2 inline-block w-full">
            Sign in
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-stone-400">
        Want to track your own home instead?{" "}
        <a href="/homeowner-signup" className="text-hearth-700 hover:underline">
          Sign up as a homeowner
        </a>
        .
      </p>
    </main>
  );
}
