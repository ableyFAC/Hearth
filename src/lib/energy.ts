// Pure math for the "seasonal energy cost estimate" feature. No DB access
// here: pages read the property (sqft, year_built, state) and the HVAC row
// from home_systems and pass everything in, along with the current year
// (never call argless `new Date()`), mirroring homeValue.ts and forecast.ts.
//
// The honest framing: this is a ballpark range, never a point estimate. Real
// bills swing with thermostat habits, insulation, weather, and utility rate
// plans, so every output is a low-high band roughly plus or minus 30% around
// a modeled midpoint, with the assumptions spelled out for the page to show.

// Approximate residential energy prices by state: dollars per kWh of
// electricity and dollars per therm of natural gas. Modeled on EIA (U.S.
// Energy Information Administration) average residential price data. These
// are a STATIC approximation baked in at build time, not a live feed, exactly
// like STATE_APPRECIATION_RATES in homeValue.ts: they will drift out of date
// and do not capture utility-to-utility differences within a state.
export interface EnergyPrices {
  electricity: number; // $ per kWh
  gas: number; // $ per therm
}

export const STATE_ENERGY_PRICES: Record<string, EnergyPrices> = {
  AL: { electricity: 0.15, gas: 1.9 },
  AK: { electricity: 0.24, gas: 1.1 },
  AZ: { electricity: 0.14, gas: 1.9 },
  AR: { electricity: 0.12, gas: 1.4 },
  CA: { electricity: 0.3, gas: 2.3 },
  CO: { electricity: 0.14, gas: 1.1 },
  CT: { electricity: 0.28, gas: 1.7 },
  DE: { electricity: 0.15, gas: 1.5 },
  DC: { electricity: 0.17, gas: 1.6 },
  FL: { electricity: 0.15, gas: 2.6 },
  GA: { electricity: 0.14, gas: 1.7 },
  HI: { electricity: 0.42, gas: 5.0 },
  ID: { electricity: 0.11, gas: 1.0 },
  IL: { electricity: 0.16, gas: 1.1 },
  IN: { electricity: 0.15, gas: 1.1 },
  IA: { electricity: 0.13, gas: 1.1 },
  KS: { electricity: 0.14, gas: 1.1 },
  KY: { electricity: 0.13, gas: 1.2 },
  LA: { electricity: 0.12, gas: 1.4 },
  ME: { electricity: 0.27, gas: 2.0 },
  MD: { electricity: 0.17, gas: 1.5 },
  MA: { electricity: 0.3, gas: 2.1 },
  MI: { electricity: 0.18, gas: 1.1 },
  MN: { electricity: 0.14, gas: 1.0 },
  MS: { electricity: 0.13, gas: 1.5 },
  MO: { electricity: 0.12, gas: 1.3 },
  MT: { electricity: 0.12, gas: 1.0 },
  NE: { electricity: 0.11, gas: 1.0 },
  NV: { electricity: 0.14, gas: 1.2 },
  NH: { electricity: 0.28, gas: 1.9 },
  NJ: { electricity: 0.18, gas: 1.3 },
  NM: { electricity: 0.14, gas: 1.1 },
  NY: { electricity: 0.22, gas: 1.6 },
  NC: { electricity: 0.13, gas: 1.6 },
  ND: { electricity: 0.11, gas: 0.9 },
  OH: { electricity: 0.15, gas: 1.2 },
  OK: { electricity: 0.12, gas: 1.2 },
  OR: { electricity: 0.13, gas: 1.4 },
  PA: { electricity: 0.17, gas: 1.4 },
  RI: { electricity: 0.28, gas: 2.0 },
  SC: { electricity: 0.14, gas: 1.7 },
  SD: { electricity: 0.12, gas: 1.0 },
  TN: { electricity: 0.12, gas: 1.3 },
  TX: { electricity: 0.14, gas: 1.3 },
  UT: { electricity: 0.11, gas: 1.0 },
  VT: { electricity: 0.21, gas: 1.7 },
  VA: { electricity: 0.14, gas: 1.4 },
  WA: { electricity: 0.11, gas: 1.3 },
  WV: { electricity: 0.14, gas: 1.2 },
  WI: { electricity: 0.16, gas: 1.0 },
  WY: { electricity: 0.11, gas: 1.0 },
};

// National-ballpark fallback when the state is missing or unrecognized, so
// the estimate degrades gracefully instead of disappearing.
export const DEFAULT_ENERGY_PRICES: EnergyPrices = { electricity: 0.16, gas: 1.4 };

// Approximate annual heating and cooling degree days (base 65F) by state.
// Modeled on NOAA 30-year climate normals, leaning toward where people in
// each state actually live (Nevada reads more like Las Vegas than Ely).
// STATIC approximation of public NOAA data, not a live feed: single statewide
// bands cannot capture mountain-vs-valley or coast-vs-inland differences.
export interface DegreeDays {
  hdd: number; // heating degree days per year
  cdd: number; // cooling degree days per year
}

export const STATE_DEGREE_DAYS: Record<string, DegreeDays> = {
  AL: { hdd: 2600, cdd: 1900 },
  AK: { hdd: 13000, cdd: 50 },
  AZ: { hdd: 1600, cdd: 3300 },
  AR: { hdd: 3200, cdd: 2000 },
  CA: { hdd: 2600, cdd: 900 },
  CO: { hdd: 6200, cdd: 700 },
  CT: { hdd: 5800, cdd: 700 },
  DE: { hdd: 4700, cdd: 1100 },
  DC: { hdd: 4200, cdd: 1500 },
  FL: { hdd: 600, cdd: 3500 },
  GA: { hdd: 2800, cdd: 1800 },
  HI: { hdd: 0, cdd: 4000 },
  ID: { hdd: 6800, cdd: 700 },
  IL: { hdd: 5900, cdd: 1000 },
  IN: { hdd: 5500, cdd: 1000 },
  IA: { hdd: 6600, cdd: 1000 },
  KS: { hdd: 4800, cdd: 1500 },
  KY: { hdd: 4400, cdd: 1300 },
  LA: { hdd: 1600, cdd: 2800 },
  ME: { hdd: 7500, cdd: 300 },
  MD: { hdd: 4600, cdd: 1100 },
  MA: { hdd: 6300, cdd: 600 },
  MI: { hdd: 6800, cdd: 600 },
  MN: { hdd: 7900, cdd: 700 },
  MS: { hdd: 2300, cdd: 2300 },
  MO: { hdd: 4900, cdd: 1400 },
  MT: { hdd: 7800, cdd: 400 },
  NE: { hdd: 6100, cdd: 1100 },
  NV: { hdd: 3000, cdd: 2600 },
  NH: { hdd: 7300, cdd: 400 },
  NJ: { hdd: 5000, cdd: 1000 },
  NM: { hdd: 4200, cdd: 1300 },
  NY: { hdd: 6200, cdd: 700 },
  NC: { hdd: 3400, cdd: 1600 },
  ND: { hdd: 8800, cdd: 500 },
  OH: { hdd: 5700, cdd: 900 },
  OK: { hdd: 3700, cdd: 2100 },
  OR: { hdd: 4800, cdd: 400 },
  PA: { hdd: 5800, cdd: 800 },
  RI: { hdd: 5800, cdd: 700 },
  SC: { hdd: 2900, cdd: 2000 },
  SD: { hdd: 7300, cdd: 800 },
  TN: { hdd: 3600, cdd: 1600 },
  TX: { hdd: 1700, cdd: 2900 },
  UT: { hdd: 5600, cdd: 1100 },
  VT: { hdd: 7700, cdd: 300 },
  VA: { hdd: 4000, cdd: 1400 },
  WA: { hdd: 5000, cdd: 300 },
  WV: { hdd: 4800, cdd: 900 },
  WI: { hdd: 7300, cdd: 600 },
  WY: { hdd: 7700, cdd: 300 },
};

// National-ballpark fallback degree days when the state is unknown.
export const DEFAULT_DEGREE_DAYS: DegreeDays = { hdd: 4500, cdd: 1200 };

export function energyPricesFor(state: string | null | undefined): EnergyPrices {
  if (!state) return DEFAULT_ENERGY_PRICES;
  return STATE_ENERGY_PRICES[state.toUpperCase()] ?? DEFAULT_ENERGY_PRICES;
}

export function degreeDaysFor(state: string | null | undefined): DegreeDays {
  if (!state) return DEFAULT_DEGREE_DAYS;
  return STATE_DEGREE_DAYS[state.toUpperCase()] ?? DEFAULT_DEGREE_DAYS;
}

// ---------------------------------------------------------------------------
// Model constants. All static approximations of public engineering rules of
// thumb (ACCA sizing guides, ENERGY STAR literature), kept deliberately
// simple: the output is a plus-or-minus-30% band, so two decimal places of
// physics would be false precision.
// ---------------------------------------------------------------------------

// Assumed size when the property has no square footage on file (roughly the
// US median single-family home). Always disclosed via an assumption note.
export const DEFAULT_SQFT = 1800;

// Seasonal heat loss/gain per square foot per degree day, in BTU. Cooling
// runs a bit higher per degree day because of solar gain and humidity load.
const HEATING_BTU_PER_SQFT_HDD = 6;
const COOLING_BTU_PER_SQFT_CDD = 8;

// Fuel conversion: a typical gas furnace delivers ~85% of a therm's 100,000
// BTU into the house; a heat pump moves ~2.5 BTU per BTU of electricity
// (COP 2.5); central AC removes ~11,000 BTU per kWh (effective SEER ~11
// across the mixed-age installed base, not a new unit's nameplate rating).
const BTU_PER_THERM = 100_000;
const GAS_FURNACE_EFFICIENCY = 0.85;
const BTU_PER_KWH = 3_412;
const HEAT_PUMP_COP = 2.5;
const AC_BTU_REMOVED_PER_KWH = 11_000;

// Building-vintage multipliers: older homes leak more air and have thinner
// insulation, so the same weather costs more to fight. Pre-1980 homes predate
// most state energy codes; 1980-2005 homes are in between; post-2005 is the
// baseline. Unknown year gets the middle band plus an assumption note.
const VINTAGE_PRE_1980 = 1.3;
const VINTAGE_1980_2005 = 1.15;
const VINTAGE_MODERN = 1.0;

// An HVAC unit past ~15 years runs meaningfully below its original
// efficiency (worn compressors, refrigerant drift, duct leakage).
export const OLD_HVAC_AGE_YEARS = 15;
const OLD_HVAC_MULTIPLIER = 1.15;

// Honest-range half-width: the band is midpoint plus or minus 30%.
const RANGE_SPREAD = 0.3;

// Below this many degree days, the season's load is negligible and the
// estimate comes back null instead of a number. Warm states genuinely have
// near-zero heating loads (Hawaii's hdd is 0), but a "$0 - $0" stat rendered
// in a confident font reads broken, so callers skip the card/section instead.
const MIN_SEASONAL_DEGREE_DAYS = 150;

export type EnergySeason = "winter" | "summer";

export interface SeasonalEnergyEstimate {
  low: number;
  high: number;
  season: EnergySeason;
  assumptions: string[];
}

export interface SeasonalEnergyInput {
  sqft: number | null | undefined;
  yearBuilt: number | null | undefined;
  state: string | null | undefined;
  hvacInstallYear: number | null | undefined;
  // Free-text HVAC description (e.g. home_systems.material_or_model). Only
  // used to guess electric heat (heat pump / mini split) vs a gas furnace.
  hvacType?: string | null;
  season: EnergySeason;
  currentYear: number;
}

// True when the HVAC description reads like electric heating (heat pump,
// mini split, electric furnace) rather than a gas furnace.
function looksElectricHeat(hvacType: string | null | undefined): boolean {
  if (!hvacType) return false;
  return /heat\s*pump|mini\s*split|electric/i.test(hvacType);
}

function vintageMultiplier(yearBuilt: number | null | undefined): {
  multiplier: number;
  note: string | null;
} {
  if (yearBuilt == null) {
    return {
      multiplier: VINTAGE_1980_2005,
      note: "We do not know the year your home was built, so we assumed average insulation for its era.",
    };
  }
  if (yearBuilt < 1980) {
    return {
      multiplier: VINTAGE_PRE_1980,
      note: "Homes built before 1980 usually leak more heat, so we bumped the estimate up.",
    };
  }
  if (yearBuilt <= 2005) {
    return { multiplier: VINTAGE_1980_2005, note: null };
  }
  return { multiplier: VINTAGE_MODERN, note: null };
}

// Estimate what one heating or cooling season will cost, as an honest dollar
// range. The midpoint scales square footage by the state's degree days, then
// converts that energy need into fuel dollars at the state's typical prices,
// with multipliers for an older building shell and an aging HVAC unit.
// Returns null when the season's degree days fall below the negligible-load
// floor (see MIN_SEASONAL_DEGREE_DAYS); callers hide the stat entirely.
export function estimateSeasonalEnergyCost(
  input: SeasonalEnergyInput
): SeasonalEnergyEstimate | null {
  const assumptions: string[] = [];

  const sqft = input.sqft ?? DEFAULT_SQFT;
  if (input.sqft == null) {
    assumptions.push(
      `No square footage on file, so we assumed about ${DEFAULT_SQFT.toLocaleString()} sqft.`
    );
  }

  if (!input.state) {
    assumptions.push(
      "No state on file, so we used national-average weather and energy prices."
    );
  }
  const prices = energyPricesFor(input.state);
  const dd = degreeDaysFor(input.state);

  // Negligible-load seasons (a Hawaii winter, for example) would produce a
  // $0-ish range that reads like a bug rather than a fact. Bail out so the
  // caller skips the stat instead of rendering it.
  const seasonDegreeDays = input.season === "winter" ? dd.hdd : dd.cdd;
  if (seasonDegreeDays < MIN_SEASONAL_DEGREE_DAYS) return null;

  const vintage = vintageMultiplier(input.yearBuilt);
  if (vintage.note) assumptions.push(vintage.note);

  const hvacAge =
    input.hvacInstallYear != null ? input.currentYear - input.hvacInstallYear : null;
  let hvacMultiplier = 1.0;
  if (hvacAge != null && hvacAge >= OLD_HVAC_AGE_YEARS) {
    hvacMultiplier = OLD_HVAC_MULTIPLIER;
    assumptions.push(
      `Your HVAC is about ${hvacAge} years old, and older units run less efficiently, so we bumped the estimate up.`
    );
  } else if (hvacAge == null) {
    assumptions.push(
      "No HVAC install year on file, so we assumed typical equipment efficiency."
    );
  }

  let mid: number;
  if (input.season === "winter") {
    const btuNeeded =
      sqft * HEATING_BTU_PER_SQFT_HDD * dd.hdd * vintage.multiplier * hvacMultiplier;
    if (looksElectricHeat(input.hvacType)) {
      const kwh = btuNeeded / (BTU_PER_KWH * HEAT_PUMP_COP);
      mid = kwh * prices.electricity;
      assumptions.push("Assumes electric heat (your HVAC looks like a heat pump).");
    } else {
      const therms = btuNeeded / (BTU_PER_THERM * GAS_FURNACE_EFFICIENCY);
      mid = therms * prices.gas;
      assumptions.push("Assumes a natural gas furnace, the most common US setup.");
    }
  } else {
    const btuRemoved =
      sqft * COOLING_BTU_PER_SQFT_CDD * dd.cdd * vintage.multiplier * hvacMultiplier;
    const kwh = btuRemoved / AC_BTU_REMOVED_PER_KWH;
    mid = kwh * prices.electricity;
  }

  assumptions.push(
    "Ballpark from typical energy prices and 30-year weather averages for your state, give or take 30%. Your thermostat habits matter more than any formula."
  );

  return {
    low: Math.round(mid * (1 - RANGE_SPREAD)),
    high: Math.round(mid * (1 + RANGE_SPREAD)),
    season: input.season,
    assumptions,
  };
}

export interface UpgradeSavingsEstimate {
  low: number; // $ per year
  high: number; // $ per year
  hvacAge: number;
  assumptions: string[];
}

export interface UpgradeSavingsInput {
  sqft: number | null | undefined;
  yearBuilt: number | null | undefined;
  state: string | null | undefined;
  hvacInstallYear: number | null | undefined;
  hvacType?: string | null;
  currentYear: number;
}

// Fraction of annual heating + cooling spend a modern high-efficiency unit
// typically saves over a 15+ year old one. Modeled on ENERGY STAR guidance
// on the efficiency gap between old and new equipment (roughly 15-30% of
// HVAC energy use). STATIC approximation, not a quote or an audit.
const UPGRADE_SAVINGS_LOW_FRACTION = 0.15;
const UPGRADE_SAVINGS_HIGH_FRACTION = 0.3;

// Rough annual savings range from replacing a 15+ year old HVAC unit with a
// modern one. Returns null when there is no HVAC install year on file or the
// unit is younger than the threshold: without a real age, a savings claim
// would be a guess dressed up as advice.
export function estimateUpgradeSavings(
  input: UpgradeSavingsInput
): UpgradeSavingsEstimate | null {
  if (input.hvacInstallYear == null) return null;
  const hvacAge = input.currentYear - input.hvacInstallYear;
  if (hvacAge < OLD_HVAC_AGE_YEARS) return null;

  // Annual HVAC spend = one heating season + one cooling season, as the
  // unit runs today (old-unit multiplier included, since that inefficiency
  // is exactly what a new unit would claw back). A season can come back null
  // when its load is negligible (a Hawaii winter): that season contributes
  // nothing to annual spend, and if both are negligible there is no HVAC
  // spend to save on, so no savings claim either.
  const winter = estimateSeasonalEnergyCost({ ...input, season: "winter" });
  const summer = estimateSeasonalEnergyCost({ ...input, season: "summer" });
  if (!winter && !summer) return null;
  const annualMid =
    (winter ? (winter.low + winter.high) / 2 : 0) +
    (summer ? (summer.low + summer.high) / 2 : 0);

  return {
    low: Math.round(annualMid * UPGRADE_SAVINGS_LOW_FRACTION),
    high: Math.round(annualMid * UPGRADE_SAVINGS_HIGH_FRACTION),
    hvacAge,
    assumptions: [
      "Modeled on the typical ENERGY STAR efficiency gap between a 15+ year old unit and a modern one, roughly 15-30% of heating and cooling costs.",
      "A rough planning number, not a quote. Actual savings depend on the unit you pick and your home's ductwork and insulation.",
    ],
  };
}
