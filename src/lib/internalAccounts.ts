import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/dbErrors";

// Read side of the internal / test-account flag (migration 0165, Landen
// request E4). The write side is a service-role SQL one-liner, documented in
// docs/INTERNAL-ACCOUNTS.md and in the migration's trailing comment - there is
// deliberately no app-side setter, because an account that could set or clear
// its own flag would defeat the whole feature.
//
// THE RULE these helpers exist to enforce: INTERNAL SEES INTERNAL, REAL SEES
// ONLY REAL. The database does most of the work - open_jobs_for_me,
// my_direct_requests, browse_pros, public_pro_profile, contractor_reviews and
// the "contractors read" policy all carry the predicate as of 0165, so every
// SESSION-client read is already filtered. This file exists for the handful of
// surfaces that read through the ADMIN client, which is service_role and so
// bypasses RLS and never sees those policies: the sitemap, the new-lead
// notification fan-out, and the direct-request creation path. Each of those
// calls one of these helpers and filters explicitly.
//
// ADMIN CLIENT, deliberately. Neither column is readable by `authenticated`
// or `anon`: contractors.is_internal is excluded from 0069's column-scoped
// SELECT grant, and users has no path to another account's row at all. A
// session-client read would come back empty and this would silently answer
// "not internal" for everyone.
//
// MISSING-SCHEMA TOLERANT, and NEVER THROWS. Until 0165 is pasted to the live
// database the column does not exist, and every caller here is a best-effort
// filter on a page that must still render. A missing column, a DB blip, a
// thrown client - all of them answer `false`, which is exactly today's
// behaviour (nobody is internal, nothing is filtered). Failing closed instead
// would hide real pros from real homeowners the moment the database hiccuped,
// which is a far worse failure than a test account briefly showing through.
//
// CACHED PER REQUEST with React cache(), the same way src/lib/contractor.ts
// caches getContractorLookup: these are called once per surface but several
// surfaces run in the same render, and the answer cannot change mid-request.

// Is this auth user an OakTend team / test account?
//
// A null/empty id answers false without a query: an anonymous visitor is never
// internal, which is what keeps the public pro pages and the sitemap showing
// real pros only.
export const isInternalUser = cache(
  async (userId: string | null | undefined): Promise<boolean> => {
    if (!userId) return false;
    try {
      const admin = createAdminClient();
      const { data, error } = await (admin.from("users") as any)
        .select("is_internal")
        .eq("id", userId)
        .maybeSingle();
      if (error) {
        // 0165 not applied yet is the expected case and is not worth a log
        // line on every request; anything else is worth knowing about.
        if (!isMissingSchemaError(error)) {
          console.error("isInternalUser: read failed", error.message ?? error);
        }
        return false;
      }
      return Boolean(data?.is_internal);
    } catch (e) {
      console.error("isInternalUser: threw", e);
      return false;
    }
  }
);

// Which of these auth users are internal? One query for the whole batch.
//
// The per-id helper above is React-cached and fine for one or two lookups, but
// the new-lead nudge paths hand it up to 50 ids at once and 50 sequential
// admin round trips inside a homeowner's job post is not acceptable latency.
// Returns a Set, so the caller's filter is a membership test.
//
// Same never-throws, missing-schema-tolerant posture as the helpers above: any
// failure answers an EMPTY set, i.e. "nobody is internal", which is exactly
// the pre-0165 behaviour and keeps a notification fan-out working rather than
// silently dropping every recipient.
export async function internalUserIdsAmong(
  userIds: readonly string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return new Set();
  try {
    const admin = createAdminClient();
    const { data, error } = await (admin.from("users") as any)
      .select("id")
      .in("id", ids)
      .eq("is_internal", true);
    if (error) {
      if (!isMissingSchemaError(error)) {
        console.error(
          "internalUserIdsAmong: read failed",
          error.message ?? error
        );
      }
      return new Set();
    }
    return new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  } catch (e) {
    console.error("internalUserIdsAmong: threw", e);
    return new Set();
  }
}

// Is this contractors row an OakTend team / test pro?
//
// contractors.is_internal follows the owning user (the two triggers 0165 Part
// 4 installs), so this and isInternalUser agree for any pro who has a user_id.
// It is a separate lookup rather than a join because the call sites that need
// it have a contractor id in hand and not a user id.
export const isInternalContractor = cache(
  async (contractorId: string | null | undefined): Promise<boolean> => {
    if (!contractorId) return false;
    try {
      const admin = createAdminClient();
      const { data, error } = await (admin.from("contractors") as any)
        .select("is_internal")
        .eq("id", contractorId)
        .maybeSingle();
      if (error) {
        if (!isMissingSchemaError(error)) {
          console.error(
            "isInternalContractor: read failed",
            error.message ?? error
          );
        }
        return false;
      }
      return Boolean(data?.is_internal);
    } catch (e) {
      console.error("isInternalContractor: threw", e);
      return false;
    }
  }
);
