import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Daily job (Vercel Cron, see vercel.json) that expires bonus grants past their
// date. All the money logic lives in the expire_bonus() DB function (migration
// 0010), which sweeps every grant with expires_at in the past, decrements the
// wallet's bonus counter, and writes a 'bonus_expiry' ledger row. It is
// idempotent: a grant already zeroed is skipped, so re-runs and overlapping
// runs are safe.
//
// Without this schedule the function never ran, so expired bonus stayed in
// wallets.bonus_balance_cents forever - a display lie, and the reason the
// apply_to_lead drain bug (fixed in 0058 by capping at the live grant sum)
// was reachable at all.

function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when CRON_SECRET is
  // set. Also accept an explicit x-cron-secret header or ?secret= for manual
  // runs / other schedulers.
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
  const { error } = await supabase.rpc("expire_bonus");
  if (error) {
    console.error("expire_bonus cron failed:", error.message ?? error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 200 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
