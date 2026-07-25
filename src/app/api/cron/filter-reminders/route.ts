import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) behind the consumables autopilot:
// HVAC filter change reminders. Owners who entered a filter size and a
// reminder cadence on their HVAC system get one nudge per cycle, with a
// prefilled Amazon SEARCH link for their size so acting takes one tap.
// (Plain search link, no affiliate tag yet.)
//
// Cadence anchoring: each system's cycle is anchored to its last_serviced
// date when present, else the system's created_at. A reminder fires only
// when the system is just past a cycle boundary (anchor + k * interval), so
// existing systems come due at sensible staggered offsets rather than all
// at once the day this ships.
//
// Noise control:
// - One reminder per system per cycle. The dup guard looks for a
//   "filter_reminder" notification for that owner whose url carries this
//   system's marker (#hs=<system id>) within the last (interval minus a few
//   days), so the daily schedule and accidental re-runs are no-ops.
// - Respects the "reminders" toggle on /account/notifications.
//
// Graceful degradation: filter_size / filter_interval_months are migration
// 0042 columns. If the migration has not run yet, the home_systems query
// fails; that is logged and the run exits cleanly instead of erroring.

const MAX_SYSTEMS = 1000; // cap the work a single run does

const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_PER_MONTH = 30;
// A reminder fires in the first few days after a cycle boundary; wide enough
// that a missed run or two never skips a whole cycle.
const CYCLE_WINDOW_DAYS = 7;
// Dup guard window: the interval minus a few days, so an early scheduler can
// never suppress the next cycle's legitimate reminder.
const DUP_GUARD_SLACK_DAYS = 5;
const MAX_INTERVAL_MONTHS = 12;

const NUDGE_KIND = "filter_reminder";

// PostgREST silently truncates every response at its max-rows cap (default
// 1000 rows), so an unbounded .in() fetch can quietly drop rows. Owner chunks
// of 50 keep each bulk fetch's realistic worst case under the cap, and
// explicit .order() makes any residual truncation deterministic instead of
// arbitrary. The bulk dup guard is only a pre-filter either way: every send
// is preceded by an exact per-system dup check.
const QUERY_CHUNK = 50;
// Explicit ceiling on the bulk dup-guard scan (matches the PostgREST cap so
// truncation is ours and deterministic, newest rows kept).
const DUP_SCAN_LIMIT = 1000;
// Keep Promise.all fan-out bounded.
const SEND_CHUNK = 20;

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>" when
  // the CRON_SECRET env var is set. Also accept an explicit x-cron-secret header
  // for manual runs / other schedulers.
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const provided = bearer ?? req.headers.get("x-cron-secret");
  if (!provided) return false;
  // Constant-time compare (mirrors src/lib/checkr.ts / the twilio inbound
  // webhook): only call timingSafeEqual once both buffers are a confirmed
  // equal length, since it throws on a length mismatch.
  const providedBuf = Buffer.from(provided, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (providedBuf.length !== expectedBuf.length) return false;
  try {
    return timingSafeEqual(providedBuf, expectedBuf);
  } catch {
    return false;
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Amazon search link for the owner's filter size. Plain search link, no
// affiliate tag yet. The #hs fragment is this system's dup-guard marker; the
// browser keeps it client-side so the search itself is unaffected.
function reorderUrl(size: string, systemId: string): string {
  return `https://www.amazon.com/s?k=${encodeURIComponent(
    `${size} air filter`
  )}#hs=${systemId}`;
}

type SystemRow = {
  id: string;
  property_id: string;
  filter_size: string;
  filter_interval_months: number;
  last_serviced: string | null;
  created_at: string;
};

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // filter_size / filter_interval_months are migration 0042 columns not yet
  // in the generated types, so the query goes through a cast. If the columns
  // do not exist yet (migration not run), Postgres rejects the select: log
  // and exit cleanly.
  const { data: rawSystems, error: systemsError } = await (
    supabase.from("home_systems") as any
  )
    .select(
      "id, property_id, filter_size, filter_interval_months, last_serviced, created_at"
    )
    .eq("system_type", "hvac")
    .not("filter_size", "is", null)
    .not("filter_interval_months", "is", null)
    .order("created_at", { ascending: true })
    .limit(MAX_SYSTEMS);

  if (systemsError) {
    console.error(
      "filter-reminders cron: home_systems query failed (has migration 0042 run?):",
      systemsError.message
    );
    return NextResponse.json(
      { checked: 0, notified: 0, error: systemsError.message },
      { status: 200 }
    );
  }

  const systems = ((rawSystems ?? []) as SystemRow[]).filter(
    (s) =>
      Boolean(s.filter_size) &&
      Number.isFinite(s.filter_interval_months) &&
      s.filter_interval_months >= 1 &&
      s.filter_interval_months <= MAX_INTERVAL_MONTHS
  );
  if (systems.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // Which systems are at a cycle boundary right now? Anchor to last_serviced
  // when the owner recorded one, else created_at, and fire only in the first
  // CYCLE_WINDOW_DAYS after each anchor + k * interval boundary.
  const now = Date.now();
  let checked = 0;
  const due: SystemRow[] = [];
  for (const s of systems) {
    checked += 1;
    const anchorStr = s.last_serviced
      ? `${s.last_serviced}T00:00:00Z`
      : s.created_at;
    const anchorMs = Date.parse(anchorStr);
    if (Number.isNaN(anchorMs)) continue;
    const daysSince = Math.floor((now - anchorMs) / DAY_MS);
    const intervalDays = s.filter_interval_months * DAYS_PER_MONTH;
    if (daysSince < intervalDays) continue; // first cycle not complete yet
    if (daysSince % intervalDays >= CYCLE_WINDOW_DAYS) continue;
    due.push(s);
  }
  if (due.length === 0) {
    return NextResponse.json({ checked, notified: 0 });
  }

  // Owner lookup: home_systems -> properties.user_id.
  const propertyIds = Array.from(new Set(due.map((s) => s.property_id)));
  const ownerByProperty = new Map<string, string>();
  for (const ids of chunk(propertyIds, QUERY_CHUNK)) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, user_id")
      .in("id", ids)
      .order("id", { ascending: true });
    for (const p of props ?? []) {
      if (p.user_id) ownerByProperty.set(p.id, p.user_id);
    }
  }

  const userIds = Array.from(
    new Set(
      due
        .map((s) => ownerByProperty.get(s.property_id))
        .filter((u): u is string => Boolean(u))
    )
  );
  if (userIds.length === 0) {
    return NextResponse.json({ checked, notified: 0 });
  }

  // Bulk dup PRE-filter: pull this kind's recent notifications for these
  // owners over the longest possible window (12 months), then match per
  // system via the #hs=<id> marker in the url. A system already reminded
  // within (its interval minus a few days) is skipped. Newest first plus an
  // explicit limit: if the row cap truncates anyway, the newest sends (the
  // ones that suppress dups) are the rows kept, and the exact per-system
  // check before each send is the real guard.
  const maxGuardCutoff = new Date(
    now - MAX_INTERVAL_MONTHS * DAYS_PER_MONTH * DAY_MS
  ).toISOString();
  const recentBySystem = new Map<string, number>(); // system id -> newest send ms
  for (const ids of chunk(userIds, QUERY_CHUNK)) {
    const { data: recent } = await supabase
      .from("notifications")
      .select("url, created_at")
      .in("user_id", ids)
      .eq("kind", NUDGE_KIND)
      .gte("created_at", maxGuardCutoff)
      .order("created_at", { ascending: false })
      .limit(DUP_SCAN_LIMIT);
    for (const r of recent ?? []) {
      const m = (r.url ?? "").match(/#hs=([0-9a-f-]+)/i);
      if (!m) continue;
      const ms = Date.parse(r.created_at);
      if (Number.isNaN(ms)) continue;
      const prev = recentBySystem.get(m[1]);
      if (prev == null || ms > prev) recentBySystem.set(m[1], ms);
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

  // Build the reminders. Warm and plain: what to do, why it helps, and a
  // link that lands on the right size.
  const nudges: {
    userId: string;
    systemId: string;
    guardMs: number;
    title: string;
    body: string;
    url: string;
  }[] = [];
  for (const s of due) {
    const userId = ownerByProperty.get(s.property_id);
    if (!userId) continue;

    const lastSent = recentBySystem.get(s.id);
    const guardMs =
      (s.filter_interval_months * DAYS_PER_MONTH - DUP_GUARD_SLACK_DAYS) *
      DAY_MS;
    if (lastSent != null && now - lastSent < guardMs) continue;

    const user = userById.get(userId);
    if (!user) continue;
    // An unset preference reads as enabled, matching NotificationPrefsForm.
    if (user.notification_prefs?.reminders === false) continue;

    nudges.push({
      userId,
      systemId: s.id,
      guardMs,
      title: `Time to change your HVAC filter (size ${s.filter_size})`,
      body: "A fresh filter keeps the air clean and the system efficient.",
      url: reorderUrl(s.filter_size, s.id),
    });
  }

  if (nudges.length === 0) {
    return NextResponse.json({ checked, notified: 0 });
  }

  // Send in bounded parallel batches.
  let notified = 0;
  for (const batch of chunk(nudges, SEND_CHUNK)) {
    await Promise.all(
      batch.map(async (n) => {
        try {
          // Exact per-system dup check right before the send: one indexed
          // query for THIS owner + this system's #hs marker. The bulk guard
          // above can be truncated at the PostgREST row cap; this cannot.
          const { data: prior } = await supabase
            .from("notifications")
            .select("created_at")
            .eq("user_id", n.userId)
            .eq("kind", NUDGE_KIND)
            .like("url", `%#hs=${n.systemId}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (prior && now - Date.parse(prior.created_at) < n.guardMs) return;

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

  return NextResponse.json({ checked, notified });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
