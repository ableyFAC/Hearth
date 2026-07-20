"use client";

import NoticeAtCollection from "@/components/NoticeAtCollection";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { safeNextPath } from "@/lib/safeNext";
import { recordTermsAcceptance } from "@/app/(auth)/recordTermsAcceptance";

// Real per-user contractor sign-up. Creates a Supabase Auth account tagged with
// role=contractor, then sends them to set up their company. If email
// confirmation is OFF in Supabase they're signed in immediately; if ON, we
// show a check-your-inbox panel, and the confirmation link lands on
// /auth/callback with next=/pro/onboarding so verifying drops them straight
// into company setup instead of back at sign-in.
//
// ?next=: carried in from /get-started same as the homeowner sign-up. Note
// it only survives as far as /pro/onboarding: the company-setup form there
// posts to saveCompanyAction (src/app/pro/actions.ts, owned by another fix),
// which redirects on its own, so a contractor's original destination isn't
// honored past this point. Left alone rather than reaching into that file.
export default function ContractorSignUpPage({
  searchParams,
}: {
  searchParams?: { next?: string; ref?: string };
}) {
  const supabase = createClient();
  const next = safeNextPath(
    typeof searchParams?.next === "string" ? searchParams.next : null
  );
  const nextQuery = next ? `?next=${encodeURIComponent(next)}` : "";
  // ?ref=: a referral code from /pros rides along to /pro/onboarding the same
  // way ?next= does (onboarding reads searchParams.ref and redeems it there).
  const ref =
    typeof searchParams?.ref === "string" && searchParams.ref.trim()
      ? searchParams.ref.trim()
      : null;
  // Query string for the /pro/onboarding destination only: next plus ref.
  // The sign-in and homeowner links below keep plain nextQuery, since ref
  // means nothing outside contractor onboarding.
  const onboardingParams = new URLSearchParams();
  if (next) onboardingParams.set("next", next);
  if (ref) onboardingParams.set("ref", ref);
  const onboardingQuery = onboardingParams.toString()
    ? `?${onboardingParams.toString()}`
    : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Set when the account exists but email confirmation is still pending;
  // swaps the form for the check-your-inbox panel below.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Unchecked by default (Berman fix: pre-ticked consent boxes are void as an
  // agreement to arbitrate/waive class claims in California). Required
  // before submit; also re-checked in onSubmit, not just via `required`,
  // since a crafted or programmatic submit can bypass HTML validation.
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Where the confirmation email's link should land: the auth callback
  // exchanges the code for a session, then follows next= to company setup
  // (with the original ?next= and any ?ref= still riding along, double-encoded
  // so they survive the callback's own redirect).
  function confirmRedirectUrl(): string {
    return `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      `/pro/onboarding${onboardingQuery}`
    )}`;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (!agreedToTerms) {
      setError(
        "Please confirm you're at least 18 and agree to the Contractor Terms and Privacy Policy."
      );
      return;
    }

    setBusy(true);

    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { role: "contractor" },
        emailRedirectTo: confirmRedirectUrl(),
      },
    });

    if (error) {
      setBusy(false);
      setError(
        /registered|exists/i.test(error.message)
          ? "An account with this email already exists. Try signing in instead."
          : error.message
      );
      return;
    }

    // Confirmation OFF → session returned → go set up the company.
    if (data.session) {
      // Best-effort audit-trail write; never block signup on it. When email
      // confirmation is ON, no session exists yet here and this never fires -
      // /auth/callback records the acceptance instead, once it exchanges the
      // confirmation code for a session (see the comment there).
      if (data.user) {
        void recordTermsAcceptance(data.user.id, "pro_terms");
      }
      window.location.href = `/pro/onboarding${onboardingQuery}`;
      return;
    }

    // With confirmations ON, signUp for an already-confirmed email does NOT
    // error (enumeration protection): it returns success with an obfuscated
    // user whose identities array is empty, and sends no email. Don't promise
    // an inbox message that will never arrive; point them at sign-in instead.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      setBusy(false);
      setError("An account with this email already exists. Try signing in instead.");
      return;
    }

    // Confirmation ON → no session yet; show the check-your-inbox panel.
    setBusy(false);
    setPendingEmail(email.trim());
  }

  async function onResend() {
    if (!pendingEmail) return;
    setError(null);
    setNotice(null);
    setBusy(true);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: confirmRedirectUrl() },
    });

    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setNotice("Confirmation email resent. Give it a minute or two.");
  }

  // Account created, email confirmation pending: check-your-inbox panel.
  if (pendingEmail) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
        <div className="card">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
              Check your inbox
            </h1>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              We sent a confirmation link to{" "}
              <span className="break-all font-medium text-stone-700 dark:text-stone-300">{pendingEmail}</span>
              . Click it and you'll land right in company setup.
            </p>
          </div>

          <p className="text-center text-xs text-stone-500 dark:text-stone-400">
            Nothing after a couple of minutes? Check your spam folder, or
            resend it.
          </p>
          <button
            type="button"
            onClick={onResend}
            className="btn-secondary mt-4 w-full"
            disabled={busy}
          >
            {busy ? "Resending…" : "Resend email"}
          </button>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              aria-live="polite"
              className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800 dark:bg-hearth-900/40 dark:text-hearth-200"
            >
              {notice}
            </p>
          )}

          <p className="mt-6 border-t border-stone-100 pt-4 text-center text-xs text-stone-500 dark:border-white/10 dark:text-stone-400">
            Already confirmed, or used the wrong email?{" "}
            <a href={`/signin${nextQuery}`} className="text-hearth-700 hover:underline dark:text-hearth-300">
              Sign in
            </a>{" "}
            or{" "}
            <a href="/reset-password" className="text-hearth-700 hover:underline dark:text-hearth-300">
              reset your password
            </a>
            .
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <div className="card">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Join Hearth for Pros
          </h1>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
            Browse local jobs free. Pay only when you apply, $25-$90 by trade,
            with the price on every job card.
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
          {/* Unchecked-by-default, gated in onSubmit (Berman fix - a
              pre-ticked or merely-decorative agreement line doesn't bind).
              Also carries the 18+ age gate. Links to /pro-terms, not /terms:
              the B2B contractor terms (src/app/pro-terms/page.tsx). */}
          <label className="flex items-start gap-2 text-xs text-stone-500 dark:text-stone-400">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              required
            />
            <span>
              I am at least 18 years old and I have read and agree to the{" "}
              <a href="/pro-terms" className="text-hearth-700 hover:underline dark:text-hearth-300">
                Contractor Terms
              </a>{" "}
              and{" "}
              <a href="/privacy" className="text-hearth-700 hover:underline dark:text-hearth-300">
                Privacy Policy
              </a>
              .
            </span>
          </label>
          {/* Notice at collection - a separate obligation from the checkbox
              above, shown at the point of collection directly under the
              Privacy Policy link. Collapsed by default so it stays tidy. */}
          <NoticeAtCollection
            collects="Your name, email address, and password."
            purpose="create and secure your account, sign you in, and contact you about leads."
            sensitive="Your password is sensitive information. It's stored only as a scrambled hash that we can't reverse, and it's used for nothing but signing you in."
          />
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? "Creating account…" : "Sign up"}
          </button>
        </form>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </p>
        )}
        {notice && (
          <p
            aria-live="polite"
            className="mt-4 rounded-lg bg-hearth-50 p-3 text-center text-sm text-hearth-800 dark:bg-hearth-900/40 dark:text-hearth-200"
          >
            {notice}
          </p>
        )}

        <div className="mt-6 border-t border-stone-100 pt-4 text-center dark:border-white/10">
          <p className="text-sm text-stone-500 dark:text-stone-400">Already have an account?</p>
          <a
            href={`/signin${nextQuery}`}
            className="btn-secondary mt-2 inline-block w-full"
          >
            Sign in
          </a>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-stone-500 dark:text-stone-400">
        Want to track your own home instead?{" "}
        <a
          href={`/homeowner-signup${nextQuery}`}
          className="text-hearth-700 hover:underline dark:text-hearth-300"
        >
          Sign up as a homeowner
        </a>
        .
      </p>
    </main>
  );
}
