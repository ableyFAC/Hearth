// Static context numbers for the "Home insurance" card on /documents, the
// renewal-nudge cron (/api/cron/insurance-renewal), and the requote packet.
// No DB access here, pure data, same convention as src/lib/homeValue.ts.
//
// Approximate average annual home insurance premiums by state and how much
// they moved over the last year, modeled on published Insurify and
// LendingTree market reports (national average around $2,948 in 2025, up
// roughly 12% year over year). These are STATIC APPROXIMATIONS baked in at
// build time and refreshed by hand about once a year, not a live feed: they
// will drift, they hide huge city-to-city and home-to-home swings, and a
// homeowner's real premium depends on their coverage, deductible, claims
// history, and insurer. Good enough for "about where does my state sit,"
// never for judging one specific policy.

export interface StateInsuranceRate {
  // Approximate average annual premium in dollars.
  avgPremium: number;
  // Approximate change over the last year, in percent (12 means "up ~12%").
  trendPct: number;
}

export const STATE_INSURANCE_RATES: Record<string, StateInsuranceRate> = {
  AL: { avgPremium: 3900, trendPct: 18 },
  AK: { avgPremium: 1500, trendPct: 6 },
  AZ: { avgPremium: 2500, trendPct: 14 },
  AR: { avgPremium: 3400, trendPct: 14 },
  CA: { avgPremium: 1900, trendPct: 21 },
  CO: { avgPremium: 3900, trendPct: 15 },
  CT: { avgPremium: 2100, trendPct: 9 },
  DE: { avgPremium: 1200, trendPct: 8 },
  DC: { avgPremium: 1400, trendPct: 7 },
  FL: { avgPremium: 11000, trendPct: 9 },
  GA: { avgPremium: 2600, trendPct: 11 },
  HI: { avgPremium: 1400, trendPct: 6 },
  ID: { avgPremium: 1700, trendPct: 12 },
  IL: { avgPremium: 2400, trendPct: 12 },
  IN: { avgPremium: 2500, trendPct: 12 },
  IA: { avgPremium: 2600, trendPct: 13 },
  KS: { avgPremium: 3500, trendPct: 17 },
  KY: { avgPremium: 2800, trendPct: 12 },
  LA: { avgPremium: 9500, trendPct: 27 },
  ME: { avgPremium: 1500, trendPct: 8 },
  MD: { avgPremium: 1900, trendPct: 9 },
  MA: { avgPremium: 1900, trendPct: 7 },
  MI: { avgPremium: 2400, trendPct: 12 },
  MN: { avgPremium: 2800, trendPct: 12 },
  MS: { avgPremium: 4300, trendPct: 15 },
  MO: { avgPremium: 3100, trendPct: 14 },
  MT: { avgPremium: 2700, trendPct: 12 },
  NE: { avgPremium: 3600, trendPct: 16 },
  NV: { avgPremium: 1600, trendPct: 12 },
  NH: { avgPremium: 1500, trendPct: 8 },
  NJ: { avgPremium: 1500, trendPct: 9 },
  NM: { avgPremium: 2300, trendPct: 12 },
  NY: { avgPremium: 2100, trendPct: 8 },
  NC: { avgPremium: 2700, trendPct: 8 },
  ND: { avgPremium: 2700, trendPct: 12 },
  OH: { avgPremium: 1900, trendPct: 10 },
  OK: { avgPremium: 6000, trendPct: 24 },
  OR: { avgPremium: 1500, trendPct: 12 },
  PA: { avgPremium: 1800, trendPct: 10 },
  RI: { avgPremium: 2100, trendPct: 8 },
  SC: { avgPremium: 3200, trendPct: 10 },
  SD: { avgPremium: 2900, trendPct: 14 },
  TN: { avgPremium: 2900, trendPct: 10 },
  TX: { avgPremium: 4700, trendPct: 10 },
  UT: { avgPremium: 1600, trendPct: 12 },
  VT: { avgPremium: 1200, trendPct: 7 },
  VA: { avgPremium: 2100, trendPct: 9 },
  WA: { avgPremium: 1700, trendPct: 12 },
  WV: { avgPremium: 1600, trendPct: 10 },
  WI: { avgPremium: 1700, trendPct: 10 },
  WY: { avgPremium: 2000, trendPct: 12 },
};

// Used whenever a property's state is missing or not one we have numbers
// for, so the context line degrades to a national ballpark instead of
// disappearing. Same convention as DEFAULT_APPRECIATION_RATE in
// src/lib/homeValue.ts: clearly labeled so readers know this is the
// fallback, not a real state's figure.
export const DEFAULT_INSURANCE_RATE: StateInsuranceRate = {
  avgPremium: 2950,
  trendPct: 12,
};

// Approximate premium context for a state, defaulting to
// DEFAULT_INSURANCE_RATE when the state is missing or unrecognized.
export function insuranceRateFor(
  state: string | null | undefined
): StateInsuranceRate {
  if (!state) return DEFAULT_INSURANCE_RATE;
  return STATE_INSURANCE_RATES[state.toUpperCase()] ?? DEFAULT_INSURANCE_RATE;
}
