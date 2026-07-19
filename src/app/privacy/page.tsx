import { LegalContact } from "@/components/LegalContact";
import type { Metadata } from "next";

// Public top-level page, same pattern as src/app/fountain-valley/page.tsx:
// see src/lib/supabase/middleware.ts for the allowlist entry and
// src/app/sitemap.ts for the sitemap entry. Content is derived from the
// actual code paths (Supabase, Gemini, Stripe, CSLB, Checkr) rather than a
// generic template.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";


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
            At a glance
          </h2>
          <p className="mt-2 leading-relaxed">
            Every row below is what the app actually does today, not a
            template. &ldquo;Linked to you&rdquo; means the record is stored
            against your account rather than anonymously.
          </p>

          {/* Wide on purpose: the wrapper scrolls, the page never does. */}
          <div className="mt-4 overflow-x-auto rounded-lg border border-stone-200 dark:border-stone-700">
            <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
              <thead className="bg-stone-50 text-stone-900 dark:bg-stone-800 dark:text-stone-100">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Data</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Why we have it</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Linked to you</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Leaves Hearth?</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-700">
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Name, email, phone
                  </th>
                  <td className="px-3 py-3 align-top">Your login, notifications, and introducing you to a pro you contact</td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Your email goes to Stripe at checkout. Your name, email and
                    phone go to the specific pro you send a request to. Email
                    and SMS reminders are delivered by Resend and Twilio when
                    those channels are turned on.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Home address and location
                  </th>
                  <td className="px-3 py-3 align-top">
                    Pre-filling your home facts, local pricing, weather alerts,
                    and getting a pro to the right house
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Street + ZIP go to RentCast to look up county records. Your
                    address is included in the context sent to Google Gemini
                    when you use Ask Hearth. City and state go to Open-Meteo
                    for the forecast behind weather alerts. Your full address
                    goes to the pro you choose.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Home facts and systems
                  </th>
                  <td className="px-3 py-3 align-top">
                    Year built, size, systems, ages, condition, issues and
                    reminders, so advice is about your house
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Sent to Google Gemini as context when you ask a question.
                    Appliance brand names are sent to the CPSC public recall
                    service to check for recalls.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Home value and money details
                  </th>
                  <td className="px-3 py-3 align-top">
                    Purchase price, mortgage balance, assessed and market
                    value, property tax, insurance and HOA, for equity,
                    tax-appeal and insurance tools
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Some of these numbers arrive from RentCast&apos;s records
                    lookup. Purchase price, assessed value, and
                    Hearth&apos;s home-value estimate are sent to Google
                    Gemini only when you generate a Property Tax Appeal Kit.
                    Insurance premium and renewal date are sent to Google
                    Gemini only when you generate an Insurance Requote
                    Packet. Nothing else in this row leaves Hearth.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Photos, documents and voice notes
                  </th>
                  <td className="px-3 py-3 align-top">
                    System photos, warranties, inspection reports, quotes, and
                    dictated questions
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Stored privately. Sent to Google Gemini only when you
                    attach one to a question, ask us to read a document, or
                    dictate instead of typing.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Messages and support requests
                  </th>
                  <td className="px-3 py-3 align-top">
                    Your conversation with a pro, reviews you write, and
                    anything you send our support inbox
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Visible to the pro on the other side of that thread. Not
                    sent to any AI provider or advertiser.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Payments
                  </th>
                  <td className="px-3 py-3 align-top">
                    Hearth Plus, pro lead fees, deposits and invoices
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    Handled by Stripe. We store the Stripe customer and
                    subscription id and the invoice totals, never your card
                    number.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Pro license and background checks
                  </th>
                  <td className="px-3 py-3 align-top">
                    Verifying a contractor is who they say they are (pro
                    accounts only)
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">
                    License number is checked against the CSLB public registry.
                    Where background checks are enabled, name and email go to
                    Checkr; we store only the result.
                  </td>
                </tr>
                <tr>
                  <th scope="row" className="px-3 py-3 text-left font-medium text-stone-900 align-top dark:text-stone-100">
                    Usage counts
                  </th>
                  <td className="px-3 py-3 align-top">
                    A daily count of AI questions, to enforce plan limits
                  </td>
                  <td className="px-3 py-3 align-top">Yes</td>
                  <td className="px-3 py-3 align-top">No.</td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="mt-4 leading-relaxed">
            <span className="font-medium text-stone-900 dark:text-stone-100">
              What is not here:
            </span>{" "}
            there is no advertising SDK, no third-party analytics or session
            recorder, and no ad pixel anywhere in Hearth. We do not store your
            IP address or browser fingerprint in our own database, and we do
            not build an advertising profile or sell your data to anyone.
          </p>
        </section>

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
            Your account details (name, email, and phone number if you add
            one) and your home details (address,
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
            When you ask Ask Hearth a question, we send your question and
            relevant details about your home to Google&apos;s Gemini API so it
            can generate a useful, specific answer. To be specific about what
            &ldquo;details about your home&rdquo; means, because it is more
            than people expect: it includes your systems and their ages, your
            open reminders, your recently logged issues, the year your home
            was built, your city and state, and{" "}
            <span className="font-medium text-stone-900 dark:text-stone-100">
              your street address
            </span>
            . We also send{" "}
            <span className="font-medium text-stone-900 dark:text-stone-100">
              your first name
            </span>
            , so the answer can greet you by name. That request is processed
            server-side on Google&apos;s systems. If you attach a photo, the
            photo is sent the same way so Gemini can look at it. We do not
            send your question history to any other AI provider.
          </p>
          <p className="mt-3 leading-relaxed">
            We do not send your messages with pros to Gemini. We also do not
            send your mortgage balance: it is used only in your own
            maintenance-history calculations. We DO send some of your money
            details to Gemini when you use specific tools: your purchase
            price, assessed value, and Hearth&apos;s own estimate of your
            home&apos;s market value when you generate a Property Tax Appeal
            Kit, and your current insurance premium and renewal date when you
            generate an Insurance Requote Packet. If you upload a
            contractor&apos;s quote to the quote analyzer, its full line
            items and total are sent to Gemini so it can be read and
            evaluated. None of this is sent unless you actively use that
            specific tool.
          </p>
          <p className="mt-3 leading-relaxed">
            The pro side sends Gemini its own data too. When a contractor
            uses Ask Hearth for Pros, we send their wallet balance (cash and
            bonus, in dollars), their license number and verification
            status, and their background-check status as context, so the
            assistant can answer questions about their account accurately.
            When a contractor uses the estimate or invoice tools in the pro
            back office, their own past-job dollar totals (labor and
            materials) are sent to Gemini as pricing reference. When a
            contractor uploads a past invoice, quote, or receipt to build
            that pricing history, the full image, including its dollar line
            items, is sent to Gemini so it can be read. None of this is a
            homeowner&apos;s data: it is the contractor&apos;s own account
            information.
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
          <p className="mt-3 leading-relaxed">
            In-app notifications stay inside Hearth. Email and text messages
            are handed to delivery providers to actually send: emails go
            through Resend, and text messages go through Twilio. That means
            your email address goes to Resend, your phone number goes to
            Twilio, and the contents of the notification go with them. Those
            channels are off unless we have the provider set up and you have
            the channel turned on; if a channel is off, nothing is sent to
            that provider.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            Weather and safety alerts
          </h2>
          <p className="mt-2 leading-relaxed">
            The freeze and heat-wave warnings on your dashboard need a real
            forecast for where you live, so we send your city and state to
            Open-Meteo, a free public weather service, to look up your
            location and its forecast. We do not send your street address or
            your name.
          </p>
          <p className="mt-3 leading-relaxed">
            To check whether anything in your home has been recalled, we send
            the brand names you entered for your systems and appliances (for
            example &ldquo;Carrier&rdquo; or &ldquo;Rheem&rdquo;) to the
            CPSC&apos;s public SaferProducts recall search, run by the U.S.
            Consumer Product Safety Commission. Only the brand word is sent,
            not your address, name, or model and serial numbers.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            What a contractor sees
          </h2>
          <p className="mt-2 leading-relaxed">
            When you post a job, we save a snapshot of that request so a pro
            can quote it. That snapshot includes your name, your email
            address, your phone number, your property address, the job
            category, your description of the problem, how severe it is, your
            timing, and your budget range if you gave one. Pros who take on
            your job see that snapshot. They do not see your broader home
            profile: your other systems, your money details, your documents,
            or your Ask Hearth history.
          </p>
          <p className="mt-3 leading-relaxed">
            Separately, open jobs appear as an anonymous teaser on our public
            page for contractors, which anyone can see without an account. The
            teaser shows only the job category, how severe it is, the lead fee
            for that job, and a coarse area (the city portion of the address).
            It never shows your name, email, phone, or street address.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
            What we don&apos;t do
          </h2>
          <p className="mt-2 leading-relaxed">
            We do not sell your personal data, and we do not share it with
            anyone beyond the providers named on this page.
          </p>
          <p className="mt-3 leading-relaxed">
            Hearth runs no third-party tracking of any kind. There is no
            third-party analytics service, no advertising SDK, no ad pixel or
            retargeting tag, no session recorder or heatmap tool, and no data
            broker receiving anything about you. We do not build an
            advertising profile of you, and we do not store your IP address
            or a browser fingerprint in our database. This is unusual, so it
            is worth saying plainly: the companies listed on this page get
            your data because they perform a job you asked for, not because
            they are watching you use the app. The one exception is
            Google&apos;s Gemini API: see the AI section above for what it
            receives and how Google&apos;s free-tier terms currently apply to
            that data.
          </p>
          <p className="mt-3 leading-relaxed">
            Honestly, one thing is not a third party: Hearth logs a small
            amount of its own first-party product-usage events, like which
            feature you used (for example, posting a job from a chat
            answer), so we can see what is and isn&apos;t working and improve
            the app. That data stays on Hearth&apos;s own server, is never
            sold or shared with anyone, and today it is only written to a
            server log, not sent to any analytics company.
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
            <LegalContact />
            . If you have an account, you can also reach us from the Help
            page.
          </p>
        </section>
      </div>
    </main>
  );
}
