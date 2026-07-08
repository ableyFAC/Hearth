import type { Metadata } from "next";
import GuideCta from "@/components/GuideCta";

// Public SEO guide. General, honest guidance on reading a contractor's
// quote; no invented prices. Links to /quote-check (Hearth's AI Quote
// Analyzer, gated behind sign-in / Hearth Plus, see src/app/(app)/quote-check)
// as the natural next step once someone has an actual quote in hand.

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  title: "Is my contractor's quote fair? How to read it before you sign",
  description:
    "How to read a contractor's quote line by line, red flags to watch for, and what a fair bidding process looks like.",
  alternates: {
    canonical: `${SITE_URL}/guides/is-my-contractor-quote-fair`,
  },
};

const FAQS = [
  {
    q: "What should a fair contractor quote include?",
    a: "A fair quote itemizes materials separately from labor, specifies whether permits are included, describes the scope of work in specific terms rather than a single vague line, states a start and completion timeframe, and lays out a payment schedule tied to completed work rather than one lump sum upfront.",
  },
  {
    q: "What are red flags in a contractor quote?",
    a: "Watch for pressure to sign the same day, a demand for full payment before work starts, no license number you can verify, no business address or proof of insurance, vague line items like a single 'materials and labor' total, and a price far below every other bid with no explanation for the difference.",
  },
  {
    q: "What does a fair bidding process look like?",
    a: "Getting more than one quote for anything beyond a small repair, comparing itemized breakdowns rather than just the bottom line, confirming license and insurance independently, and having a written contract with a payment schedule tied to milestones, not just a handshake and a deposit.",
  },
  {
    q: "Can Hearth tell me if my quote is fair?",
    a: "Hearth's AI Quote Analyzer reads a quote you upload or paste in, compares the total and each line item to typical costs, flags anything that looks padded, vague, or duplicated, and drafts a message you can send back if you want to negotiate.",
  },
];

function buildFaqJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };
}

export default function IsMyContractorQuoteFairGuide() {
  return (
    <main className="mx-auto max-w-2xl px-6 pb-16 pt-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(buildFaqJsonLd()).replace(/</g, "\\u003c"),
        }}
      />

      <p className="text-sm">
        <a href="/guides" className="text-stone-500 hover:text-hearth-700">
          ← All guides
        </a>
      </p>

      <h1 className="mt-3 text-2xl font-bold text-stone-900 sm:text-3xl">
        Is my contractor's quote fair? How to read it before you sign
      </h1>
      <p className="mt-3 text-sm text-stone-500">
        General guidance for reading any home repair or improvement quote.
      </p>

      <div className="mt-8 space-y-6 text-stone-700">
        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            How to read a quote
          </h2>
          <p className="mt-2 leading-relaxed">
            Start with whether it's itemized. A fair quote breaks out
            materials from labor rather than handing you a single total, so
            you can see what you're actually paying for each. It should say
            plainly whether permits are included in the price or billed
            separately, and if the job requires one, whether the contractor
            is pulling it. Look for a specific description of the work, not a
            generic line like "repair as needed," along with a realistic
            start date and estimated completion window, and a payment
            schedule that ties payments to stages of completed work instead
            of asking for everything upfront.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">Red flags</h2>
          <p className="mt-2 leading-relaxed">
            Be cautious of pressure to sign the same day the quote is given,
            or a demand for full payment before any work begins. A
            contractor who can't or won't give you a license number, business
            address, or proof of insurance is a red flag on its own. So are
            vague line items that lump everything into one number, and a
            price that comes in far below every other bid with no clear
            reason, since it often means something gets cut later, whether
            that's materials, permits, or the scope itself.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            What a fair process looks like
          </h2>
          <p className="mt-2 leading-relaxed">
            For anything beyond a small repair, it's worth getting more than
            one quote so you have something to compare against. Look at the
            itemized breakdown, not just the bottom line, confirm the
            license and insurance independently rather than taking the
            contractor's word for it, and get everything in writing,
            including a payment schedule tied to milestones rather than a
            single deposit. None of this guarantees a low price, but it
            gives you a much clearer picture of what you're actually paying
            for.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            Already have a quote in hand?
          </h2>
          <p className="mt-2 leading-relaxed">
            Hearth's{" "}
            <a
              href="/quote-check"
              className="text-hearth-700 hover:underline"
            >
              AI Quote Analyzer
            </a>{" "}
            reads a quote you upload or paste in, compares the total and each
            line item to typical costs, flags anything that looks padded,
            vague, or duplicated, and drafts a message you can send back if
            you want to negotiate. Your first check is free.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-stone-900">
            Frequently asked questions
          </h2>
          <div className="mt-2 space-y-4">
            {FAQS.map((f) => (
              <div key={f.q}>
                <h3 className="font-medium text-stone-900">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-stone-600">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <GuideCta
        signedInHref="/quote-check"
        signedInLabel="Check your quote"
      />
    </main>
  );
}
