// Shared option lists. Keep these in sync with the CHECK comments in the schema.

// =============================================================================
// COLD START: launch-phase liquidity levers.
//
// While the marketplace is young, both sides of it are opened up to build
// liquidity: homeowners post jobs free (no Plus requirement, no free-post cap)
// and EVERY pro gets instant new-job alerts (not just Pro members). Flip each
// constant to false to restore the Plus posting gate and the members-only
// instant alerts; every consumer references these constants and keeps the
// original gate code intact behind them, so reverting is a one-line change.
//
// These flags never touch the quality guards (auth, the 20-character job
// description floor, duplicate-post protection): those stay on regardless.
// =============================================================================
export const COLD_START_FREE_POSTING = true;
export const COLD_START_FREE_ALERTS = true;

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
  "Auto-added from your address. Update the year if you know it.";

// Home-problem categories for the issue tracker (home-health side). These are
// things that go *wrong* with a house, not every service a pro offers.
export const ISSUE_CATEGORIES = [
  { value: "roof", label: "Roof", icon: "🏠" },
  { value: "plumbing", label: "Plumbing", icon: "🚰" },
  { value: "electrical", label: "Electrical", icon: "⚡" },
  { value: "hvac", label: "HVAC", icon: "❄️" },
  { value: "structural", label: "Structural", icon: "🧱" },
  { value: "other", label: "Other", icon: "🔧" },
] as const;

// Canonical service categories a contractor advertises and a homeowner can post
// a job in. Must stay in sync with the contractor CategoryPicker. A job's
// category is matched (exact equality) against contractors.categories, so both
// sides have to draw from this same list. (Custom "Other" services are handled
// separately as free text.)
export const SERVICE_CATEGORIES = [
  { value: "roof", label: "Roof", icon: "🏠" },
  { value: "plumbing", label: "Plumbing", icon: "🚰" },
  { value: "electrical", label: "Electrical", icon: "⚡" },
  { value: "hvac", label: "HVAC", icon: "❄️" },
  { value: "structural", label: "Structural", icon: "🧱" },
  { value: "remodeling", label: "Remodeling", icon: "🛠️" },
  { value: "landscaping", label: "Landscaping", icon: "🌿" },
  { value: "cleaning", label: "Cleaning", icon: "🧽" },
  { value: "windows", label: "Windows", icon: "🪟" },
  { value: "painting", label: "Painting", icon: "🎨" },
  { value: "home_inspection", label: "Home inspection", icon: "🔍" },
] as const;

// Every value a job's category can take, for labels/icons when displaying a
// posted job (the canonical services plus the catch-all "Other" bucket).
export const JOB_CATEGORIES = [
  ...SERVICE_CATEGORIES,
  { value: "other", label: "Other", icon: "🔧" },
] as const;

// Popular remodel / improvement projects we surface as recommendations.
// `category` maps each project to the contractor category used for matching.
export const REMODEL_PROJECTS = [
  { label: "Kitchen remodel", icon: "🍳", category: "remodeling" },
  { label: "Bathroom remodel", icon: "🛁", category: "remodeling" },
  { label: "Window replacement", icon: "🪟", category: "windows" },
  { label: "Stairs & railings", icon: "🪜", category: "structural" },
  { label: "Flooring", icon: "🪵", category: "remodeling" },
  { label: "Deck / patio", icon: "🌳", category: "structural" },
  { label: "Interior painting", icon: "🎨", category: "painting" },
  { label: "Garage door", icon: "🚪", category: "structural" },
  { label: "Roof replacement", icon: "🏠", category: "roof" },
  { label: "Panel upgrade", icon: "⚡", category: "electrical" },
  { label: "HVAC install", icon: "❄️", category: "hvac" },
  { label: "Water heater", icon: "🚿", category: "plumbing" },
  { label: "Solar panels", icon: "🔆", category: "electrical" },
  { label: "Fencing", icon: "🧱", category: "landscaping" },
  { label: "Landscaping", icon: "🌿", category: "landscaping" },
  { label: "Driveway / concrete", icon: "🛣️", category: "structural" },
  { label: "Siding", icon: "🪵", category: "structural" },
  { label: "Gutter installation", icon: "🌧️", category: "roof" },
  { label: "Insulation", icon: "🧊", category: "remodeling" },
  { label: "Basement finishing", icon: "🪜", category: "remodeling" },
  { label: "Smart home / security", icon: "📹", category: "electrical" },
  { label: "Drywall repair", icon: "🧱", category: "remodeling" },
] as const;

export const SEVERITIES = [
  { value: "low", label: "Low. Keep an eye on it." },
  { value: "medium", label: "Medium. Should be addressed soon." },
  { value: "urgent", label: "Urgent. Needs a pro now." },
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

// Rough budget bands a homeowner can attach to a job posting. Purely a signal
// so pros can quote realistically, never a commitment or a binding number.
// Keep the values in sync with the column comment on
// contractor_leads.budget_range (supabase/migrations/0047_job_budget.sql).
export const BUDGET_RANGES = [
  { value: "under-500", label: "Under $500" },
  { value: "500-1500", label: "$500-1,500" },
  { value: "1500-5000", label: "$1,500-5,000" },
  { value: "5000-15000", label: "$5,000-15,000" },
  { value: "15000-plus", label: "$15,000+" },
  { value: "not-sure", label: "Not sure yet" },
] as const;

// Per-lead fee (USD) a pro owes to unlock/apply for a lead, by category.
//
// Priced in three tiers keyed to job value + what a pro can bear (a lead is only
// worth a slice of the expected job profit). Benchmarked below the big lead
// marketplaces (Angi $15-85+/lead plus a ~$300/yr fee; Thumbtack ~$20-75) so
// Hearth undercuts them, with no annual fee:
//   Tier 1  $25  light / low-ticket work (cleaning, landscaping, painting)
//   Tier 2  $50  skilled trades + replacements (plumbing, electrical, HVAC, windows)
//   Tier 3  $90  big-ticket (roofing, structural, remodeling / general contracting)
export const LEAD_TIER_FEES = { light: 25, skilled: 50, major: 90 } as const;

export const LEAD_FEES: Record<string, number> = {
  // Tier 3 - major
  roof: LEAD_TIER_FEES.major,
  structural: LEAD_TIER_FEES.major,
  remodeling: LEAD_TIER_FEES.major,
  // Tier 2 - skilled
  hvac: LEAD_TIER_FEES.skilled,
  plumbing: LEAD_TIER_FEES.skilled,
  electrical: LEAD_TIER_FEES.skilled,
  windows: LEAD_TIER_FEES.skilled,
  home_inspection: LEAD_TIER_FEES.skilled,
  // Tier 1 - light
  landscaping: LEAD_TIER_FEES.light,
  cleaning: LEAD_TIER_FEES.light,
  painting: LEAD_TIER_FEES.light,
  other: LEAD_TIER_FEES.light,
};

export function leadFeeFor(category: string): number {
  return LEAD_FEES[category] ?? LEAD_FEES.other;
}

// Hearth Pro membership (contractor side) pricing, USD. This is the ONE place
// the prices live: the /pro/plus page and checkout both read from here, so a
// price change is a one-line edit. First-time monthly subscribers get an
// intro month at introFirstMonth (a one-time $20-off Stripe coupon at
// checkout); yearly carries no intro discount. Membership is perks only: it
// never gates lead access. Every pro sees every job and pays per application,
// member or not.
export const PRO_PLAN = {
  monthly: 29.99,
  // 12 x 19.99: the yearly plan works out to exactly $19.99/mo, a real $120
  // saving vs paying monthly. Always compare against monthly x 12 in copy,
  // never an invented list price.
  yearly: 239.88,
  introFirstMonth: 9.99,
} as const;

// Extra percentage points a Pro member earns on top of the deposit-bonus tier
// percentage, applied to every deposit. Display-side mirror of the
// p_bonus_boost_pts argument the Stripe webhook passes to apply_deposit
// (supabase/migrations/0032_pro_membership.sql).
export const PRO_DEPOSIT_BOOST_PTS = 5;

// Applicant cap: this many live (non-refunded) applications fill a posted job,
// so pros stop burning fees on crowded postings. Must match the check in
// apply_to_lead (supabase/migrations/0028_ghost_protection.sql).
export const MAX_APPLICANTS_PER_JOB = 3;

// Ghost protection: an application the homeowner never responds to is
// auto-refunded after this many days. Display-only mirror of the cron window
// in supabase/migrations/0028_ghost_protection.sql.
export const GHOST_PROTECTION_DAYS = 7;

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

// Equipment systems ask for a make / model (brand); structural systems ask for
// a material. Everything else falls back to a generic "Material / model" label.
const MAKE_MODEL_SYSTEMS = new Set([
  "hvac",
  "water_heater",
  "electrical_panel",
  "appliance",
  "garage_door",
  "sump_pump",
]);

export function materialLabel(systemType: string): string {
  return MAKE_MODEL_SYSTEMS.has(systemType) ? "Make / model" : "Material";
}

// Dropdown options when adding or editing a system: brands for equipment,
// materials for structural systems. "Other" (added in the picker) lets an owner
// type something not listed.
export const SYSTEM_MATERIALS: Record<string, string[]> = {
  // --- material-based (structural) ---
  roof: [
    "Asphalt shingle",
    "Architectural shingle",
    "Metal",
    "Clay / concrete tile",
    "Slate",
    "Wood shake",
    "Flat - TPO",
    "Flat - EPDM rubber",
  ],
  plumbing: [
    "Copper",
    "PEX",
    "CPVC",
    "PVC",
    "Galvanized steel (older)",
    "Cast iron",
  ],
  windows: [
    "Vinyl",
    "Wood",
    "Aluminum",
    "Fiberglass",
    "Composite",
    "Single pane",
    "Double pane",
    "Triple pane",
  ],
  foundation: [
    "Poured concrete",
    "Concrete block",
    "Slab",
    "Crawl space",
    "Basement",
    "Pier & beam",
  ],
  gutters: ["Aluminum", "Vinyl", "Copper", "Steel", "Seamless aluminum"],
  siding: [
    "Vinyl",
    "Fiber cement (Hardie)",
    "Wood",
    "Aluminum",
    "Brick",
    "Stucco",
    "Stone veneer",
  ],
  deck: [
    "Pressure-treated wood",
    "Cedar",
    "Redwood",
    "Composite (Trex)",
    "PVC",
    "Hardwood",
  ],
  driveway: ["Concrete", "Asphalt", "Pavers", "Gravel", "Brick"],
  sewer_line: [
    "PVC",
    "Cast iron",
    "Clay",
    "ABS",
    "Orangeburg (older)",
    "Septic tank",
  ],
  fence: ["Wood", "Vinyl", "Chain link", "Aluminum", "Wrought iron", "Composite"],
  // --- make / model (equipment brands) ---
  hvac: [
    "Carrier",
    "Trane",
    "Lennox",
    "Goodman",
    "Rheem",
    "York",
    "American Standard",
    "Bryant",
  ],
  water_heater: [
    "Rheem",
    "A.O. Smith",
    "Bradford White",
    "Rinnai (tankless)",
    "Navien (tankless)",
    "Bosch",
    "State",
  ],
  electrical_panel: [
    "Square D",
    "Eaton / Cutler-Hammer",
    "Siemens",
    "General Electric",
    "Federal Pacific (older)",
    "Zinsco (older)",
  ],
  appliance: [
    "Whirlpool",
    "GE",
    "Samsung",
    "LG",
    "Bosch",
    "Maytag",
    "Frigidaire",
    "KitchenAid",
    "Kenmore",
  ],
  garage_door: [
    "Clopay",
    "Wayne Dalton",
    "Amarr",
    "Overhead Door",
    "LiftMaster",
    "Genie",
    "Chamberlain",
  ],
  sump_pump: [
    "Zoeller",
    "Wayne",
    "Liberty",
    "Basement Watchdog",
    "Superior Pump",
  ],
};

export function materialsForSystem(systemType: string): string[] {
  return SYSTEM_MATERIALS[systemType] ?? [];
}

// A short, plain maintenance tip per system, shown when an owner expands a
// system for details. Keeps the advice useful without needing a pro.
export const SYSTEM_TIPS: Record<string, string> = {
  roof: "Have it inspected after big storms and keep the valleys and flashing clear of debris.",
  hvac: "Swap the filter every few months and book a tune up before summer and winter.",
  water_heater:
    "Flush the tank once a year to clear sediment and check the anode rod every few years.",
  electrical_panel:
    "Watch for breakers that trip often or warm cover plates and have any of those checked.",
  plumbing:
    "Know where your main shutoff is and look under sinks now and then for slow leaks.",
  windows:
    "Reseal worn caulk and weatherstripping so you keep the heat and cool air inside.",
  foundation:
    "Keep soil sloped away from the house and watch for new cracks or sticking doors.",
  appliance:
    "Clean the coils and filters and keep the manual handy so repairs stay simple.",
  gutters:
    "Clear them at least twice a year so water drains away from the roof and foundation.",
  siding:
    "Rinse it yearly and touch up paint or sealant so moisture cannot get behind it.",
  garage_door:
    "Test the auto reverse safety feature and oil the rollers and hinges once a year.",
  deck: "Check for loose boards and rusted fasteners and reseal the wood every couple of years.",
  driveway:
    "Seal cracks before winter so water cannot freeze, expand, and widen them.",
  sump_pump:
    "Pour in a bucket of water a few times a year to confirm it kicks on before a storm does.",
  sewer_line:
    "Avoid flushing grease or wipes and consider a camera inspection if drains run slow.",
  fence: "Reset leaning posts early and seal the wood so it does not rot at the base.",
};

export function tipForSystem(systemType: string): string {
  return (
    SYSTEM_TIPS[systemType] ??
    "Give it a look now and then and note anything that seems worn so small fixes stay small."
  );
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
  if (!value) return "-";
  // Unknown values (legacy rows, options removed from a list) must never leak
  // as raw enums like "this_month" - humanize the underscores as a fallback.
  return list.find((o) => o.value === value)?.label ?? value.replace(/_/g, " ");
}

export function iconFor(
  list: readonly { value: string; icon?: string }[],
  value: string | null | undefined
): string {
  if (!value) return "";
  return list.find((o) => o.value === value)?.icon ?? "";
}

// Short seasonal maintenance checklist, shown on Home for the current season.
export const SEASONAL_TASKS: Record<string, string[]> = {
  spring: [
    "Book an HVAC tune-up before summer.",
    "Clear gutters of winter debris.",
    "Inspect the roof for winter damage.",
    "Test the sprinkler / irrigation system.",
  ],
  summer: [
    "Replace or clean the AC filter.",
    "Reseal the deck and check for loose boards.",
    "Rinse the siding and check for damage.",
    "Check window screens and weatherstripping.",
  ],
  fall: [
    "Clean the gutters before the rains.",
    "Book a furnace / heating tune-up.",
    "Drain and shut off outdoor faucets.",
    "Test the sump pump before storm season.",
  ],
  winter: [
    "Check for drafts around windows and doors.",
    "Watch the roof for ice dams after storms.",
    "Test smoke and carbon monoxide detectors.",
    "Know where your main water shutoff is.",
  ],
};

// Calendar month (0-11) to season.
export function seasonForMonth(month: number): keyof typeof SEASONAL_TASKS {
  if (month === 11 || month <= 1) return "winter";
  if (month <= 4) return "spring";
  if (month <= 7) return "summer";
  return "fall";
}
