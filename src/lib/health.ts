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

export type LifeStage = "healthy" | "aging" | "due" | "unknown";

export interface SystemHealth {
  system: HomeSystem;
  age: number | null;
  lifespan: number;
  remaining: number | null; // years left; negative = past expected life
  stage: LifeStage;
  message: string;
}

const CURRENT_YEAR = 2026; // injected statically; bump per release.

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
    message = `${age} yrs old — past the typical ${lifespan}-yr lifespan. Plan a replacement.`;
  } else if (remaining <= 3) {
    stage = "due";
    message = `${age} yrs old — typical lifespan ${lifespan} yrs. Budget for a replacement soon.`;
  } else if (remaining <= lifespan * 0.4) {
    stage = "aging";
    message = `${age} yrs old — roughly ${remaining} yrs of typical life left.`;
  } else {
    stage = "healthy";
    message = `${age} yrs old — in good shape (typical lifespan ${lifespan} yrs).`;
  }

  return { system, age, lifespan, remaining, stage, message };
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

// Derive upcoming maintenance prompts from system ages (read-only, computed —
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
