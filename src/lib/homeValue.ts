// Pure math for the free "Home Value & Equity" tracker. No DB access here:
// the page reads purchase_price, the purchase year (derived from
// properties.purchase_date), and mortgage_balance, and passes them in along
// with the current year (never call argless `new Date()`).
//
// The whole estimate rests on one simplification: home prices in a state rise
// at roughly the same clip every year. Real markets don't move that smoothly,
// but a single compounding rate is honest about what this feature is, a quick
// ballpark, not a substitute for an appraisal or a comparative market analysis
// from a real estate agent.

// Approximate recent average annual home-price appreciation by state, modeled
// on FHFA House Price Index trends (the federal index tracking repeat sales
// and refinances nationwide). These numbers are a static snapshot baked in at
// build time, not a live feed: they will drift out of date and do not capture
// city-to-city swings within a state. Good enough for "about how much has my
// home probably gone up," not for pricing a sale.
export const STATE_APPRECIATION_RATES: Record<string, number> = {
  AL: 0.06,
  AK: 0.04,
  AZ: 0.075,
  AR: 0.06,
  CA: 0.06,
  CO: 0.065,
  CT: 0.05,
  DE: 0.06,
  DC: 0.05,
  FL: 0.08,
  GA: 0.07,
  HI: 0.055,
  ID: 0.09,
  IL: 0.045,
  IN: 0.06,
  IA: 0.055,
  KS: 0.055,
  KY: 0.055,
  LA: 0.04,
  ME: 0.07,
  MD: 0.05,
  MA: 0.06,
  MI: 0.06,
  MN: 0.055,
  MS: 0.055,
  MO: 0.06,
  MT: 0.075,
  NE: 0.06,
  NV: 0.075,
  NH: 0.065,
  NJ: 0.055,
  NM: 0.065,
  NY: 0.045,
  NC: 0.07,
  ND: 0.04,
  OH: 0.06,
  OK: 0.055,
  OR: 0.065,
  PA: 0.055,
  RI: 0.065,
  SC: 0.07,
  SD: 0.06,
  TN: 0.075,
  TX: 0.065,
  UT: 0.08,
  VT: 0.06,
  VA: 0.06,
  WA: 0.07,
  WV: 0.045,
  WI: 0.055,
  WY: 0.05,
};

// Used whenever a property's state is missing or not one we have a rate for,
// so the estimate degrades to a reasonable national ballpark instead of
// disappearing. Clearly labeled so callers/readers know this is the fallback,
// not a real state's figure.
export const DEFAULT_APPRECIATION_RATE = 0.05;

// Annual appreciation rate for a state, defaulting to DEFAULT_APPRECIATION_RATE
// when the state is missing or unrecognized.
export function appreciationRateFor(state: string | null | undefined): number {
  if (!state) return DEFAULT_APPRECIATION_RATE;
  return STATE_APPRECIATION_RATES[state.toUpperCase()] ?? DEFAULT_APPRECIATION_RATE;
}

// Compounds the state's annual rate from the purchase year to the current
// year to estimate today's value. A purchase year in the future, or equal to
// the current year, is treated as zero elapsed years (returns purchasePrice
// unchanged) rather than producing a negative or inflated result.
export function estimateHomeValue(
  purchasePrice: number,
  purchaseYear: number,
  state: string | null | undefined,
  currentYear: number
): number {
  const rate = appreciationRateFor(state);
  const years = Math.max(0, currentYear - purchaseYear);
  return Math.round(purchasePrice * Math.pow(1 + rate, years));
}

// One estimated value per year from the purchase year through the current
// year, for a simple growth chart. Always at least one point (the purchase
// year itself), even if purchaseYear >= currentYear.
export interface ValuePoint {
  year: number;
  value: number;
}

export function estimateValueTimeline(
  purchasePrice: number,
  purchaseYear: number,
  state: string | null | undefined,
  currentYear: number
): ValuePoint[] {
  const lastYear = Math.max(purchaseYear, currentYear);
  const points: ValuePoint[] = [];
  for (let year = purchaseYear; year <= lastYear; year++) {
    points.push({ year, value: estimateHomeValue(purchasePrice, purchaseYear, state, year) });
  }
  return points;
}

// Home equity: what the estimated value minus what is still owed. A null or
// missing mortgage balance is treated as 0 (an owner who hasn't entered a
// balance, or has paid off the home), not as "unknown", so the math never
// breaks. This intentionally does NOT floor the result at 0: if the mortgage
// balance is higher than the estimated value, the homeowner is genuinely
// underwater, and hiding that behind a floor would be dishonest. The page is
// responsible for framing a negative number gently in the UI.
export function calculateEquity(
  estimatedValue: number,
  mortgageBalance: number | null | undefined
): number {
  const balance = mortgageBalance ?? 0;
  return estimatedValue - balance;
}
