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
