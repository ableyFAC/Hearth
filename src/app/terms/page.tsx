import type { Metadata } from "next";

// Public top-level page, same pattern as src/app/fountain-valley/page.tsx:
// see src/lib/supabase/middleware.ts for the allowlist entry and
// src/app/sitemap.ts for the sitemap entry.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  // The root layout's title template appends "| Hearth"; don't repeat it here.
  title: "Terms of Service",
  description:
    "The plain-English basics of using Hearth: what the marketplace is, what Ask Hearth's answers are (and aren't), and how accounts and fees work.",
  alternates: {
    canonical: `${SITE_URL}/terms`,
  },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
      <p className="text-sm">
        <a href="/" className="text-stone-500 hover:text-hearth-700 dark:text-stone-400 dark:hover:text-hearth-300">
          ← Hearth
        </a>
      </p>

      <h1 className="mt-4 text-2xl font-bold text-stone-900 sm:text-3xl dark:text-stone-100">
        Terms of Service
      </h1>
      <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
        Last updated July 2026. The plain-English basics, not legalese.
      </p>

      <div className="mt-8 space-y-8 text-stone-700 dark:text-stone-300">
        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            What Hearth is
          </h2>
          <p className="mt-2 leading-relaxed">
            Hearth is a marketplace and home-tracking tool that connects
            homeowners with independent contractors. Hearth is not the
            contractor, does not perform the work, and does not guarantee the
            quality, safety, timeliness, or price of any job. Contractors are
            independent businesses, not Hearth employees or agents.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Ask Hearth is informational, not professional advice
          </h2>
          <p className="mt-2 leading-relaxed">
            Answers from Ask Hearth (including cost estimates, diagnoses from
            photos, and maintenance guidance) are generated to be genuinely
            useful, but they are informational only, not licensed
            professional, engineering, electrical, structural, or legal
            advice. For anything safety-related, code-regulated, or you are
            unsure about, hire a licensed pro.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            License verification
          </h2>
          <p className="mt-2 leading-relaxed">
            Where Hearth shows a contractor&apos;s license as verified, that
            means we checked the license number against the CSLB public
            registry at that point in time. It is a point-in-time
            public-records check, not an ongoing guarantee, warranty, or
            endorsement of that contractor&apos;s work.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Fees and refunds
          </h2>
          <p className="mt-2 leading-relaxed">
            Homeowner features, contractor lead fees, and any subscription
            pricing are described where you encounter them in the app (for
            example, on a job card or the Hearth Plus page) before you pay.
            Refund behavior, such as a fee returning as wallet credit if a
            homeowner doesn&apos;t respond, is described in-app at the same
            point. Pro wallet deposits are non-refundable and can only be
            spent on lead applications, and promotional or bonus credit can
            expire.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Acceptable use
          </h2>
          <p className="mt-2 leading-relaxed">
            Use Hearth honestly: don&apos;t misrepresent who you are or your
            license status, don&apos;t use the app to harass another user,
            and don&apos;t try to scrape, abuse, or overload the service
            (including running up Ask Hearth usage beyond normal, personal
            use of your own home).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Account termination
          </h2>
          <p className="mt-2 leading-relaxed">
            You can delete your own account at any time under Account &gt;
            Account security. We may suspend or terminate an account that
            violates these terms or misuses the platform.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Governing law
          </h2>
          <p className="mt-2 leading-relaxed">
            These terms are governed by the laws of the State of California,
            without regard to conflict-of-law rules.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Related reading
          </h2>
          <p className="mt-2 leading-relaxed">
            See the{" "}
            <a href="/privacy" className="text-hearth-700 hover:underline dark:text-hearth-300">
              Privacy Policy
            </a>{" "}
            for what we collect and how it&apos;s used.
          </p>
        </section>
      </div>
    </main>
  );
}
