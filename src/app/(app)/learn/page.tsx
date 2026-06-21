import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { SYSTEM_TYPES } from "@/lib/constants";
import { DEFAULT_LIFESPANS } from "@/lib/health";
import { requestTopicAction } from "./actions";

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
  const have = new Set<string>();
  if (property) {
    const { data: systems } = await supabase
      .from("home_systems")
      .select("system_type")
      .eq("property_id", property.id);
    for (const s of systems ?? []) have.add(s.system_type);
  }
  // Only the systems the owner actually has; fall back to all if none added yet.
  const owned = SYSTEM_TYPES.filter((t) => have.has(t.value));
  const types = owned.length ? owned : SYSTEM_TYPES;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-stone-900">Learn</h1>
        <p className="mt-1 text-sm text-stone-500">
          Maintenance basics for the systems in your home. Tap one to read more.
        </p>
      </div>

      <ul className="space-y-2">
        {types.map((s) => (
          <li key={s.value} className="card">
            <details>
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-stone-900 [&::-webkit-details-marker]:hidden">
                <span>
                  {s.icon} {s.label}
                </span>
                <span className="text-sm text-stone-400">Read more</span>
              </summary>
              <p className="mt-3 text-xs text-stone-400">
                Typical lifespan: {DEFAULT_LIFESPANS[s.value] ?? "varies"} years
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600">
                {(LEARN[s.value] ?? []).map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>

      <div className="card">
        <h2 className="font-medium text-stone-900">
          Don&apos;t see the answer to your question?
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Tell us what you want to know about your home and we&apos;ll add a
          guide for it.
        </p>
        <form action={requestTopicAction} className="mt-3 space-y-2">
          <textarea
            name="question"
            required
            rows={2}
            className="textarea"
            placeholder="e.g. How do I winterize my sprinkler system?"
          />
          <button className="btn-primary">Request a guide</button>
        </form>
      </div>
    </div>
  );
}
