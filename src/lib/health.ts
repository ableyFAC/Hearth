import type { HomeSystem, Issue } from "@/lib/database.types";
import { labelFor, SYSTEM_TYPES, ISSUE_CATEGORIES } from "@/lib/constants";

// Fallback lifespans (years) used when system_lifespans isn't loaded or a
// system has no stored expected_lifespan_years. Mirrors the seed in 0003.
export const DEFAULT_LIFESPANS: Record<string, number> = {
  roof: 22,
  hvac: 18,
  water_heater: 11,
  electrical_panel: 35,
  plumbing: 50,
  windows: 25,
  foundation: 75,
  appliance: 12,
  gutters: 25,
  siding: 30,
  garage_door: 20,
  deck: 20,
  driveway: 30,
  sump_pump: 10,
  sewer_line: 50,
  fence: 18,
};

// Rough national replacement cost RANGES (USD) plus a plain explanation of what
// drives the price. Ballpark planning figures, not quotes.
export interface ReplacementInfo {
  low: number;
  high: number;
  why: string;
}

export const REPLACEMENT_INFO: Record<string, ReplacementInfo> = {
  roof: {
    low: 8000,
    high: 18000,
    why: "Mostly the size and pitch of the roof, the material (asphalt shingles are cheapest; metal, tile, and slate cost much more), tearing off the old roof, and repairing any rotted decking underneath.",
  },
  hvac: {
    low: 5000,
    high: 10000,
    why: "The unit size your home needs, its efficiency rating, whether the ductwork needs work, and the labor to install it and charge the refrigerant.",
  },
  water_heater: {
    low: 1200,
    high: 3500,
    why: "Tank vs tankless (tankless costs more upfront), gas vs electric, the capacity, and any venting or plumbing changes.",
  },
  electrical_panel: {
    low: 1500,
    high: 4000,
    why: "The amperage (200A costs more than 100A), whether the meter or wiring also needs upgrading, permits, and an electrician's labor.",
  },
  plumbing: {
    low: 4000,
    high: 15000,
    why: "A whole-home repipe scales with the home's size, number of bathrooms, pipe material (copper costs more than PEX), and how much wall access is needed.",
  },
  windows: {
    low: 5000,
    high: 15000,
    why: "The number of windows, frame material, glass type (double vs triple pane), and any frame or trim repairs.",
  },
  foundation: {
    low: 3000,
    high: 12000,
    why: "The type and extent of the damage, how accessible it is, and whether it's minor crack sealing or major structural work like piers.",
  },
  appliance: {
    low: 600,
    high: 3000,
    why: "The appliance type and brand, its capacity and features, and installation or haul-away of the old unit.",
  },
  gutters: {
    low: 1000,
    high: 3000,
    why: "The linear footage, material (aluminum vs copper), seamless vs sectional, and the number of downspouts.",
  },
  siding: {
    low: 8000,
    high: 20000,
    why: "The home's square footage, material (vinyl is cheapest; fiber cement and wood cost more), removing the old siding, and any house wrap or insulation.",
  },
  garage_door: {
    low: 800,
    high: 2500,
    why: "Single vs double, the material and insulation, and whether the opener and springs are replaced too.",
  },
  deck: {
    low: 4000,
    high: 12000,
    why: "The size, material (pressure-treated wood vs composite), railings, and any footings or permits.",
  },
  driveway: {
    low: 3000,
    high: 8000,
    why: "The square footage, material (concrete vs asphalt vs pavers), demolition of the old surface, and grading.",
  },
  sump_pump: {
    low: 400,
    high: 1200,
    why: "The pump type, whether a battery backup is added, and any work on the pit or discharge line.",
  },
  sewer_line: {
    low: 3000,
    high: 8000,
    why: "The length and depth of the line, the method (traditional dig vs trenchless), and whether it runs under landscaping or the driveway.",
  },
  fence: {
    low: 2000,
    high: 7000,
    why: "The linear footage, material (wood, vinyl, metal), height, and how hard the terrain is to set posts in.",
  },
};

export function replacementInfoFor(systemType: string): ReplacementInfo | null {
  return REPLACEMENT_INFO[systemType] ?? null;
}

export type LifeStage = "healthy" | "aging" | "due" | "unknown";

export interface SystemHealth {
  system: HomeSystem;
  age: number | null;
  lifespan: number;
  remaining: number | null; // years left; negative = past expected life
  stage: LifeStage;
  message: string;
}

const CURRENT_YEAR = new Date().getFullYear();

export function assessSystem(system: HomeSystem): SystemHealth {
  const lifespan =
    system.expected_lifespan_years ??
    DEFAULT_LIFESPANS[system.system_type] ??
    20;

  if (!system.install_year) {
    return {
      system,
      age: null,
      lifespan,
      remaining: null,
      stage: "unknown",
      message: "Add an install year to get a lifespan estimate.",
    };
  }

  const age = CURRENT_YEAR - system.install_year;
  const remaining = lifespan - age;
  let stage: LifeStage;
  let message: string;

  if (remaining <= 0) {
    stage = "due";
    message = `This system is ${age} years old. It is past the typical ${lifespan} year lifespan, so plan a replacement.`;
  } else if (remaining <= 3) {
    stage = "due";
    message = `This system is ${age} years old. The typical lifespan is ${lifespan} years, so budget for a replacement soon.`;
  } else if (remaining <= lifespan * 0.4) {
    stage = "aging";
    message = `This system is ${age} years old. It has roughly ${remaining} years of typical life left.`;
  } else {
    stage = "healthy";
    message = `This system is ${age} years old and in good shape. The typical lifespan is ${lifespan} years.`;
  }

  return { system, age, lifespan, remaining, stage, message };
}

// Years until likely replacement, ADJUSTED for the owner-reported condition.
// Age alone isn't enough - a system rated failing (1) or worn (2) needs action
// much sooner than its typical lifespan implies, so we cap the years left.
export function effectiveYearsLeft(system: HomeSystem): number | null {
  const ageBased = assessSystem(system).remaining;
  const c = system.condition_rating;
  let cap: number | null = null;
  if (c === 1) cap = 0; // failing - now
  else if (c === 2) cap = 2; // worn - within ~2 years
  else if (c === 3) cap = 5; // fair - within ~5 years
  if (cap == null) return ageBased; // good / unknown: no adjustment
  if (ageBased == null) return cap; // no install year: condition drives it
  return Math.min(ageBased, cap);
}

// Sort weight for the systems list - higher = more urgent. Combines the
// owner-reported condition (1 = failing) with the age-based stage, so failing /
// past-lifespan systems float to the top and healthy ones sink to the bottom.
export function systemPriority(system: HomeSystem): number {
  const h = assessSystem(system);
  let r = 0;
  const c = system.condition_rating ?? 0;
  if (c === 1) r += 100; // failing
  else if (c === 2) r += 40; // worn
  else if (c === 3) r += 10; // fair
  if (h.stage === "due") r += 50;
  else if (h.stage === "aging") r += 20;
  return r;
}

// A system the owner must deal with: reported failing, or well past its life.
export function isMustDo(system: HomeSystem): boolean {
  return system.condition_rating === 1 || assessSystem(system).stage === "due";
}

// 0-100 Home Health Score. Starts at 100, then deducts for aging/overdue
// systems, open issues (weighted by severity), and missing system data.
export function homeHealthScore(
  systems: HomeSystem[],
  openIssues: Issue[]
): number {
  let score = 100;

  for (const s of systems) {
    const h = assessSystem(s);
    if (h.stage === "due") score -= 10;
    else if (h.stage === "aging") score -= 4;
    if (s.condition_rating && s.condition_rating <= 2) score -= 5;
  }

  for (const issue of openIssues) {
    if (issue.severity === "urgent") score -= 12;
    else if (issue.severity === "medium") score -= 5;
    else score -= 2;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// Same math as homeHealthScore, but returns the itemized deductions so the UI
// can explain *why* the score is what it is.
export interface ScoreLine {
  label: string;
  points: number;
}

export function scoreBreakdown(
  systems: HomeSystem[],
  openIssues: Issue[]
): { score: number; lines: ScoreLine[] } {
  const lines: ScoreLine[] = [];

  for (const s of systems) {
    const name = labelFor(SYSTEM_TYPES, s.system_type);
    const h = assessSystem(s);
    if (h.stage === "due") lines.push({ label: `${name} past/near end of life`, points: -10 });
    else if (h.stage === "aging") lines.push({ label: `${name} is aging`, points: -4 });
    if (s.condition_rating && s.condition_rating <= 2)
      lines.push({ label: `${name} in poor condition`, points: -5 });
  }

  for (const issue of openIssues) {
    const name = labelFor(ISSUE_CATEGORIES, issue.category);
    const points = issue.severity === "urgent" ? -12 : issue.severity === "medium" ? -5 : -2;
    lines.push({ label: `${issue.severity} ${name} issue`, points });
  }

  const total = lines.reduce((sum, l) => sum + l.points, 0);
  const score = Math.max(0, Math.min(100, Math.round(100 + total)));
  return { score, lines };
}

export function scoreBand(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "Great shape", tone: "text-green-700 bg-green-50 border-green-200" };
  if (score >= 65) return { label: "Generally healthy", tone: "text-hearth-700 bg-hearth-50 border-hearth-200" };
  if (score >= 45) return { label: "Needs attention", tone: "text-amber-700 bg-amber-50 border-amber-200" };
  return { label: "Several items overdue", tone: "text-red-700 bg-red-50 border-red-200" };
}

// Derive upcoming maintenance prompts from system ages (read-only, computed -
// not persisted). Screen 3 surfaces these alongside any saved maintenance_tasks.
export interface MaintenancePrompt {
  systemId: string;
  systemType: string;
  title: string;
  urgency: LifeStage;
}

export function derivedMaintenance(systems: HomeSystem[]): MaintenancePrompt[] {
  return systems
    .map(assessSystem)
    .filter((h) => h.stage === "due" || h.stage === "aging")
    .sort((a, b) => (a.remaining ?? 0) - (b.remaining ?? 0))
    .map((h) => ({
      systemId: h.system.id,
      systemType: h.system.system_type,
      title: h.message,
      urgency: h.stage,
    }));
}
