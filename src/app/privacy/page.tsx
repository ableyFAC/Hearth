import type { Metadata } from "next";
import { FOUNDER } from "@/lib/constants";

// Public top-level page, same pattern as src/app/fountain-valley/page.tsx:
// see src/lib/supabase/middleware.ts for the allowlist entry and
// src/app/sitemap.ts for the sitemap entry. Content is derived from the
// actual code paths (Supabase, Gemini, Stripe, CSLB, Checkr) rather than a
// generic template.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Prefer FOUNDER.email once the owner fills it in; until then fall back to
// the owner's personal address so signed-out visitors (who can't reach the
// in-app Help page) still have a working contact channel.
const CONTACT_EMAIL = FOUNDER.email || "landenchu2000@gmail.com";

export const metadata: Metadata = {
  // The root layout's title template appends "| Hearth"; don't repeat it here.
  title: "Privacy Policy",
  description:
    "What Hearth collects, how it is used, who it is shared with, and how to delete it.",
  alternates: {
    canonical: `${SITE_URL}/privacy`,
  },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
      <p className="text-sm">
        <a href="/" className="text-stone-500 hover:text-hearth-700 dark:text-stone-400 dark:hover:text-hearth-300">
          ← Hearth
        </a>
      </p>

      <h1 className="mt-4 text-2xl font-bold text-stone-900 sm:text-3xl dark:text-stone-100">
        Privacy Policy
      </h1>
      <p className="mt-3 text-sm text-stone-500 dark:text-stone-400">
        Last updated July 2026. Plain English, and honest about what actually
        happens in the app today.
      </p>

      <div className="mt-8 space-y-8 text-stone-700 dark:text-stone-300">
        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            The short version
          </h2>
          <p className="mt-2 leading-relaxed">
            Hearth stores your account and home information so it can track
            your systems, remind you about maintenance, and answer your
            questions. We do not sell your personal data, and we do not run
            third-party ad trackers on the app. Below is exactly what we
            collect, who it is shared with, and how to delete it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            What we collect and where it lives
          </h2>
          <p className="mt-2 leading-relaxed">
            Your account details (name, email) and your home details (address,
            year built, systems, condition, issues you report, reminders) are
            stored in our database, hosted by Supabase. Access is restricted
            to your own account.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Ask Hearth and Google Gemini
          </h2>
          <p className="mt-2 leading-relaxed">
            When you ask Ask Hearth a question, we send your question, and
            relevant details about your home (like your systems, their ages,
            and any open issues or reminders), to Google&apos;s Gemini API so
            it can generate a useful, specific answer. That request is
            processed server-side on Google&apos;s systems. If you attach a
            photo, the photo is sent the same way so Gemini can look at it.
            We do not send your question history to any other AI provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Photos and documents
          </h2>
          <p className="mt-2 leading-relaxed">
            Photos and documents you upload (system photos, warranties,
            inspection reports) are stored in private cloud storage, not a
            public bucket. When you or the app needs to display one, it is
            served through a short-lived signed link that expires rather than
            a permanent public URL.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Payments</h2>
          <p className="mt-2 leading-relaxed">
            Payments (Hearth Plus, contractor fees, deposits) are processed by
            Stripe. Hearth never sees or stores your full card number; Stripe
            handles that directly.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Contractor license and background checks
          </h2>
          <p className="mt-2 leading-relaxed">
            When a contractor lists a California license number, we check it
            against the CSLB (Contractors State License Board) public
            license-lookup registry, the same public page any homeowner could
            look up themselves. Where background checks are enabled for a
            pro, they are run by Checkr, a third-party background check
            provider; Hearth stores only the pass/no-pass result, not the
            underlying report.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Notifications
          </h2>
          <p className="mt-2 leading-relaxed">
            We send notifications you opt into (pro messages, maintenance
            reminders, weather and safety alerts, and occasional product
            updates), which you can turn on or off individually under Account
            &gt; Notifications.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            What we don&apos;t do
          </h2>
          <p className="mt-2 leading-relaxed">
            We do not sell your personal data. We do not run third-party ad
            trackers or ad pixels on Hearth. Contractor leads share only
            what&apos;s needed to quote
            the job, name, address, and the request, with the specific pro
            you chose, never your broader home condition profile.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Deleting your data
          </h2>
          <p className="mt-2 leading-relaxed">
            You can permanently delete your account, and the data tied to it,
            at any time under Account &gt; Account security &gt; Delete
            Account. This cannot be undone.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">Questions</h2>
          <p className="mt-2 leading-relaxed">
            Questions about this policy or your data can be sent to{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-hearth-700 hover:underline dark:text-hearth-300"
            >
              {CONTACT_EMAIL}
            </a>
            . If you have an account, you can also reach us from the Help
            page.
          </p>
        </section>
      </div>
    </main>
  );
}
