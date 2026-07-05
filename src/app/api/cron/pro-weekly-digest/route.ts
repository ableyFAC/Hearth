import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { AGING_LEAD_TIERS } from "@/lib/leadPricing";
import { MAX_APPLICANTS_PER_JOB } from "@/lib/constants";

export const runtime = "nodejs";

// Weekly job (Vercel Cron, see vercel.json) that sends every contractor, free
// and member alike, one short factual digest of their trades: how many jobs
// were posted in their categories in the last 7 days and how many are still
// open (status new, unassigned, under the applicant cap), how many of their
// own applications are still pending, and how many open jobs in their trades
// currently carry an aging discount. Numbers only, no manufactured urgency:
// a pro with nothing to report (zero jobs posted AND zero pending apps) gets
// nothing at all.
//
// Noise control: at most one digest per pro per run, and a dup guard (same
// kind written in the last 6 days) makes an accidental second run a no-op
// while never suppressing next week's legitimate digest.

const MAX_CONTRACTORS = 1000; // cap the work a single run does
const MAX_JOBS = 2000; // sanity cap on each job scan
const DAY_MS = 24 * 60 * 60 * 1000;

const DIGEST_WINDOW_MS = 7 * DAY_MS;

// Dup-guard lookback. Shorter than 7 days so a scheduler that fires a few
// hours early never suppresses next week's legitimate digest.
const DUP_GUARD_MS = 6 * DAY_MS;

const DIGEST_KIND = "weekly_digest";
const DIGEST_URL = "/pro";
const DIGEST_TITLE = "This week in your trades";

// Keep .in() lists and Promise.all fan-out bounded.
const QUERY_CHUNK = 200;
const SEND_CHUNK = 20;

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

function plural(n: number, word: string): string {
  return n === 1 ? `${n} ${word}` : `${n} ${word}s`;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowMs = Date.now();

  // Everyone with a pro profile gets the digest, free and member alike.
  // Oldest first so the recipient set stays stable when a run hits the cap.
  const { data: rawContractors, error: contractorsError } = await supabase
    .from("contractors")
    .select("id, user_id, categories")
    .order("created_at", { ascending: true })
    .limit(MAX_CONTRACTORS);
  if (contractorsError) {
    return NextResponse.json(
      { checked: 0, notified: 0, error: contractorsError.message },
      { status: 200 }
    );
  }
  const contractors = (rawContractors ?? []).filter(
    (c): c is typeof c & { user_id: string } => Boolean(c.user_id)
  );
  if (contractors.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // Jobs posted in the last 7 days (any status: "posted" is the fact being
  // reported; openness is checked separately below).
  const weekCutoff = new Date(nowMs - DIGEST_WINDOW_MS).toISOString();
  const { data: recentJobs, error: jobsError } = await supabase
    .from("contractor_leads")
    .select("id, category, status, contractor_id")
    .gte("created_at", weekCutoff)
    .limit(MAX_JOBS);
  if (jobsError) {
    return NextResponse.json(
      { checked: 0, notified: 0, error: jobsError.message },
      { status: 200 }
    );
  }

  // Open jobs old enough for an aging markdown (3+ days per AGING_LEAD_TIERS).
  // The fee math itself lives in lead_fee_cents(); age is all that gates it.
  const minAgingDays = Math.min(...AGING_LEAD_TIERS.map((t) => t.days));
  const agingCutoff = new Date(nowMs - minAgingDays * DAY_MS).toISOString();
  const { data: agingJobs } = await supabase
    .from("contractor_leads")
    .select("id, category")
    .is("contractor_id", null)
    .eq("status", "new")
    .lte("created_at", agingCutoff)
    .limit(MAX_JOBS);

  // Live (non-refunded) application counts per job, so "still open" and the
  // aging-deal count both respect the applicant cap.
  const jobIds = Array.from(
    new Set([
      ...(recentJobs ?? []).map((j) => j.id),
      ...(agingJobs ?? []).map((j) => j.id),
    ])
  );
  const liveAppsByJob = new Map<string, number>();
  for (const ids of chunk(jobIds, QUERY_CHUNK)) {
    const { data: apps } = await supabase
      .from("lead_applications")
      .select("lead_id")
      .in("lead_id", ids)
      .is("refunded_at", null);
    for (const a of apps ?? []) {
      liveAppsByJob.set(a.lead_id, (liveAppsByJob.get(a.lead_id) ?? 0) + 1);
    }
  }
  const jobHasRoom = (id: string) =>
    (liveAppsByJob.get(id) ?? 0) < MAX_APPLICANTS_PER_JOB;

  // Each contractor's pending applications (still sitting at 'applied').
  const pendingByContractor = new Map<string, number>();
  for (const ids of chunk(contractors.map((c) => c.id), QUERY_CHUNK)) {
    const { data: pending } = await supabase
      .from("lead_applications")
      .select("contractor_id")
      .in("contractor_id", ids)
      .eq("status", "applied");
    for (const p of pending ?? []) {
      pendingByContractor.set(
        p.contractor_id,
        (pendingByContractor.get(p.contractor_id) ?? 0) + 1
      );
    }
  }

  // Dup guard: anyone who already got a digest in the last 6 days (e.g. the
  // cron ran twice) is skipped.
  const guardCutoff = new Date(nowMs - DUP_GUARD_MS).toISOString();
  const alreadyNotified = new Set<string>();
  for (const ids of chunk(contractors.map((c) => c.user_id), QUERY_CHUNK)) {
    const { data: recent } = await supabase
      .from("notifications")
      .select("user_id")
      .in("user_id", ids)
      .eq("kind", DIGEST_KIND)
      .gte("created_at", guardCutoff);
    for (const r of recent ?? []) alreadyNotified.add(r.user_id);
  }

  // Build each pro's digest. Numbers only: that's the product voice.
  let checked = 0;
  const digests: { userId: string; body: string }[] = [];

  for (const contractor of contractors) {
    try {
      checked += 1;
      if (alreadyNotified.has(contractor.user_id)) continue;

      // Null categories means "takes anything", matching open_jobs_for_me().
      const cats: string[] | null = contractor.categories;
      const inTrades = (category: string) =>
        cats === null || cats.includes(category);

      const posted = (recentJobs ?? []).filter((j) => inTrades(j.category));
      const stillOpen = posted.filter(
        (j) =>
          j.contractor_id === null && j.status === "new" && jobHasRoom(j.id)
      );
      const pending = pendingByContractor.get(contractor.id) ?? 0;
      const deals = (agingJobs ?? []).filter(
        (j) => inTrades(j.category) && jobHasRoom(j.id)
      );

      // Nothing to say, nothing sent.
      if (posted.length === 0 && pending === 0) continue;

      const parts: string[] = [];
      parts.push(
        posted.length === 0
          ? "No new jobs in your trades this week."
          : `${plural(posted.length, "job")} posted in your trades this week, ${
              stillOpen.length
            } still open.`
      );
      if (pending > 0) {
        parts.push(`You have ${plural(pending, "pending application")}.`);
      }
      if (deals.length > 0) {
        parts.push(
          `${plural(deals.length, "open job")} in your trades ${
            deals.length === 1 ? "has" : "have"
          } a reduced apply fee right now.`
        );
      }

      digests.push({ userId: contractor.user_id, body: parts.join(" ") });
    } catch {
      // One bad contractor shouldn't stop the rest of the run.
      continue;
    }
  }

  if (digests.length === 0) {
    return NextResponse.json({ checked, notified: 0 });
  }

  // Contact details so the email/SMS channels can fire once their providers
  // are configured (same pattern as proAlerts.ts).
  const userById = new Map<
    string,
    { id: string; email: string | null; phone: string | null }
  >();
  for (const ids of chunk(digests.map((d) => d.userId), QUERY_CHUNK)) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, phone")
      .in("id", ids);
    for (const u of users ?? []) userById.set(u.id, u);
  }

  // Send in bounded parallel batches.
  let notified = 0;
  for (const batch of chunk(digests, SEND_CHUNK)) {
    await Promise.all(
      batch.map(async (d) => {
        try {
          const contact = userById.get(d.userId);
          const sent = await sendNotification(supabase, {
            userId: d.userId,
            kind: DIGEST_KIND,
            title: DIGEST_TITLE,
            body: d.body,
            url: DIGEST_URL,
            email: contact?.email ?? null,
            phone: contact?.phone ?? null,
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
