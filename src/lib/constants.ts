// Shared option lists. Keep these in sync with the CHECK comments in the schema.

export const SYSTEM_TYPES = [
  { value: "roof", label: "Roof", icon: "🏠" },
  { value: "hvac", label: "HVAC", icon: "❄️" },
  { value: "water_heater", label: "Water heater", icon: "🚿" },
  { value: "electrical_panel", label: "Electrical panel", icon: "⚡" },
  { value: "plumbing", label: "Plumbing", icon: "🚰" },
  { value: "windows", label: "Windows", icon: "🪟" },
  { value: "foundation", label: "Foundation", icon: "🧱" },
  { value: "appliance", label: "Major appliance", icon: "🔌" },
  { value: "gutters", label: "Gutters", icon: "🌧️" },
  { value: "siding", label: "Siding", icon: "🪵" },
  { value: "garage_door", label: "Garage door", icon: "🚪" },
  { value: "deck", label: "Deck / patio", icon: "🌳" },
  { value: "driveway", label: "Driveway", icon: "🛣️" },
  { value: "sump_pump", label: "Sump pump", icon: "💧" },
  { value: "sewer_line", label: "Sewer / septic", icon: "🚽" },
  { value: "fence", label: "Fence", icon: "🧱" },
] as const;

// Marker text the auto-seeded starter inventory used to use as a per-system
// note. We no longer store it (the notice lives at the top of the profile),
// but we still filter it out so older auto-added rows display cleanly.
export const STARTER_SYSTEM_NOTE =
  "Auto-added from your address — update the year if you know it.";

export const ISSUE_CATEGORIES = [
  { value: "roof", label: "Roof", icon: "🏠" },
  { value: "plumbing", label: "Plumbing", icon: "🚰" },
  { value: "electrical", label: "Electrical", icon: "⚡" },
  { value: "hvac", label: "HVAC", icon: "❄️" },
  { value: "structural", label: "Structural", icon: "🧱" },
  { value: "other", label: "Other", icon: "🔧" },
] as const;

// Popular remodel / improvement projects we surface as recommendations.
// `category` maps each project to the contractor category used for matching.
export const REMODEL_PROJECTS = [
  { label: "Kitchen remodel", icon: "🍳", category: "other" },
  { label: "Bathroom remodel", icon: "🛁", category: "plumbing" },
  { label: "Window replacement", icon: "🪟", category: "structural" },
  { label: "Stairs & railings", icon: "🪜", category: "structural" },
  { label: "Flooring", icon: "🪵", category: "other" },
  { label: "Deck / patio", icon: "🌳", category: "structural" },
  { label: "Interior painting", icon: "🎨", category: "other" },
  { label: "Garage door", icon: "🚪", category: "other" },
  { label: "Roof replacement", icon: "🏠", category: "roof" },
  { label: "Panel upgrade", icon: "⚡", category: "electrical" },
] as const;

export const SEVERITIES = [
  { value: "low", label: "Low — keep an eye on it" },
  { value: "medium", label: "Medium — should be addressed" },
  { value: "urgent", label: "Urgent — needs a pro now" },
] as const;

export const PROPERTY_TYPES = [
  { value: "single_family", label: "Single family" },
  { value: "condo", label: "Condo" },
  { value: "townhouse", label: "Townhouse" },
  { value: "multi_family", label: "Multi-family" },
  { value: "other", label: "Other" },
] as const;

export const TIMING_OPTIONS = [
  { value: "asap", label: "As soon as possible" },
  { value: "few_weeks", label: "Within a few weeks" },
  { value: "flexible", label: "I'm flexible" },
] as const;

// Per-lead fee (USD) a contractor owes for each matched lead, by category.
// Flat per-lead pricing for the MVP — no real payment yet, just billing math.
// (Swap for a % -of-job model later if you capture job value.)
export const LEAD_FEES: Record<string, number> = {
  roof: 75,
  plumbing: 45,
  electrical: 45,
  hvac: 60,
  structural: 90,
  other: 35,
};

export function leadFeeFor(category: string): number {
  return LEAD_FEES[category] ?? LEAD_FEES.other;
}

// Maps a home system to the contractor category, so a "Find a pro" button on a
// system jumps straight to the right trade.
export const SYSTEM_CATEGORY: Record<string, string> = {
  roof: "roof",
  hvac: "hvac",
  water_heater: "plumbing",
  electrical_panel: "electrical",
  plumbing: "plumbing",
  windows: "structural",
  foundation: "structural",
  appliance: "other",
  gutters: "roof",
  siding: "structural",
  garage_door: "other",
  deck: "structural",
  driveway: "other",
  sump_pump: "plumbing",
  sewer_line: "plumbing",
  fence: "structural",
};

export function categoryForSystem(systemType: string): string {
  return SYSTEM_CATEGORY[systemType] ?? "other";
}

// Lead lifecycle on the contractor side.
export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "accepted", label: "Accepted" },
  { value: "closed", label: "Closed (won)" },
  { value: "lost", label: "Declined" },
] as const;

export function labelFor(
  list: readonly { value: string; label: string }[],
  value: string | null | undefined
): string {
  if (!value) return "—";
  return list.find((o) => o.value === value)?.label ?? value;
}

export function iconFor(
  list: readonly { value: string; icon?: string }[],
  value: string | null | undefined
): string {
  if (!value) return "";
  return list.find((o) => o.value === value)?.icon ?? "";
}
