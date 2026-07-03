// Pure forecasting math for the "Home Cost Forecast + Repair Fund" feature
// (Hearth Plus). No DB access here - the page loads home_systems and passes
// them in, along with the current year (never call argless `new Date()`).
//
// Reuses the same lifespan and cost tables the Home Health score is built on
// (src/lib/health.ts), so a system's forecasted replacement year and cost
// range always agree with what the health tab already says about it.
import type { HomeSystem } from "@/lib/database.types";
import { DEFAULT_LIFESPANS, REPLACEMENT_INFO } from "@/lib/health";

export interface ForecastItem {
  system: HomeSystem;
  age: number | null;
  lifespan: number;
  yearsLeft: number;
  replacementYear: number;
  costLow: number;
  costHigh: number;
  costMid: number;
}

export interface Forecast {
  horizonYears: number;
  timeline: ForecastItem[]; // every system with a cost range, soonest first
  dueSoon: ForecastItem[]; // yearsLeft <= 1
  totalMidCost: number; // sum of cost midpoints for systems due within the horizon
  monthlySetAside: number; // recommended monthly repair-fund contribution
}

// Years left before a system likely needs replacing, adjusted for the
// owner-reported condition. Mirrors health.ts's effectiveYearsLeft, but
// takes install_year/condition directly and always returns a number: a
// system with no install year is treated as being at the midpoint of its
// typical lifespan, so it still lands somewhere on the timeline instead of
// disappearing from the forecast.
function yearsLeftFor(
  system: Pick<HomeSystem, "system_type" | "install_year" | "condition_rating">,
  currentYear: number,
  lifespan: number
): { age: number | null; yearsLeft: number } {
  const age = system.install_year != null ? currentYear - system.install_year : null;
  const ageBased = age != null ? lifespan - age : Math.round(lifespan / 2);

  const c = system.condition_rating;
  let cap: number | null = null;
  if (c === 1) cap = 0; // failing - now
  else if (c === 2) cap = 2; // worn - within ~2 years
  else if (c === 3) cap = 5; // fair - within ~5 years

  const yearsLeft = cap == null ? ageBased : Math.min(ageBased, cap);
  return { age, yearsLeft };
}

// Build the full cost forecast for one property's systems over the given
// horizon (default 10 years). `currentYear` must be passed in by the caller
// (e.g. new Date(Date.now()).getFullYear()).
export function buildForecast(
  systems: HomeSystem[],
  currentYear: number,
  horizonYears = 10
): Forecast {
  const items: ForecastItem[] = systems.map((system) => {
    const lifespan =
      system.expected_lifespan_years ?? DEFAULT_LIFESPANS[system.system_type] ?? 20;
    const { age, yearsLeft } = yearsLeftFor(system, currentYear, lifespan);
    const cost = REPLACEMENT_INFO[system.system_type] ?? { low: 1000, high: 5000 };
    const costLow = cost.low;
    const costHigh = cost.high;

    return {
      system,
      age,
      lifespan,
      yearsLeft,
      replacementYear: currentYear + Math.max(0, yearsLeft),
      costLow,
      costHigh,
      costMid: Math.round((costLow + costHigh) / 2),
    };
  });

  const timeline = [...items].sort((a, b) => a.yearsLeft - b.yearsLeft);

  const dueSoon = timeline.filter((i) => i.yearsLeft <= 1);

  const withinHorizon = timeline.filter((i) => i.yearsLeft <= horizonYears);
  const totalMidCost = withinHorizon.reduce((sum, i) => sum + i.costMid, 0);

  const monthlySetAside = Math.round(totalMidCost / (horizonYears * 12));

  return { horizonYears, timeline, dueSoon, totalMidCost, monthlySetAside };
}
