import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { SYSTEM_TYPES, ISSUE_CATEGORIES, labelFor } from "@/lib/constants";
import { DEFAULT_LIFESPANS, assessSystem } from "@/lib/health";
import AskHearth from "@/components/AskHearth";
import LearnGuide from "./LearnGuide";

const STAGE_LABEL: Record<string, string> = {
  healthy: "Healthy",
  aging: "Plan ahead",
  due: "Needs maintenance",
  unknown: "Add details",
};
const STAGE_STYLE: Record<string, string> = {
  healthy: "border-green-200 bg-green-50 text-green-700",
  aging: "border-amber-200 bg-amber-50 text-amber-700",
  due: "border-red-200 bg-red-50 text-red-700",
  unknown: "border-stone-200 bg-stone-50 text-stone-500",
};

// Short, concise maintenance bullets per system. Kept here since it's only used
// on this page.
const LEARN: Record<string, string[]> = {
  roof: [
    "Inspect after big storms for missing, curled, or cracked shingles.",
    "Keep valleys and gutters clear so water drains off fast.",
    "Trim branches that rub the surface or drop debris.",
    "Ceiling stains usually mean a leak. Act early.",
  ],
  hvac: [
    "Swap the air filter every 1 to 3 months.",
    "Book a pro tune-up before summer and before winter.",
    "Keep the outdoor unit clear of leaves with 2 ft of space.",
    "Weak airflow or short cycling means it needs a look.",
  ],
  water_heater: [
    "Flush the tank once a year to clear sediment.",
    "Test the pressure-relief valve annually.",
    "Check the anode rod every 2 to 3 years.",
    "Rusty water or popping sounds signal wear.",
  ],
  electrical_panel: [
    "Label which breaker controls what.",
    "Breakers that trip often point to a real problem.",
    "A warm cover or burning smell is urgent. Call a pro.",
    "Avoid overloading outlets with power strips.",
  ],
  plumbing: [
    "Know where your main water shutoff is.",
    "Check under sinks now and then for slow leaks.",
    "Never pour grease down a drain.",
    "Let faucets drip in a freeze to protect pipes.",
  ],
  windows: [
    "Reseal worn caulk and weatherstripping yearly.",
    "Clear weep holes so water drains out.",
    "Foggy glass means a broken seal.",
    "Lubricate tracks so they open and close freely.",
  ],
  foundation: [
    "Keep soil sloped away from the house.",
    "New or growing cracks deserve a pro's eye.",
    "Doors that suddenly stick can signal movement.",
    "Aim downspouts well away from the base.",
  ],
  appliance: [
    "Clean coils, lint traps, and filters regularly.",
    "Don't overload washers or dryers.",
    "Keep the manual for model-specific care.",
    "Odd noises or smells mean stop and check.",
  ],
  gutters: [
    "Clear leaves at least twice a year.",
    "Make sure downspouts carry water 4+ ft away.",
    "Check for sagging or pulling-away sections.",
    "Overflow stains on siding mean a clog.",
  ],
  siding: [
    "Rinse off dirt and mildew once a year.",
    "Touch up paint or caulk to keep moisture out.",
    "Look for warping, rot, or pest holes.",
    "Keep sprinklers from constantly hitting it.",
  ],
  garage_door: [
    "Test the auto-reverse safety feature monthly.",
    "Lubricate rollers and hinges yearly.",
    "Never DIY the torsion springs. Call a pro.",
    "Listen for grinding or jerky movement.",
  ],
  deck: [
    "Check for loose boards and popped nails.",
    "Reseal or stain the wood every 2 to 3 years.",
    "Look for soft, rotting spots near the ground.",
    "Keep board gaps clear so water drains.",
  ],
  driveway: [
    "Seal cracks before winter so water can't freeze in them.",
    "Reseal asphalt every few years.",
    "Fix low spots where water pools.",
    "Go easy on harsh de-icing salt on concrete.",
  ],
  sump_pump: [
    "Pour in a bucket of water to test it a few times a year.",
    "Keep the pit free of debris.",
    "Add a battery backup for storms and outages.",
    "Constant running or silence in rain means trouble.",
  ],
  sewer_line: [
    "Flush only toilet paper. No wipes or grease.",
    "Slow drains house-wide signal a main-line clog.",
    "Consider a camera inspection every few years.",
    "Tree roots are a common cause of blockages.",
  ],
  fence: [
    "Reset leaning posts early before they pull others.",
    "Seal or stain wood to slow rot.",
    "Check for loose boards and rusted hardware.",
    "Clear vines and growth that trap moisture.",
  ],
};

export default async function LearnPage() {
  const supabase = createClient();
  const property = await getActiveProperty();

  // First instance of each system type they own, for inline status; plus their
  // most recent open issue, to seed a personal starter question.
  const byType = new Map<string, any>();
  let openIssueCategory: string | null = null;
  if (property) {
    const [{ data: systems }, { data: issues }] = await Promise.all([
      supabase.from("home_systems").select("*").eq("property_id", property.id),
      supabase
        .from("issues")
        .select("category")
        .eq("property_id", property.id)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);
    for (const s of systems ?? [])
      if (!byType.has(s.system_type)) byType.set(s.system_type, s);
    if (issues && issues.length) openIssueCategory = issues[0].category;
  }

  // Only the systems the owner actually has; fall back to all if none added yet.
  const owned = SYSTEM_TYPES.filter((t) => byType.has(t.value));
  const types = owned.length ? owned : SYSTEM_TYPES;

  // Starter questions seeded from THEIR systems - aging ones ask about lifespan,
  // the rest about maintenance. An open issue takes top billing.
  const suggestions: string[] = [];
  for (const t of owned.slice(0, 3)) {
    const stage = assessSystem(byType.get(t.value)).stage;
    const label = t.label.toLowerCase();
    suggestions.push(
      stage === "due" || stage === "aging"
        ? `Is my ${label} near the end of its life?`
        : `How do I maintain my ${label}?`
    );
  }
  if (openIssueCategory) {
    suggestions.unshift(
      `What should I do about my open ${labelFor(
        ISSUE_CATEGORIES,
        openIssueCategory
      ).toLowerCase()} issue?`
    );
  }
  if (suggestions.length === 0)
    suggestions.push("How do I keep my home in good shape?");
  if (suggestions.length < 4)
    suggestions.push("What should I focus on this season?");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Learn</h1>
        <p className="mt-1 text-sm text-stone-500">
          Ask anything about your home and get an answer based on your actual
          systems. Or browse the basics below.
        </p>
      </div>

      <AskHearth suggestions={suggestions} />

      <div>
        <h2 className="text-sm font-semibold text-stone-700">
          Maintenance basics
        </h2>
        <ul className="mt-2 space-y-2">
          {types.map((t) => {
            const instance = byType.get(t.value);
            const h = instance ? assessSystem(instance) : null;
            const aging = h?.stage === "due" || h?.stage === "aging";
            const label = t.label.toLowerCase();
            return (
              <LearnGuide
                key={t.value}
                systemType={t.value}
                label={t.label}
                icon={t.icon}
                lifespan={DEFAULT_LIFESPANS[t.value] ?? "varies"}
                statusLabel={h ? STAGE_LABEL[h.stage] : undefined}
                statusStyle={h ? STAGE_STYLE[h.stage] : undefined}
                age={h?.age ?? null}
                tips={LEARN[t.value] ?? []}
                askQuestion={
                  aging
                    ? `My ${label} is getting older. What should I be doing, and is it near replacement?`
                    : `How should I maintain my ${label}?`
                }
              />
            );
          })}
        </ul>
      </div>
    </div>
  );
}
