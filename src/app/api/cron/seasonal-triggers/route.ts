import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { assessSystem, systemPriority } from "@/lib/health";
import { labelFor, categoryForSystem, SYSTEM_TYPES } from "@/lib/constants";
import type { HomeSystem } from "@/lib/database.types";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json): the seasonal-triggers growth
// engine. Southern California's weather runs on a calendar, so each month
// fires the ONE maintenance prompt that actually matches what's coming, and
// only to homeowners who own a system it applies to. Safe to run daily: the
// per-home, per-season dedupe below makes repeat runs no-ops.
//
// The calendar (SoCal):
//   Oct-Nov  Santa Ana season  -> roof, gutters
//   Dec-Feb  first winter rains -> roof, gutters, foundation, sump pump
//   Mar-Apr  getting ahead of summer -> HVAC, siding (exterior paint)
//   Jun-Aug  heat waves         -> HVAC
// May and September sit between windows and fire nothing, on purpose - a quiet
// month beats a made-up nudge.
//
// Targeting: only homes with a home_systems row in the active window's system
// list get a prompt, so the copy is always about something they actually own.
// The single most worn/oldest matching system per home is named, and its age
// sharpens the copy when it's meaningfully old (assessSystem staleness), e.g.
// "Your roof is about 18 years old and Santa Ana season starts this month."
//
// Noise control:
// - At most ONE seasonal_check per home per season. The dup guard looks for a
//   "seasonal_check" notification whose url carries this home's marker
//   (#sc=<property id>) since the season window began, so the daily schedule
//   and accidental re-runs never double-send within a season.
// - Respects the "reminders" toggle on /account/notifications (reused, no new
//   preference: its copy already covers "a seasonal check is due").

const MAX_SYSTEMS = 2000; // cap the work a single run does

// PostgREST silently truncates every response at its max-rows cap (1000 rows),
// so unbounded .in() fetches can quietly drop rows. Chunks of 50 keep each
// bulk fetch's realistic worst case under the cap, and explicit .order() makes
// any residual truncation deterministic. The bulk dup guard is only a
// pre-filter: every send is preceded by an exact per-home dup check.
const QUERY_CHUNK = 50;
const DUP_SCAN_LIMIT = 1000;
// Keep Promise.all fan-out bounded.
const SEND_CHUNK = 20;

const NUDGE_KIND = "seasonal_check";

// A seasonal window in the SoCal calendar. `months` are the 0-11 month numbers
// the window covers; `startMonth` is where the season begins (the dedupe
// boundary, so a home gets one prompt per season, not per month). `label` is
// how the season reads in copy.
type SeasonWindow = {
  key: string;
  months: number[];
  startMonth: number;
  systemTypes: string[];
  label: string;
  title: string;
  guidance: string;
};

const SEASON_WINDOWS: SeasonWindow[] = [
  {
    key: "santa_ana",
    months: [9, 10], // Oct, Nov
    startMonth: 9,
    systemTypes: ["roof", "gutters"],
    label: "Santa Ana season",
    title: "Santa Ana season starts this month",
    guidance:
      "Strong, dry winds are common this time of year. It's a good moment to check your roof and flashing, clear the gutters, and bring in or tie down anything loose on the patio before the first big gusts.",
  },
  {
    key: "first_rains",
    months: [11, 0, 1], // Dec, Jan, Feb
    startMonth: 11,
    systemTypes: ["roof", "gutters", "foundation", "sump_pump"],
    label: "the winter rains",
    title: "The winter rains are close",
    guidance:
      "Before the first heavy rain, clear your gutters and downspouts, make sure water drains away from the foundation, and look at anywhere a roof or window has leaked before so a small drip doesn't turn into a stain.",
  },
  {
    key: "pre_summer",
    months: [2, 3], // Mar, Apr
    startMonth: 2,
    systemTypes: ["hvac", "siding"],
    label: "summer",
    title: "A good month to get ahead of summer",
    guidance:
      "Book an HVAC tune-up now so your AC is ready before the first heat wave, and touch up any exterior paint or sealant while the weather is still mild.",
  },
  {
    key: "heat_waves",
    months: [5, 6, 7], // Jun, Jul, Aug
    startMonth: 5,
    systemTypes: ["hvac"],
    label: "heat wave season",
    title: "Heat waves are here",
    guidance:
      "Keep your AC running efficiently through the heat: change the filter, book a tune-up if it's been a while, and keep blinds closed during the hottest part of the day.",
  },
];

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

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// The active window for the current month, or null in a quiet month.
function activeWindow(month: number): SeasonWindow | null {
  return SEASON_WINDOWS.find((w) => w.months.includes(month)) ?? null;
}

// First day of the current season, as the dedupe boundary. When the window
// starts in a later calendar month than "now" (only Dec-Feb, whose season
// began the previous December), roll the year back one.
function seasonStartIso(win: SeasonWindow, now: Date): string {
  const month = now.getUTCMonth();
  const year =
    win.startMonth <= month ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, win.startMonth, 1)).toISOString();
}

// One age-aware sentence naming the home's most relevant system, but only when
// it's meaningfully old (aging or past its life). A "your roof is 3 years old"
// line would be noise, so a healthy system just gets the general guidance.
function staleClause(system: HomeSystem): string | null {
  const h = assessSystem(system);
  if (h.age == null || (h.stage !== "aging" && h.stage !== "due")) return null;
  const name = labelFor(SYSTEM_TYPES, system.system_type).toLowerCase();
  return `Your ${name} is about ${h.age} years old.`;
}

// Deep link to post a job with the right trade preselected (the /contractors
// job form reads ?category=; see profile/SystemRow's "Find a pro"). The #sc=
// fragment is this home's dedupe marker; the browser keeps it client-side so
// the job form is unaffected.
function postJobUrl(systemType: string, propertyId: string): string {
  return `/contractors?category=${categoryForSystem(systemType)}#sc=${propertyId}`;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const win = activeWindow(now.getUTCMonth());
  // Quiet month (May, September): nothing to send.
  if (!win) {
    return NextResponse.json({ checked: 0, notified: 0, season: null });
  }

  const supabase = createAdminClient();
  const seasonStart = seasonStartIso(win, now);

  // Every system this window applies to. Oldest first with an id tiebreak so
  // any residual truncation is deterministic.
  const { data: rawSystems, error: systemsError } = await supabase
    .from("home_systems")
    .select("*")
    .in("system_type", win.systemTypes)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MAX_SYSTEMS);

  if (systemsError) {
    return NextResponse.json(
      { checked: 0, notified: 0, season: win.key, error: systemsError.message },
      { status: 200 }
    );
  }

  const systems = (rawSystems ?? []) as HomeSystem[];
  if (systems.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0, season: win.key });
  }

  // One prompt per home: keep the single highest-priority matching system per
  // property (most worn / oldest floats up via systemPriority), so the copy
  // names the system most worth acting on.
  const bestByProperty = new Map<string, HomeSystem>();
  for (const s of systems) {
    const current = bestByProperty.get(s.property_id);
    if (!current || systemPriority(s) > systemPriority(current)) {
      bestByProperty.set(s.property_id, s);
    }
  }
  const propertyIds = Array.from(bestByProperty.keys());
  const checked = propertyIds.length;

  // Owner lookup: home_systems -> properties.user_id.
  const ownerByProperty = new Map<string, string>();
  for (const ids of chunk(propertyIds, QUERY_CHUNK)) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, user_id")
      .in("id", ids)
      .not("user_id", "is", null)
      .order("id", { ascending: true });
    for (const p of props ?? []) {
      if (p.user_id) ownerByProperty.set(p.id, p.user_id);
    }
  }

  const userIds = Array.from(new Set(ownerByProperty.values()));
  if (userIds.length === 0) {
    return NextResponse.json({ checked, notified: 0, season: win.key });
  }

  // Bulk dup PRE-filter: this season's seasonal_check notifications for these
  // owners, matched per home via the #sc=<property id> marker. A home already
  // prompted this season is skipped. The exact per-home check before each send
  // is the real guard; this just trims the obvious repeats cheaply.
  const notifiedProperties = new Set<string>();
  for (const ids of chunk(userIds, QUERY_CHUNK)) {
    const { data: recent } = await supabase
      .from("notifications")
      .select("url")
      .in("user_id", ids)
      .eq("kind", NUDGE_KIND)
      .gte("created_at", seasonStart)
      .order("created_at", { ascending: false })
      .limit(DUP_SCAN_LIMIT);
    for (const r of recent ?? []) {
      const m = (r.url ?? "").match(/#sc=([0-9a-f-]+)/i);
      if (m) notifiedProperties.add(m[1]);
    }
  }

  // Contact details + prefs, so email/SMS can fire once providers are
  // configured and the "reminders" toggle is respected.
  const userById = new Map<
    string,
    {
      id: string;
      email: string | null;
      phone: string | null;
      sms_consent: boolean | null;
      notification_prefs: any;
    }
  >();
  for (const ids of chunk(userIds, QUERY_CHUNK)) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, phone, sms_consent, notification_prefs")
      .in("id", ids)
      .order("id", { ascending: true });
    for (const u of users ?? []) userById.set(u.id, u);
  }

  // Build the prompts.
  const nudges: {
    userId: string;
    propertyId: string;
    title: string;
    body: string;
    url: string;
  }[] = [];
  for (const propertyId of propertyIds) {
    if (notifiedProperties.has(propertyId)) continue;
    const userId = ownerByProperty.get(propertyId);
    if (!userId) continue;
    const user = userById.get(userId);
    if (!user) continue;
    // An unset preference reads as enabled, matching NotificationPrefsForm.
    if (user.notification_prefs?.reminders === false) continue;

    const system = bestByProperty.get(propertyId)!;
    const stale = staleClause(system);
    const body = stale ? `${stale} ${win.guidance}` : win.guidance;
    nudges.push({
      userId,
      propertyId,
      title: win.title,
      body,
      url: postJobUrl(system.system_type, propertyId),
    });
  }

  if (nudges.length === 0) {
    return NextResponse.json({ checked, notified: 0, season: win.key });
  }

  // Send in bounded parallel batches.
  let notified = 0;
  for (const batch of chunk(nudges, SEND_CHUNK)) {
    await Promise.all(
      batch.map(async (n) => {
        try {
          // Exact per-home dup check right before the send: one indexed query
          // for THIS owner + this home's #sc marker this season. The bulk
          // guard above can be truncated at the row cap; this cannot.
          const { data: prior } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", n.userId)
            .eq("kind", NUDGE_KIND)
            .like("url", `%#sc=${n.propertyId}`)
            .gte("created_at", seasonStart)
            .limit(1)
            .maybeSingle();
          if (prior) return;

          const contact = userById.get(n.userId);
          const sent = await sendNotification(supabase, {
            userId: n.userId,
            kind: NUDGE_KIND,
            title: n.title,
            body: n.body,
            url: n.url,
            email: contact?.email ?? null,
            phone: contact?.phone ?? null,
            smsConsent: contact?.sms_consent === true,
          });
          if (sent) notified += 1;
        } catch {
          // One failed send shouldn't stop the rest of the batch.
        }
      })
    );
  }

  return NextResponse.json({ checked, notified, season: win.key });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
