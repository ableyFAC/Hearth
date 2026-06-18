"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Simple single-password gate (dev).
// You only type a password. Behind the scenes it signs into ONE shared Supabase
// account so the rest of the app (which is tied to a user via RLS) keeps
// working. The email below is hidden from the UI — change it if you like.
// ---------------------------------------------------------------------------
const GATE_EMAIL = "landenchu2000@gmail.com";
const GATE_PASSWORD = "Password123!";

export default function LoginPage() {
  const supabase = createClient();
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);

    if (password !== GATE_PASSWORD) {
      setStatus("Incorrect password.");
      return;
    }

    setBusy(true);

    // 1) Try to sign into the shared account.
    const signIn = await supabase.auth.signInWithPassword({
      email: GATE_EMAIL,
      password: GATE_PASSWORD,
    });
    if (!signIn.error) {
      window.location.href = "/dashboard";
      return;
    }

    // 2) First run: the account doesn't exist yet — create it.
    const signUp = await supabase.auth.signUp({
      email: GATE_EMAIL,
      password: GATE_PASSWORD,
    });
    if (signUp.error) {
      setBusy(false);
      // "already registered" => a half-created account from an earlier attempt
      // is blocking us; deleting it lets the gate recreate it cleanly.
      const already = /registered|exists/i.test(signUp.error.message);
      setStatus(
        already
          ? `An access account already exists but its sign-in failed. In Supabase → ` +
              `Authentication → Users, delete the user "${GATE_EMAIL}", then enter the password again.`
          : `Couldn't create the access account: ${signUp.error.message}. In Supabase → ` +
              `Authentication → Providers → Email, turn OFF "Confirm email", then try again.`
      );
      return;
    }

    if (signUp.data.session) {
      window.location.href = "/dashboard";
      return;
    }

    // 3) Signup succeeded but no session = email confirmation is still ON.
    setBusy(false);
    setStatus(
      `Access account created, but email confirmation is ON in Supabase. ` +
        `Turn OFF "Confirm email" (Authentication → Providers → Email), then enter the password again.`
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="text-3xl">🏡</div>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Welcome to Hearth
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Enter the password to continue.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
              autoFocus
              required
            />
          </div>
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Entering…" : "Enter"}
          </button>
        </form>

        {status && (
          <p className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800">
            {status}
          </p>
        )}
      </div>
      <p className="mt-6 text-center text-xs text-stone-400">
        Are you a contractor?{" "}
        <a href="/pro/login" className="text-hearth-700 hover:underline">
          Sign in to Hearth for Pros
        </a>
        .
      </p>
    </main>
  );
}
