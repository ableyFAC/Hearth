import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveProperty } from "@/lib/property";
import { SYSTEM_TYPES, labelFor } from "@/lib/constants";
import { assessSystem } from "@/lib/health";

export const runtime = "nodejs";

// Two proactive "Google can't do this for YOUR home" feeds, behind one call so
// the dashboard stays fast and degrades gracefully:
//  - weather: freeze/heat warnings from a free, keyless forecast (Open-Meteo),
//    tailored to the homeowner's actual systems and their ages.
//  - recalls: best-effort safety-recall matches for their stored appliance
//    brands (CPSC SaferProducts), clearly labelled "verify".
// Anything slow or unavailable just yields an empty list - never an error page.

type Alert = {
  kind: "freeze" | "heat" | "recall";
  title: string;
  detail: string;
  url?: string;
};

async function fetchJson(url: string, ms: number): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function whenLabel(i: number): string {
  if (i <= 0) return "today";
  if (i === 1) return "tomorrow";
  return `in ${i} days`;
}

// No route-segment caching here: the response is scoped to the signed-in
// user's active property (getActiveProperty reads the session), so a shared
// `revalidate` would serve one homeowner's weather/recall data to the next
// caller. Instead, the independent external calls below run concurrently
// (the weather leg and the recalls leg via Promise.all, and the up to 4 CPSC
// brand lookups inside the recalls leg via their own Promise.all) so a slow
// upstream costs latency once, not once per call.
export async function GET() {
  const empty = NextResponse.json({ weather: [], recalls: [] });
  let property: any = null;
  let systems: any[] = [];
  try {
    property = await getActiveProperty();
    if (!property) return empty;
    const supabase = createClient();
    const { data } = await supabase
      .from("home_systems")
      .select("system_type, install_year, material_or_model, condition_rating")
      .eq("property_id", property.id);
    systems = data ?? [];
  } catch {
    return empty;
  }

  const [weather, recalls] = await Promise.all([
    fetchWeather(property, systems),
    fetchRecalls(systems),
  ]);

  return NextResponse.json({ weather, recalls });
}

// --- Weather (Open-Meteo, no key) ---
async function fetchWeather(property: any, systems: any[]): Promise<Alert[]> {
  const weather: Alert[] = [];
  try {
    const place = [property.city, property.state].filter(Boolean).join(", ");
    if (place) {
      const geo = await fetchJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          property.city
        )}&count=1&language=en&format=json`,
        4000
      );
      const loc = geo?.results?.[0];
      if (loc) {
        const fc = await fetchJson(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
            `&daily=temperature_2m_min,temperature_2m_max&forecast_days=4&temperature_unit=fahrenheit&timezone=auto`,
          4000
        );
        const mins: number[] = fc?.daily?.temperature_2m_min ?? [];
        const maxs: number[] = fc?.daily?.temperature_2m_max ?? [];

        // System context for tailored advice.
        const plumbing = systems.find((s) =>
          ["plumbing", "sewer_line"].includes(s.system_type)
        );
        const hvac = systems.find((s) => s.system_type === "hvac");
        const plumbingAge = plumbing ? assessSystem(plumbing).age : null;
        const hvacAge = hvac ? assessSystem(hvac).age : null;

        // Earliest freeze in the window.
        const fi = mins.findIndex((t) => t != null && t <= 32);
        if (fi !== -1) {
          weather.push({
            kind: "freeze",
            title: `Freeze coming ${whenLabel(fi)} (${Math.round(mins[fi])}°F)`,
            detail:
              "Let indoor faucets drip overnight, disconnect garden hoses, and open cabinet doors under sinks." +
              (plumbingAge && plumbingAge >= 40
                ? ` Your plumbing is about ${plumbingAge} yrs old, so older pipes are extra vulnerable to bursting.`
                : ""),
          });
        }

        // Earliest serious heat in the window.
        const hi = maxs.findIndex((t) => t != null && t >= 95);
        if (hi !== -1) {
          weather.push({
            kind: "heat",
            title: `Heat wave ${whenLabel(hi)} (${Math.round(maxs[hi])}°F)`,
            detail:
              "Change your AC filter, keep blinds closed during the day, and don't set the thermostat too low (it overworks the unit)." +
              (hvacAge && hvacAge >= 15
                ? ` Your AC is about ${hvacAge} yrs old. Watch for weak airflow or short-cycling on the hottest days.`
                : ""),
          });
        }
      }
    }
  } catch {
    /* leave weather empty */
  }
  return weather;
}

// --- Recalls (CPSC SaferProducts, no key) ---
async function fetchRecalls(systems: any[]): Promise<Alert[]> {
  const recalls: Alert[] = [];
  try {
    // Keywords that must co-occur with a brand name for a recall to count as a
    // real match for that system. This stops a brand that is also a common word
    // (e.g. "Carrier" HVAC vs a baby/plate "carrier") from dragging in dozens of
    // unrelated recalls. A system type with no keywords falls back to brand-only.
    const SYSTEM_KEYWORDS: Record<string, string[]> = {
      hvac: [
        "furnace", "air condition", "heat pump", "hvac", "ac unit",
        "boiler", "thermostat", "heater", "condenser", "cooling", "heating",
      ],
      water_heater: ["water heater", "tankless", "boiler"],
      roof: ["roof", "shingle", "gutter", "skylight"],
      windows: ["window"],
      electrical_panel: ["electrical panel", "breaker", "circuit", "panel", "wiring", "load center"],
      plumbing: ["plumbing", "faucet", "valve", "pipe", "water supply", "toilet"],
      sewer_line: ["sewer", "septic", "sump"],
      appliance: [
        "dishwasher", "refrigerator", "washer", "dryer", "oven", "range",
        "microwave", "stove", "freezer", "cooktop", "washing machine",
      ],
    };

    // Build a small set of brand keywords from stored models, capped to keep
    // this fast. Only systems where the owner actually entered a brand/model.
    const brands = new Map<string, { label: string; type: string }>();
    for (const s of systems) {
      const model: string = (s.material_or_model ?? "").trim();
      if (!model) continue;
      const brand = model.split(/[\s,/]+/)[0];
      if (brand.length < 3) continue;
      const key = brand.toLowerCase();
      if (!brands.has(key))
        brands.set(key, {
          label: labelFor(SYSTEM_TYPES, s.system_type),
          type: s.system_type,
        });
      if (brands.size >= 4) break;
    }

    // Fetch every brand's CPSC results concurrently instead of one at a
    // time - up to 4 lookups at FETCH_TIMEOUT_MS each is the bulk of this
    // route's latency otherwise. This can fetch one or two more brands than
    // strictly needed if an early brand alone would have filled the 3-recall
    // cap, but that's a fair trade for not paying the timeout serially; the
    // selection below still processes brands in the same order and keeps the
    // same first-3-matches result.
    const brandEntries = Array.from(brands.entries());
    const brandResults = await Promise.all(
      brandEntries.map(([brand]) =>
        fetchJson(
          `https://www.saferproducts.gov/RestWebServices/Recall?format=json&ProductName=${encodeURIComponent(
            brand
          )}`,
          4000
        )
      )
    );

    const seen = new Set<string>();
    for (let i = 0; i < brandEntries.length; i++) {
      const [brand, { label: sysLabel, type: sysType }] = brandEntries[i];
      const data = brandResults[i];
      if (!Array.isArray(data)) continue;
      const keywords = SYSTEM_KEYWORDS[sysType] ?? [];
      for (const rec of data.slice(0, 20)) {
        const title: string =
          rec?.Title ?? rec?.RecallTitle ?? rec?.Description ?? "";
        if (!title) continue;
        const lower = title.toLowerCase();
        // Conservative: only keep recalls whose text actually names the brand.
        if (!lower.includes(brand)) continue;
        // And, when we know what this system is, that also read like that
        // system, not an unrelated product that shares the brand word.
        if (keywords.length && !keywords.some((k) => lower.includes(k)))
          continue;
        const url: string | undefined = rec?.URL ?? rec?.Url ?? undefined;
        const dedupe = (url ?? title).slice(0, 120);
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        const date: string = (rec?.RecallDate ?? "").slice(0, 10);
        recalls.push({
          kind: "recall",
          title: title.length > 140 ? title.slice(0, 137) + "…" : title,
          detail:
            `Possible match for your ${sysLabel}${
              date ? ` · recalled ${date}` : ""
            }. Check the model/serial against the official notice to confirm.`,
          url,
        });
        if (recalls.length >= 3) break;
      }
      if (recalls.length >= 3) break;
    }
  } catch {
    /* leave recalls empty */
  }

  return recalls;
}
