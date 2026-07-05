import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { labelFor, JOB_CATEGORIES } from "@/lib/constants";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that nudges a homeowner whose
// posted job has pros waiting on it: applications cost the pro real money,
// and ghost protection refunds them after 7 silent days, so a homeowner who
// simply hasn't looked yet is the main way young marketplaces leak matches.
// One factual sentence: the real applicant count and the real category. No
// manufactured urgency beyond the truth that pros move on.
//
// Candidate = an open lead (contractor_id null, status 'new') with at least
// one live (refunded_at null) application that is more than 24 hours old,
// where the homeowner has not sent a single message in that lead's thread
// since the earliest such application. "Engagement" mirrors ghost
// protection's definition exactly (messages with sender_role 'homeowner',
// migration 0028), so this nudge fires only where a ghost refund is on its
// way to happening.
//
// Noise control: one notification per lead EVER. The lead id rides in the
// notification url (/contractors?lead=<id>) and a nudge whose exact url
// already exists for that owner is never sent again (same once-per-key
// pattern as reviewRequest.ts and the insurance-renewal cron). /contractors
// ignores unknown query params, so the link still lands on the job list.
//
// Graceful degradation: any failed bulk query is logged and the run exits
// cleanly with { checked, notified } instead of erroring.

const WAIT_HOURS = 24;
const MAX_LEADS = 200; // cap the work a single run does
const QUERY_CHUNK = 50;
const SEND_CHUNK = 50;

const NUDGE_KIND = "applicant_waiting";

const HOUR_MS = 60 * 60 * 1000;

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

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - WAIT_HOURS * HOUR_MS).toISOString();

  // Live applications at least 24h old, oldest first, so the leads whose pros
  // have waited longest are served first when a run hits the cap. The first
  // row seen per lead is that lead's EARLIEST qualifying application: the
  // engagement check below is "no homeowner message since then".
  const { data: apps, error: appsError } = await supabase
    .from("lead_applications")
    .select("lead_id, created_at")
    .is("refunded_at", null)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(1000);

  if (appsError) {
    console.error(
      "applicant-nudge cron: applications query failed:",
      appsError.message
    );
    return NextResponse.json(
      { checked: 0, notified: 0, error: appsError.message },
      { status: 200 }
    );
  }

  const earliestAppByLead = new Map<string, string>();
  for (const a of apps ?? []) {
    if (!earliestAppByLead.has(a.lead_id))
      earliestAppByLead.set(a.lead_id, a.created_at);
  }
  if (earliestAppByLead.size === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // Keep only leads that are still open (nobody chosen, still 'new'). The
  // Map preserved insertion order, so candidates stay oldest-wait-first.
  const candidateIds = Array.from(earliestAppByLead.keys());
  const leadById = new Map<
    string,
    { id: string; property_id: string; category: string }
  >();
  for (const ids of chunk(candidateIds, QUERY_CHUNK)) {
    const { data: leads, error: leadsError } = await supabase
      .from("contractor_leads")
      .select("id, property_id, category, contractor_id, status")
      .in("id", ids);
    if (leadsError) {
      console.error(
        "applicant-nudge cron: leads query failed:",
        leadsError.message
      );
      continue;
    }
    for (const l of leads ?? []) {
      if (l.contractor_id === null && l.status === "new" && l.property_id) {
        leadById.set(l.id, {
          id: l.id,
          property_id: l.property_id,
          category: l.category,
        });
      }
    }
  }
  const openIds = candidateIds
    .filter((id) => leadById.has(id))
    .slice(0, MAX_LEADS);
  if (openIds.length === 0) {
    return NextResponse.json({ checked: 0, notified: 0 });
  }

  // Real live-applicant count per lead ("N pros applied" must be true), and
  // the homeowner-engagement check: the latest homeowner message per thread,
  // compared against that lead's earliest qualifying application.
  const liveCountByLead = new Map<string, number>();
  const lastOwnerMsgByLead = new Map<string, string>();
  for (const ids of chunk(openIds, QUERY_CHUNK)) {
    const { data: liveApps } = await supabase
      .from("lead_applications")
      .select("lead_id")
      .in("lead_id", ids)
      .is("refunded_at", null);
    for (const a of liveApps ?? []) {
      liveCountByLead.set(a.lead_id, (liveCountByLead.get(a.lead_id) ?? 0) + 1);
    }

    const { data: msgs } = await supabase
      .from("messages")
      .select("lead_id, created_at")
      .in("lead_id", ids)
      .eq("sender_role", "homeowner");
    for (const m of msgs ?? []) {
      const prev = lastOwnerMsgByLead.get(m.lead_id);
      if (!prev || m.created_at > prev)
        lastOwnerMsgByLead.set(m.lead_id, m.created_at);
    }
  }

  // Resolve each lead's homeowner: property -> owner, plus contact details so
  // the email/SMS channels fire once their providers are configured.
  const propertyIds = Array.from(
    new Set(openIds.map((id) => leadById.get(id)!.property_id))
  );
  const ownerByProperty = new Map<string, string>();
  for (const ids of chunk(propertyIds, QUERY_CHUNK)) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, user_id")
      .in("id", ids);
    for (const p of props ?? []) {
      if (p.user_id) ownerByProperty.set(p.id, p.user_id);
    }
  }
  const ownerIds = Array.from(new Set(ownerByProperty.values()));
  const contactByUser = new Map<
    string,
    { email: string | null; phone: string | null }
  >();
  for (const ids of chunk(ownerIds, QUERY_CHUNK)) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, phone")
      .in("id", ids);
    for (const u of users ?? [])
      contactByUser.set(u.id, { email: u.email, phone: u.phone });
  }

  let checked = 0;
  const nudges: {
    userId: string;
    title: string;
    body: string;
    url: string;
  }[] = [];

  for (const leadId of openIds) {
    checked += 1;
    try {
      const lead = leadById.get(leadId)!;
      const ownerId = ownerByProperty.get(lead.property_id);
      if (!ownerId) continue;

      // Homeowner already engaged (ghost protection's definition): any
      // message from their side of the thread since the earliest qualifying
      // application means they've seen it. No nudge.
      const earliestApp = earliestAppByLead.get(leadId)!;
      const lastMsg = lastOwnerMsgByLead.get(leadId);
      if (lastMsg && new Date(lastMsg) > new Date(earliestApp)) continue;

      const count = liveCountByLead.get(leadId) ?? 0;
      if (count === 0) continue; // drifted between queries; nothing to say

      // Dup guard, keyed to the lead itself: one nudge per lead EVER. An
      // exact indexed query per candidate (reviewRequest pattern), immune to
      // bulk-read truncation.
      const url = `/contractors?lead=${leadId}`;
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", ownerId)
        .eq("kind", NUDGE_KIND)
        .eq("url", url)
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      nudges.push({
        userId: ownerId,
        title: `${count} pro${count === 1 ? "" : "s"} applied to your ${labelFor(
          JOB_CATEGORIES,
          lead.category
        )} job`,
        body: "Take a look before they book up elsewhere.",
        url,
      });
    } catch (err) {
      // One bad lead shouldn't stop the rest of the run.
      console.error(
        "applicant-nudge cron: lead check failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  // Send in bounded parallel batches.
  let notified = 0;
  for (const batch of chunk(nudges, SEND_CHUNK)) {
    await Promise.all(
      batch.map(async (n) => {
        try {
          const contact = contactByUser.get(n.userId);
          const sent = await sendNotification(supabase, {
            userId: n.userId,
            kind: NUDGE_KIND,
            title: n.title,
            body: n.body,
            url: n.url,
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
