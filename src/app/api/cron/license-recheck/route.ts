import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lookupCslbLicense } from "@/lib/cslb";

export const runtime = "nodejs";

// Weekly job (Vercel Cron, see vercel.json) that re-checks a verified pro's
// license against the CSLB public database, since a license that was active
// a month ago may have lapsed since. Auth and batching copy
// src/app/api/cron/pro-compliance/route.ts exactly.
//
// Scope, on purpose: only rows already 'verified' (0037/0055) and stale by
// license_verified_at. A 'pending' or 'failed' row is NOT this cron's job -
// those get re-checked by the pro's own "Verify now" button
// (verifyLicenseNowAction, src/app/pro/actions.ts), never automatically in
// the background.
//
// Politeness: CSLB is a government site with no API and no rate-limit
// contract. Each run checks at most MAX_PER_RUN contractors, sequentially,
// with a short delay between them (two requests per contractor: a warm-up
// hit to CheckLicense.aspx, then LicenseDetail.aspx - see src/lib/cslb.ts),
// rather than firing every due contractor's check in parallel.
//
// Never-downgrade-on-error rule: only a clean 'not_found' or 'inactive'
// parse moves a contractor OUT of 'verified'. An 'error' outcome (CSLB
// unreachable, timed out, or its page shape changed) leaves the row exactly
// as-is and is simply skipped - a scraper hiccup must never read as a lapsed
// license.

const MAX_PER_RUN = 10;
const STALE_DAYS = 30;
const BETWEEN_REQUESTS_MS = 1500; // polite spacing between CSLB hits

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type DueContractor = {
  id: string;
  license_number: string | null;
  license_verified_at: string | null;
};

async function runCron(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const staleBefore = new Date(Date.now() - STALE_DAYS * DAY_MS).toISOString();

  // Oldest-checked first, so a run that hits the cap still makes forward
  // progress across weeks rather than starving the same contractors.
  const { data: rows, error } = await (supabase.from("contractors") as any)
    .select("id, license_number, license_verified_at")
    .eq("license_verified_status", "verified")
    .not("license_verified_at", "is", null)
    .lte("license_verified_at", staleBefore)
    .order("license_verified_at", { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    console.error("license-recheck cron: contractors query failed:", error.message);
    return NextResponse.json({ checked: 0, downgraded: 0, error: error.message });
  }

  const due = ((rows ?? []) as DueContractor[]).filter(
    (r) => !!r.license_number
  );

  let checked = 0;
  let downgraded = 0;
  let errored = 0;

  for (let i = 0; i < due.length; i++) {
    const row = due[i];
    checked += 1;

    try {
      const result = await lookupCslbLicense(row.license_number as string);
      const detail = {
        businessName: result.businessName ?? null,
        statusText: result.statusText ?? null,
        classifications: result.classifications ?? null,
        expires: result.expires ?? null,
        checked_at: new Date().toISOString(),
      };

      if (result.outcome === "active") {
        // Still good: refresh the timestamp and detail so the next stale
        // check is 30 days out from today, not from the original check.
        await (supabase.from("contractors") as any)
          .update({
            license_verified_at: new Date().toISOString(),
            license_verify_detail: detail,
          })
          .eq("id", row.id);
      } else if (result.outcome === "not_found" || result.outcome === "inactive") {
        // A clean, recognized CSLB response that isn't active: this is the
        // only case allowed to move a contractor OUT of 'verified'. The
        // timestamp is CLEARED, not kept: the public badge on /p/<id> keys
        // off license_verified_at alone, so a stale value here would keep
        // showing "License verified" for a license that just failed.
        await (supabase.from("contractors") as any)
          .update({
            license_verified_status: "failed",
            license_verified_at: null,
            license_verify_detail: detail,
          })
          .eq("id", row.id);
        downgraded += 1;
      } else {
        // 'error': CSLB unreachable, timed out, or unparsable. Leave the row
        // exactly as-is; this is not evidence of anything.
        errored += 1;
      }
    } catch (err) {
      // Should already be caught inside lookupCslbLicense, but guard the
      // loop anyway so one unexpected throw can't stop the rest of the batch.
      errored += 1;
      console.error(
        "license-recheck cron: unexpected error for contractor",
        row.id,
        err instanceof Error ? err.message : err
      );
    }

    if (i < due.length - 1) {
      await sleep(BETWEEN_REQUESTS_MS);
    }
  }

  return NextResponse.json({ checked, downgraded, errored });
}

export async function POST(req: NextRequest) {
  return runCron(req);
}

export async function GET(req: NextRequest) {
  return runCron(req);
}
