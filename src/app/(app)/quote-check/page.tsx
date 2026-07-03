import { redirect } from "next/navigation";
import { hasPlus } from "@/lib/subscription";
import QuoteAnalyzer from "@/components/QuoteAnalyzer";

// AI Quote Analyzer (Hearth Plus only): the homeowner hands over a photo or
// the text of a contractor's quote, and Hearth reads it, checks the total and
// every line item against typical costs, flags anything padded or vague, and
// writes a negotiation message. Competitors have shown this can save a
// homeowner hundreds of dollars for the cost of a couple minutes of reading.
export default async function QuoteCheckPage() {
  if (!(await hasPlus())) redirect("/plus?reason=quote");

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">
          AI Quote Analyzer
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          Upload a photo of a contractor's quote, or paste the text, and
          Hearth will read every line item, compare the total to typical
          costs, flag anything that looks padded, vague, or duplicated, and
          draft a short message you can send back to negotiate. It only takes
          a minute, and it can save you hundreds of dollars on a bad quote.
        </p>
      </header>

      <QuoteAnalyzer />
    </div>
  );
}
