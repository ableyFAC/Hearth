import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasPlus } from "@/lib/subscription";
import QuoteAnalyzer from "@/components/QuoteAnalyzer";

// AI Quote Analyzer (Hearth Plus): the homeowner hands over a photo or
// the text of a contractor's quote, and Hearth reads it, checks the total and
// every line item against typical costs, flags anything padded or vague, and
// writes a negotiation message. Competitors have shown this can save a
// homeowner hundreds of dollars for the cost of a couple minutes of reading.
//
// Non-Plus homeowners get exactly one free check as a taste: if their credit
// (users.free_quote_used_at) is unused they see the page with a banner, and
// once it's spent they're back to the Plus pitch.
export default async function QuoteCheckPage() {
  const plus = await hasPlus();

  let freeTaste = false;
  if (!plus) {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: row, error } = await supabase
        .from("users")
        .select("free_quote_used_at")
        .eq("id", user.id)
        .maybeSingle();
      // If the column isn't live yet (migration 0027 not run), error is set
      // and we fall back to the old Plus-only redirect.
      freeTaste = !error && !!row && row.free_quote_used_at === null;
    }
    if (!freeTaste) redirect("/plus?reason=quote");
  }

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

      {freeTaste && (
        <div className="card border-hearth-200 bg-hearth-50 text-center">
          <p className="text-sm text-hearth-800">
            This one&apos;s on us. Your first quote check is free, Hearth Plus
            makes it unlimited.
          </p>
        </div>
      )}

      <QuoteAnalyzer freeTaste={freeTaste} />
    </div>
  );
}
