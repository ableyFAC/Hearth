import Link from "next/link";
import type { Metadata } from "next";
import { PLUS_PLAN, COLD_START_FREE_POSTING } from "@/lib/constants";

// Public top-level pricing page, same pattern as src/app/privacy/page.tsx:
// see the allowlist entry in src/lib/supabase/middleware.ts. A logged-out
// visitor can read the whole thing; the actual subscribe flow stays gated
// under /plus for signed-in users. Every price comes from PLUS_PLAN in
// src/lib/constants.ts (the one source of truth the /plus page and Stripe
// checkout also read), so nothing here can drift from what a card is charged.

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  // The root layout's title template appends "| Hearth"; don't repeat it here.
  title: "Pricing",
  description:
    "Hearth pricing, in plain terms. Your first home is free with no card. Hearth Plus is optional, with an honest auto-renewing subscription you can cancel anytime.",
  alternates: {
    canonical: `${SITE_URL}/pricing`,
  },
};

// Prices are rendered from PLUS_PLAN so a one-line edit in constants moves
// them everywhere. toFixed(2) keeps $4.99 / $39.99 from ever showing as
// "4.9". The yearly plan reframed as a monthly cost, the same math the /plus
// PlanToggle uses, so the sticker price isn't doing all the work alone.
const MONTHLY = `$${PLUS_PLAN.monthly.toFixed(2)}`;
const YEARLY = `$${PLUS_PLAN.yearly.toFixed(2)}`;
const YEARLY_PER_MONTH = `$${(PLUS_PLAN.yearly / 12).toFixed(2)}`;
const TRIAL_DAYS = PLUS_PLAN.trialDays;

// Free tier: what a homeowner gets with no card, forever. Mirrors the "Free"
// column of the /plus comparison so the two pages tell the same story.
const FREE_FEATURES = [
  "Track your first home: systems, ages, documents, and reminders",
  "Your first maintenance plan, built from your home's systems",
  "Your 10-year cost forecast total and the monthly amount to set aside",
  "A free quote check to see whether a quote is fair",
  COLD_START_FREE_POSTING
    ? "Post jobs and get quotes from local pros, unlimited while Hearth is new"
    : "Post up to 3 jobs at a time and get quotes from local pros",
  "Every alert, in the app",
];

// Plus tier: what the subscription unlocks on top of Free. Mirrors the
// Plus-exclusive rows of the /plus comparison.
const PLUS_FEATURES = [
  "A maintenance plan auto-built for your home and kept up to date",
  "The full per-system cost forecast and repair-fund breakdown",
  "Unlimited quote analyzer: it reads every quote, flags padding, and drafts the message back",
  "A shareable home report for resale and insurance",
  "Track up to 5 homes in one place",
  "Every proactive alert, on every channel",
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 pb-16 pt-10">
      <p className="text-base">
        <Link
          href="/"
          className="text-stone-500 hover:text-bark-700 dark:text-stone-400 dark:hover:text-stone-300"
        >
          ← Hearth
        </Link>
      </p>

      <h1 className="mt-4 text-3xl font-bold text-stone-900 sm:text-4xl dark:text-stone-100">
        Simple pricing. Most of Hearth is free.
      </h1>
      <p className="mt-3 text-base leading-relaxed text-stone-600 dark:text-stone-300">
        Your first home is free to track, with no card. Hearth Plus is an
        optional subscription for the tools that save you real money on repairs.
        Here is exactly what each one costs and what you get.
      </p>

      {/* Two plans, single column on phones, side by side from md up. */}
      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {/* Free */}
        <div className="card flex flex-col">
          <div>
            <span className="chip chip-muted">Free forever</span>
            <p className="mt-3 text-3xl font-semibold text-stone-900 dark:text-stone-100">
              $0
            </p>
            <p className="mt-1 text-base text-stone-600 dark:text-stone-300">
              First home free. No card, ever.
            </p>
          </div>
          <ul className="mt-5 space-y-2.5">
            {FREE_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-base leading-relaxed text-stone-700 dark:text-stone-300"
              >
                <span className="mt-0.5 font-bold text-green-600" aria-hidden>
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Plus */}
        <div className="card-hero flex flex-col">
          <div>
            <span className="chip border border-bark-200 bg-bark-50 text-bark-700 dark:border-bark-600/40 dark:bg-bark-700/30 dark:text-stone-300">
              Optional
            </span>
            <p className="mt-3 text-xl font-semibold text-stone-900 dark:text-stone-100">
              Hearth Plus
            </p>
            {/* Two billing options, pulled from PLUS_PLAN. */}
            <div className="mt-3 space-y-1.5 text-base text-stone-700 dark:text-stone-300">
              <p>
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {MONTHLY}
                </span>{" "}
                a month
              </p>
              <p>
                <span className="font-semibold text-stone-900 dark:text-stone-100">
                  {YEARLY}
                </span>{" "}
                a year{" "}
                <span className="text-stone-500 dark:text-stone-400">
                  (about {YEARLY_PER_MONTH} a month, the best value)
                </span>
              </p>
            </div>
            <p className="mt-3 text-base font-medium text-bark-700 dark:text-stone-300">
              Starts with a free {TRIAL_DAYS}-day trial.
            </p>
          </div>
          <ul className="mt-5 space-y-2.5">
            <li className="text-base font-medium text-stone-900 dark:text-stone-100">
              Everything in Free, plus:
            </li>
            {PLUS_FEATURES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-2 text-base leading-relaxed text-stone-700 dark:text-stone-300"
              >
                <span className="mt-0.5 font-bold text-green-600" aria-hidden>
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The honest auto-renew disclosure, stated plainly. Same facts the
          checkout disclosure carries (src/components/AutoRenewalTerms.tsx),
          shown here before anyone signs up so it can't read as a surprise. */}
      <div className="mt-8 rounded-xl border border-stone-200 bg-stone-50 p-5 dark:border-white/10 dark:bg-stone-900">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          How the Plus trial and billing work
        </h2>
        <p className="mt-2 text-base leading-relaxed text-stone-700 dark:text-stone-300">
          If you start Plus, your first {TRIAL_DAYS} days are free and nothing is
          charged. After the {TRIAL_DAYS}-day trial, it renews automatically at
          the price you picked ({MONTHLY} a month or {YEARLY} a year) unless you
          cancel.
        </p>
        <p className="mt-2 text-base leading-relaxed text-stone-700 dark:text-stone-300">
          You can cancel anytime from your account with one button. There is
          nothing to call or email. If you cancel during the {TRIAL_DAYS}-day
          trial, you are never charged, and if you cancel later you keep Plus
          until the end of the period you already paid for.
        </p>
      </div>

      {/* What stays free forever, so "free" isn't a bait word. */}
      <div className="mt-6">
        <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
          What stays free, forever
        </h2>
        <p className="mt-2 text-base leading-relaxed text-stone-600 dark:text-stone-300">
          Tracking your first home, your reminders, your document vault, your
          first maintenance plan, and posting jobs to local pros are free to use
          and always will be. You never need a card for any of it, and you can
          get a lot out of Hearth without ever paying a cent. Plus is there only
          if you want the money-saving tools on top.
        </p>
      </div>

      {/* Primary CTA into the public signup; Plus is explicitly optional. */}
      <div className="mt-10 text-center">
        <Link href="/homeowner-signup" className="btn-primary">
          Get started free
        </Link>
        <p className="mt-3 text-base text-stone-500 dark:text-stone-400">
          No card to start. Plus is optional, and you can add it later from
          inside the app.
        </p>
        <p className="mt-4 text-base text-stone-500 dark:text-stone-400">
          Already have an account?{" "}
          <Link
            href="/signin"
            className="text-bark-700 hover:underline dark:text-stone-300"
          >
            Sign in
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
