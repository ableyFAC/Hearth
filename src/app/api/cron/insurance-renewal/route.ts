import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { stateName } from "@/lib/forecast";
import {
  insuranceRateFor,
  DEFAULT_INSURANCE_RATE,
} from "@/app/(app)/documents/insuranceRates";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that nudges homeowners whose home
// insurance renews within the next 45 days, so they still have time to shop
// for a requote before the renewal auto-bills. One factual sentence pair, no
// manufactured urgency: the renewal date they entered plus the approximate
// premium trend for their state (static table in
// src/app/(app)/documents/insuranceRates.ts).
//
// Noise control:
// - One notification per homeowner per run; multiple homes in the window
//   collapse to the soonest renewal.
// - The dup guard is keyed to the RENEWAL ITSELF: the renewal date rides in
//   the notification url (/documents?renewal=YYYY-MM-DD), and a nudge whose
//   exact url already exists for that owner is never sent again, EVER (same
//   once-per-key-forever pattern as reviewRequest.ts). A rolling time window
//   cannot do this: any window shorter than the 45-day horizon re-nudges the
//   same renewal, and next year's renewal has a new date, so the guard
//   re-arms naturally.
// - Respects the "reminders" toggle on /account/notifications.
//
// Graceful degradation: insurance_renewal_date is a migration 0040 column.
// If the migration has not run yet, the properties query fails; that is
// logged and the run exits cleanly instead of erroring.

const RENEWAL_WINDOW_DAYS = 45;
const MAX_PROPERTIES = 500; // cap the work a single run does

const DAY_MS = 24 * 60 * 60 * 1000;

const NUDGE_KIND = "insurance_renewal";

// PostgREST silently truncates every response at its max-rows cap (default
// 1000 rows). The chunked lookups here fetch at most one row per id, so 200
// stays safely under the cap; the dup guard is a per-candidate exact query
// and never relies on a bulk read at all.
const QUERY_CHUNK = 200;
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

// Date-only math in UTC, since insurance_renewal_date is a plain date column
// (same approach as the maintenance-reminders cron).
function utcTodayMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// "March 5" for the notification title, timezone-safe (never Date-parse a
// bare YYYY-MM-DD string, which JS treats as UTC and can shift a day).
function fmtRenewalDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

type PropertyRow = {
  id: string;
  user_id: string;
  state: string | null;
  insurance_renewal_date: string;
};

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const todayStr = new Date(utcTodayMs()).toISOString().slice(0, 10);
  const horizonStr = new Date(utcTodayMs() + RENEWAL_WINDOW_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);

  // insurance_renewal_date is a migration 0040 column not yet in the
  // generated types, so the query goes through a cast. Soonest renewal first
  // so the recipient set stays stable when a run hits the cap. If the column
  // does not exist yet (migration not run), Postgres rejects the select: log
  // and exit cleanly.
  const { data: rawProps, error: propsError } = await (
    supabase.from("properties") as any
  )
    .select("id, user_id, state, insurance_renewal_date")
    .not("insurance_renewal_date", "is", null)
    .gte("insurance_renewal_date", todayStr)
    .lte("insurance_renewal_date", horizonStr)
    .order("insurance_renewal_date", { ascending: true })
    .limit(MAX_PROPERTIES);

  if (propsError) {
    console.error(
      "insurance-renewal cron: properties query failed (has migration 0040 run?):",
      propsError.message
    );
    return NextResponse.json(
      { checked: 0, notified: 0, error: propsError.message },
      { status: 200 }
    );
  }

  const properties = ((rawProps ?? []) as PropertyRow[]).filter(
    (p) => Boolean(p.user_id) && Boolean(p.insurance_renewal_date)
  );
  if (properties.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // One nudge per homeowner: several homes in the window collapse to the
  // soonest renewal (the query is already ordered soonest first).
  const byUser = new Map<string, PropertyRow>();
  for (const p of properties) {
    if (!byUser.has(p.user_id)) byUser.set(p.user_id, p);
  }
  const userIds = Array.from(byUser.keys());

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

  // Build the nudges. Factual and honest: the date they entered, the
  // approximate trend for their state (or nationally when we have no state
  // numbers), and "can be worth it", never a promise of savings.
  let checked = 0;
  const nudges: {
    userId: string;
    title: string;
    body: string;
    url: string;
  }[] = [];

  for (const [userId, property] of byUser) {
    checked += 1;

    const user = userById.get(userId);
    if (!user) continue;
    // An unset preference reads as enabled, matching NotificationPrefsForm.
    if (user.notification_prefs?.reminders === false) continue;

    // Dup guard, keyed to the renewal itself. The renewal date in the url is
    // the idempotency key: if a notification with this exact url exists for
    // this owner, EVER, this renewal was already nudged, and daily re-runs
    // stay no-ops for the whole 45-day window. Next year's renewal carries a
    // new date, so the guard re-arms on its own. One exact indexed query per
    // candidate, immune to bulk-read truncation. /documents ignores unknown
    // query params, so the link still lands on the documents page.
    const url = `/documents?renewal=${property.insurance_renewal_date}`;
    const { data: existing } = await supabase
      .from("notifications")
      .select("id")
      .eq("user_id", userId)
      .eq("kind", NUDGE_KIND)
      .eq("url", url)
      .limit(1)
      .maybeSingle();
    if (existing) continue;

    const rate = insuranceRateFor(property.state);
    const region =
      rate === DEFAULT_INSURANCE_RATE ? null : stateName(property.state);
    const trendClause = region
      ? `Premiums in ${region} rose about ${rate.trendPct}% last year.`
      : `Premiums nationally rose about ${rate.trendPct}% last year.`;

    nudges.push({
      userId,
      title: `Your home insurance renews on ${fmtRenewalDate(
        property.insurance_renewal_date
      )}`,
      body: `${trendClause} A quick requote can be worth it.`,
      url,
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
