"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// ---------------------------------------------------------------------------
// Single-password gate for the contractor side (dev).
// You only type a password. It maps to ONE shared pro account (a DIFFERENT
// hidden email than the homeowner gate, so role routing stays correct).
// ---------------------------------------------------------------------------
const GATE_EMAIL = "pro@hearth.app";
const GATE_PASSWORD = "Password123!";

export default function ProLoginPage() {
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

    // 1) Try to sign into the shared pro account.
    const signIn = await supabase.auth.signInWithPassword({
      email: GATE_EMAIL,
      password: GATE_PASSWORD,
    });
    if (!signIn.error) {
      window.location.href = "/pro";
      return;
    }

    // 2) First run: create it.
    const signUp = await supabase.auth.signUp({
      email: GATE_EMAIL,
      password: GATE_PASSWORD,
    });
    if (signUp.error) {
      setBusy(false);
      const already = /registered|exists/i.test(signUp.error.message);
      setStatus(
        already
          ? `A pro account already exists but sign-in failed. In Supabase → ` +
              `Authentication → Users, delete "${GATE_EMAIL}", then enter the password again.`
          : `Couldn't create the pro account: ${signUp.error.message}.`
      );
      return;
    }

    if (signUp.data.session) {
      window.location.href = "/pro";
      return;
    }

    // 3) Signup succeeded but no session = email confirmation is ON in Supabase.
    setBusy(false);
    setStatus(
      `Pro account created. Run this once in the Supabase SQL editor, then enter ` +
        `the password again:  update auth.users set email_confirmed_at = now() ` +
        `where email = '${GATE_EMAIL}';`
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <div className="text-3xl">🛠️</div>
          <h1 className="mt-2 text-2xl font-semibold text-stone-900">
            Hearth for Pros
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
      <p className="mt-6 text-center text-sm text-stone-500">
        <a href="/preview" className="font-medium text-hearth-700 hover:underline">
          👀 Preview available leads first
        </a>
      </p>
      <p className="mt-2 text-center text-xs text-stone-400">
        Are you a homeowner?{" "}
        <a href="/login" className="text-hearth-700 hover:underline">
          Go to the homeowner sign-in
        </a>
        .
      </p>
    </main>
  );
}
