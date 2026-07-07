// Detect a price a contractor stated in a chat message, so the homeowner can
// compare quotes without anyone typing them in. We only trust explicit "$"
// amounts, which avoids mistaking a phone number or an address for a price, and
// we take the largest amount in a message because a quote is usually the
// headline figure. Values under 50 are ignored as likely not a real quote.
export function extractQuote(body: string): number | null {
  if (!body) return null;
  const matches = body.match(/\$\s?\d[\d,]*(?:\.\d{1,2})?/g);
  if (!matches) return null;
  let max = 0;
  for (const m of matches) {
    const n = Number(m.replace(/[$,\s]/g, ""));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max >= 50 ? Math.round(max) : null;
}

export function formatUSD(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

// Parse a dollar amount typed as a string (e.g. "1,200" or "1200.50") into
// integer cents. This is the one place that conversion happens for a
// structured quote line item: the server action calls this once per line
// item, and every total shown afterward is a sum of already-converted
// amount_cents, never a re-parse of the original string. Returns null for
// anything that isn't a valid, non-negative amount.
export function dollarsToCents(input: string): number | null {
  const trimmed = input.trim().replace(/[$,\s]/g, "");
  if (!trimmed) return null;
  const dollars = Number(trimmed);
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

// Format an integer cents amount as a dollar string: whole dollar amounts
// drop the cents ("$1,200"), everything else keeps two decimals ("$1,200.50").
export function formatUSDCents(cents: number): string {
  const dollars = cents / 100;
  const whole = Number.isInteger(dollars);
  return (
    "$" +
    dollars.toLocaleString("en-US", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}
