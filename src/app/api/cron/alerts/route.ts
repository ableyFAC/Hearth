import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Scheduled job (Vercel Cron / Supabase scheduled function) that turns the
// weather alerts already computed for the dashboard (see home-alerts/route.ts)
// into rows in `notifications`, so a homeowner who isn't actively looking at
// the dashboard still gets re-engaged. Safe to run repeatedly: it dedupes on
// (user_id, kind, title) within a trailing window before inserting.
//
// Recalls are intentionally left to the dashboard's home-alerts call for now -
// they're per-brand and slower to fetch for every property on a schedule.
// This endpoint focuses on the fast, cheap win: freeze/heat warnings.

const DEDUPE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const FETCH_TIMEOUT_MS = 4000;
const MAX_PROPERTIES = 200; // cap the work a single run does

type WeatherAlert = {
  kind: "freeze" | "heat";
  title: string;
  body: string;
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

// Reuses the Open-Meteo logic from home-alerts, trimmed to the single top
// weather alert (freeze takes priority since burst pipes are the costlier
// surprise) and without the per-system age tailoring, to keep the cron cheap.
async function topWeatherAlert(
  city: string | null,
  state: string | null
): Promise<WeatherAlert | null> {
  const place = [city, state].filter(Boolean).join(", ");
  if (!city || !place) return null;

  const geo = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1&language=en&format=json`,
    FETCH_TIMEOUT_MS
  );
  const loc = geo?.results?.[0];
  if (!loc) return null;

  const fc = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}` +
      `&daily=temperature_2m_min,temperature_2m_max&forecast_days=4&temperature_unit=fahrenheit&timezone=auto`,
    FETCH_TIMEOUT_MS
  );
  const mins: number[] = fc?.daily?.temperature_2m_min ?? [];
  const maxs: number[] = fc?.daily?.temperature_2m_max ?? [];

  const fi = mins.findIndex((t) => t != null && t <= 32);
  if (fi !== -1) {
    return {
      kind: "freeze",
      title: `Freeze coming ${whenLabel(fi)} (${Math.round(mins[fi])}°F)`,
      body: "Let indoor faucets drip overnight, disconnect garden hoses, and open cabinet doors under sinks.",
    };
  }

  const hi = maxs.findIndex((t) => t != null && t >= 95);
  if (hi !== -1) {
    return {
      kind: "heat",
      title: `Heat wave ${whenLabel(hi)} (${Math.round(maxs[hi])}°F)`,
      body: "Change your AC filter, keep blinds closed during the day, and don't set the thermostat too low.",
    };
  }

  return null;
}

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>" when
  // the CRON_SECRET env var is set. Also accept an explicit x-cron-secret header
  // or ?secret= for manual runs / other schedulers.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided =
    bearer ??
    req.headers.get("x-cron-secret") ??
    req.nextUrl.searchParams.get("secret");
  return provided === expected;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  let created = 0;

  const { data: properties, error } = await supabase
    .from("properties")
    .select("id, user_id, city, state")
    .not("user_id", "is", null)
    .limit(MAX_PROPERTIES);

  if (error || !properties) {
    return NextResponse.json({ created: 0, error: error?.message ?? "no properties" }, { status: 200 });
  }

  const since = new Date(Date.now() - DEDUPE_WINDOW_MS).toISOString();

  for (const property of properties) {
    try {
      const alert = await topWeatherAlert(property.city, property.state);
      if (!alert) continue;

      // Dedupe: skip if the same kind+title already went out to this user
      // recently, so re-running the cron (or a forecast that hasn't moved)
      // doesn't spam the same warning every run.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", property.user_id)
        .eq("kind", alert.kind)
        .eq("title", alert.title)
        .gt("created_at", since)
        .limit(1);
      if (existing && existing.length > 0) continue;

      const { error: insertError } = await supabase.from("notifications").insert({
        user_id: property.user_id as string,
        kind: alert.kind,
        title: alert.title,
        body: alert.body,
        url: "/dashboard",
      });
      if (!insertError) created += 1;
    } catch {
      // One property's failure shouldn't stop the rest of the run.
      continue;
    }
  }

  return NextResponse.json({ created });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
