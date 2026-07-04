import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that runs ghost protection for pros:
// if a pro paid to apply and the homeowner never engaged (no pick, no message)
// for 7 days while the job sat untouched, the apply fee comes back to their
// wallet automatically.
//
// All the money logic lives in the ghost_refund_application() DB function
// (migration 0028), which re-checks every eligibility rule atomically and
// double-refund-guards with `where refunded_at is null`. This route only finds
// rough candidates, calls the function per application, and notifies the pro
// on each success - so re-runs and overlapping runs are safe by construction.

const GHOST_DAYS = 7;
const MAX_REFUNDS = 200; // cap the work a single run does

const DAY_MS = 24 * 60 * 60 * 1000;

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

// "$50" or "$12.50", matching how fees render on the pro dashboard.
function feeLabel(cents: number): string {
  const v = cents / 100;
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
}

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - GHOST_DAYS * DAY_MS).toISOString();

  // Rough candidates: 7+ days old, never refunded, still just "applied".
  // Oldest first, so nobody waits extra days when a run hits the cap.
  const { data: apps, error } = await supabase
    .from("lead_applications")
    .select("id, lead_id, contractor_id, fee_cents")
    .is("refunded_at", null)
    .eq("status", "applied")
    .gt("fee_cents", 0)
    .lte("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(MAX_REFUNDS);

  if (error || !apps || apps.length === 0) {
    return NextResponse.json(
      { refunded: 0, ...(error ? { error: error.message } : {}) },
      { status: 200 }
    );
  }

  // Cheap pre-filter: drop applications whose lead was already assigned or
  // closed. The DB function is still the authority on every rule.
  const leadIds = Array.from(new Set(apps.map((a) => a.lead_id)));
  const { data: leads } = await supabase
    .from("contractor_leads")
    .select("id, contractor_id, status")
    .in("id", leadIds);
  const openLeads = new Set(
    (leads ?? [])
      .filter((l) => l.contractor_id === null && l.status === "new")
      .map((l) => l.id)
  );
  const candidates = apps.filter((a) => openLeads.has(a.lead_id));

  // Resolve each candidate's contractor to a user for the notification.
  const contractorIds = Array.from(
    new Set(candidates.map((a) => a.contractor_id))
  );
  const { data: contractors } = contractorIds.length
    ? await supabase
        .from("contractors")
        .select("id, user_id")
        .in("id", contractorIds)
    : { data: [] };
  const userByContractor = new Map(
    (contractors ?? []).map((c) => [c.id, c.user_id])
  );

  let refunded = 0;

  for (const app of candidates) {
    try {
      const { data: ok } = await supabase.rpc("ghost_refund_application", {
        p_application: app.id,
      });
      if (ok !== true) continue;
      refunded += 1;

      // Tell the pro their money came back. Best-effort: the refund itself is
      // already committed, and a notification hiccup must not stop the run.
      const userId = userByContractor.get(app.contractor_id);
      if (userId) {
        await supabase.from("notifications").insert({
          user_id: userId,
          kind: "ghost_refund",
          title: "Ghost protection: your fee came back",
          body: `The homeowner never responded, so your ${feeLabel(
            Number(app.fee_cents)
          )} apply fee was returned to your wallet.`,
          url: "/pro",
        });
      }
    } catch {
      // One bad application shouldn't stop the rest of the run.
      continue;
    }
  }

  return NextResponse.json({ refunded });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
