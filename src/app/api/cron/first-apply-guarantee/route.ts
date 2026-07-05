import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) behind the first-application
// guarantee: a licensed pro's FIRST EVER application, if they weren't chosen
// for the job, gets its fee back automatically as 60-day expiring bonus
// credit. Once per contractor, ever.
//
// All the money logic lives in the guarantee_refund_first_application() DB
// function (migration 0041), which re-checks every eligibility rule atomically
// and once-ever-guards on the wallet's 'first_apply_guarantee' ledger row
// behind a wallet lock. This route only finds rough candidates, verifies each
// one with an exact per-contractor query, calls the function per application,
// and notifies the pro on each success, so re-runs and overlapping runs are
// safe, and nobody is ever credited twice.
//
// Deliberately NO created_at window on the scan: the DB function is
// idempotent and age-blind, and an owed credit must never lapse just because
// the cron did not reach it within some window (downtime, caps, backlogs).
// Oldest first plus MAX_SCAN means a backlog drains across runs instead of
// silently expiring.

const MAX_GRANTS = 200; // cap the money a single run hands out
const MAX_SCAN = 1000; // sanity cap on the candidate scan

const DAY_MS = 24 * 60 * 60 * 1000;

// A still-open, unassigned lead this old is dead-but-engaged: mirror of the
// 30-day terminal arm in guarantee_refund_first_application (0041).
const DEAD_LEAD_DAYS = 30;

const GUARANTEE_KIND = "first_apply_guarantee";
const GUARANTEE_URL = "/pro/billing";
const GUARANTEE_TITLE = "Your first application fee came back as credit";
const GUARANTEE_BODY =
  "You weren't picked for your first job, so we returned your application fee as credit. It's in your wallet for your next application, for the next 60 days.";

// PostgREST silently truncates every response at its max-rows cap (default
// 1000 rows), so an unbounded .in() fetch can quietly drop rows. Chunks of 50
// keep each bulk fetch's realistic worst case under the cap, and explicit
// .order() makes any residual truncation deterministic instead of arbitrary.
// No money decision rests on these bulk reads: each candidate's true first
// application is re-resolved with an exact single-contractor query before the
// RPC, and the DB function re-checks everything again atomically.
const QUERY_CHUNK = 50;

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

  // Rough candidates: paid, never ghost-refunded, not chosen, any age (an
  // owed credit never lapses; see the header note). Oldest first, so nobody
  // waits extra days when a run hits the cap.
  const { data: rawApps, error: appsError } = await supabase
    .from("lead_applications")
    .select("id, lead_id, contractor_id, fee_cents, status, created_at")
    .is("refunded_at", null)
    .gt("fee_cents", 0)
    .neq("status", "chosen")
    .order("created_at", { ascending: true })
    .limit(MAX_SCAN);
  if (appsError) {
    return NextResponse.json(
      { checked: 0, granted: 0, error: appsError.message },
      { status: 200 }
    );
  }
  let apps = rawApps ?? [];
  if (apps.length === 0) {
    return NextResponse.json({ checked: 0, granted: 0 });
  }

  // First-ever PRE-filter: for each contractor in the scan, find their
  // earliest application and keep only the candidate that IS that first
  // application. Oldest first: if the row cap still truncates, any entry the
  // map DOES have is the true earliest (everything sorting before it was
  // returned too), so truncation can only skip a contractor for this run,
  // never misidentify a first. The exact per-candidate resolution before the
  // RPC re-checks it regardless.
  const contractorIds = Array.from(new Set(apps.map((a) => a.contractor_id)));
  const firstByContractor = new Map<
    string,
    { id: string; created_at: string }
  >();
  for (const ids of chunk(contractorIds, QUERY_CHUNK)) {
    const { data: all } = await supabase
      .from("lead_applications")
      .select("id, contractor_id, created_at")
      .in("contractor_id", ids)
      .order("created_at", { ascending: true });
    for (const a of all ?? []) {
      const prev = firstByContractor.get(a.contractor_id);
      if (
        !prev ||
        a.created_at < prev.created_at ||
        (a.created_at === prev.created_at && a.id < prev.id)
      ) {
        firstByContractor.set(a.contractor_id, {
          id: a.id,
          created_at: a.created_at,
        });
      }
    }
  }
  apps = apps.filter(
    (a) => firstByContractor.get(a.contractor_id)?.id === a.id
  );

  // Terminal-loss filter: declined outright, or the lead went to a different
  // contractor, or the lead is no longer open without this pro being chosen,
  // or the lead is dead-but-engaged (30+ days old, unassigned, still 'new':
  // a homeowner message blocks ghost protection on those, so this is the only
  // path that ever resolves them). Mirrors the terminal arms in
  // guarantee_refund_first_application (0041), which stays the authority on
  // every rule. This fetch is capped at QUERY_CHUNK rows per chunk (one row
  // per unique lead id), so the row cap cannot truncate it.
  const deadLeadCutoffMs = Date.now() - DEAD_LEAD_DAYS * DAY_MS;
  const leadIds = Array.from(new Set(apps.map((a) => a.lead_id)));
  const leadById = new Map<
    string,
    { contractor_id: string | null; status: string; created_at: string }
  >();
  for (const ids of chunk(leadIds, QUERY_CHUNK)) {
    const { data: leads } = await supabase
      .from("contractor_leads")
      .select("id, contractor_id, status, created_at")
      .in("id", ids)
      .order("created_at", { ascending: true });
    for (const l of leads ?? []) leadById.set(l.id, l);
  }
  apps = apps.filter((a) => {
    const lead = leadById.get(a.lead_id);
    if (lead?.contractor_id && lead.contractor_id === a.contractor_id) {
      return false; // they won the job
    }
    const deadButEngaged =
      !!lead &&
      lead.contractor_id == null &&
      lead.status === "new" &&
      Date.parse(lead.created_at) <= deadLeadCutoffMs;
    return (
      a.status === "declined" ||
      (lead?.contractor_id != null && lead.contractor_id !== a.contractor_id) ||
      !lead ||
      lead.status !== "new" ||
      deadButEngaged
    );
  });

  // License filter: the guarantee is only for pros with a license on file.
  // Also resolves each contractor's user for the notification.
  const candidateContractorIds = Array.from(
    new Set(apps.map((a) => a.contractor_id))
  );
  const contractorById = new Map<
    string,
    { user_id: string | null; license_number: string | null }
  >();
  for (const ids of chunk(candidateContractorIds, QUERY_CHUNK)) {
    const { data: contractors } = await supabase
      .from("contractors")
      .select("id, user_id, license_number")
      .in("id", ids)
      .order("id", { ascending: true });
    for (const c of contractors ?? []) contractorById.set(c.id, c);
  }
  apps = apps.filter((a) => {
    const c = contractorById.get(a.contractor_id);
    return Boolean(c?.license_number?.trim());
  });

  // Cheap pre-filter: anyone we already told about this credit was already
  // granted it (the notification only fires on a successful grant), so skip
  // the RPC round-trip. The DB function stays the authority either way.
  const candidateUserIds = Array.from(
    new Set(
      apps
        .map((a) => contractorById.get(a.contractor_id)?.user_id)
        .filter((u): u is string => Boolean(u))
    )
  );
  const alreadyGranted = new Set<string>();
  for (const ids of chunk(candidateUserIds, QUERY_CHUNK)) {
    const { data: prior } = await supabase
      .from("notifications")
      .select("user_id")
      .in("user_id", ids)
      .eq("kind", GUARANTEE_KIND)
      .order("created_at", { ascending: false });
    for (const p of prior ?? []) alreadyGranted.add(p.user_id);
  }

  // Contact details so the email/SMS channels can fire once their providers
  // are configured (same pattern as pro-winback).
  const userById = new Map<
    string,
    { id: string; email: string | null; phone: string | null }
  >();
  for (const ids of chunk(candidateUserIds, QUERY_CHUNK)) {
    const { data: users } = await supabase
      .from("users")
      .select("id, email, phone")
      .in("id", ids)
      .order("id", { ascending: true });
    for (const u of users ?? []) userById.set(u.id, u);
  }

  let checked = 0;
  let granted = 0;

  for (const app of apps) {
    if (granted >= MAX_GRANTS) break;
    try {
      checked += 1;
      const userId = contractorById.get(app.contractor_id)?.user_id ?? null;
      if (userId && alreadyGranted.has(userId)) continue;

      // Exact per-candidate verification, right before money moves: resolve
      // THIS contractor's true first application with a single exact query
      // (same min created_at, id tiebreak rule as the DB function). The bulk
      // map above is only a pre-filter that the row cap can truncate; only
      // candidates pay this query.
      const { data: firstApp } = await supabase
        .from("lead_applications")
        .select("id")
        .eq("contractor_id", app.contractor_id)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!firstApp || firstApp.id !== app.id) continue;

      // The DB function is the authority: false means not actually eligible
      // (or already granted), and a missing migration just logs and moves on.
      let ok: unknown = null;
      try {
        const { data, error } = await (supabase as any).rpc(
          "guarantee_refund_first_application",
          { p_application: app.id }
        );
        if (error) {
          console.error(
            "guarantee_refund_first_application failed:",
            error.message
          );
          continue;
        }
        ok = data;
      } catch (e) {
        console.error("guarantee_refund_first_application unavailable:", e);
        continue;
      }
      if (ok !== true) continue;
      granted += 1;

      // Tell the pro. Best-effort: the credit itself is already committed,
      // and a notification hiccup must not stop the run.
      if (userId) {
        const contact = userById.get(userId);
        await sendNotification(supabase, {
          userId,
          kind: GUARANTEE_KIND,
          title: GUARANTEE_TITLE,
          body: GUARANTEE_BODY,
          url: GUARANTEE_URL,
          email: contact?.email ?? null,
          phone: contact?.phone ?? null,
        });
      }
    } catch {
      // One bad application shouldn't stop the rest of the run.
      continue;
    }
  }

  return NextResponse.json({ checked, granted });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
