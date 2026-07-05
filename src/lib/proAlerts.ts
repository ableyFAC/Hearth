import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import {
  labelFor,
  JOB_CATEGORIES,
  TIMING_OPTIONS,
  COLD_START_FREE_ALERTS,
} from "@/lib/constants";

// Hearth Pro perk: instant new-job alerts. When a homeowner posts a job, every
// contractor whose categories cover it AND who holds a live Pro membership gets
// pinged right away through sendNotification (in-app now, email/SMS too once
// the provider env vars are set). Free pros lose nothing: the job board and
// its realtime updates are untouched; members just don't have to watch it.
//
// COLD START: while COLD_START_FREE_ALERTS is on, the membership filter is
// skipped and EVERY category-matched contractor is alerted (state-matched
// where both sides have a state, mirroring 0046's null-safe locality rules).
// Flip the constant to restore members-only alerts; the membership path below
// stays intact behind it.
//
// Everything here is best-effort: any failure (missing table, migration lag,
// no matches) is logged and swallowed. Alerting must never break or slow the
// homeowner's posting flow.

// Sanity cap on the fan-out so one posting can't queue an unbounded pile of
// notification writes inside a server action.
const MAX_ALERTS = 200;

// How many sendNotification calls run at once. Chunked so a big fan-out
// doesn't turn into 200 sequential round-trips inside the posting action.
const ALERT_BATCH_SIZE = 20;

export type NewLeadAlertInput = {
  category: string;
  timing?: string | null;
  issue_description?: string | null;
  // Property's two-letter state, for the cold-start path's null-safe locality
  // check. Missing data never hides a pro (0046's rule).
  property_state?: string | null;
};

// Returns the user ids that were alerted (empty on any failure), so the caller
// can skip them in its own non-member nudge and nobody gets pinged twice.
export async function alertProsForNewLead(
  lead: NewLeadAlertInput
): Promise<Set<string>> {
  const alerted = new Set<string>();
  try {
    // The category lands inside a PostgREST .or() filter below, so only plain
    // slugs (every JOB_CATEGORIES value is one) may pass. Anything else would
    // corrupt the filter grammar, and no contractor lists it anyway.
    if (!/^[a-z0-9_-]+$/i.test(lead.category)) return alerted;

    const admin = createAdminClient();

    // Pros whose services cover this job. Null categories means "takes
    // anything", matching how open_jobs_for_me() treats them. service_state is
    // fetched for the cold-start locality check, but the column ships in
    // migration 0046 and may not exist on this database yet: on the
    // missing-column fingerprint, retry without it and treat every pro's state
    // as unknown (which, per the null-safe rule, includes them all).
    type ContractorRow = { user_id: string | null; service_state?: string | null };
    let contractors: ContractorRow[] = [];
    {
      const res = await (admin as any)
        .from("contractors")
        .select("user_id, service_state")
        .not("user_id", "is", null)
        .or(`categories.is.null,categories.cs.{${lead.category}}`)
        .limit(1000);
      if (res.error) {
        const missingColumn =
          res.error.code === "42703" ||
          /service_state|column .* does not exist/i.test(res.error.message ?? "");
        if (!missingColumn) throw res.error;
        const retry = await admin
          .from("contractors")
          .select("user_id")
          .not("user_id", "is", null)
          .or(`categories.is.null,categories.cs.{${lead.category}}`)
          .limit(1000);
        if (retry.error) throw retry.error;
        contractors = (retry.data ?? []) as ContractorRow[];
      } else {
        contractors = (res.data ?? []) as ContractorRow[];
      }
    }

    // COLD START: state-level locality, mirroring 0046's null-safe rules in
    // code: a pro is excluded ONLY when both the pro's service_state and the
    // property's state exist and differ. Missing data never hides anyone.
    // (The membership path keeps its original behavior: no state filter.)
    if (COLD_START_FREE_ALERTS) {
      const propState = (lead.property_state ?? "").trim().toUpperCase();
      contractors = contractors.filter((c) => {
        const svcState = (c.service_state ?? "").trim().toUpperCase();
        return !svcState || !propState || svcState === propState;
      });
    }

    const candidateIds = Array.from(
      new Set(
        contractors
          .map((c) => c.user_id)
          .filter((id): id is string => Boolean(id))
      )
    );
    if (candidateIds.length === 0) return alerted;

    let targetIds: string[];
    if (COLD_START_FREE_ALERTS) {
      // COLD START: every category-matched (and state-compatible) pro gets the
      // alert, member or not, still under the fan-out sanity cap.
      targetIds = candidateIds.slice(0, MAX_ALERTS);
    } else {
      // Live Pro memberships among the candidates. Same liveness rules as
      // hasProPlan(): a pro_ plan, active or trialing, and not past a known
      // period end. The like() is only a coarse server-side prefilter (in SQL
      // LIKE the underscore is a single-character wildcard), so the real
      // startsWith check and the date check happen in code below.
      const { data: subs, error: subsError } = await (admin as any)
        .from("subscriptions")
        .select("user_id, plan, status, current_period_end")
        .in("user_id", candidateIds)
        .in("status", ["active", "trialing"])
        .like("plan", "pro_%");
      if (subsError) throw subsError;

      const now = Date.now();
      const memberIds: string[] = [];
      for (const sub of (subs ?? []) as {
        user_id: string;
        plan: string | null;
        current_period_end: string | null;
      }[]) {
        if (!sub.plan?.startsWith("pro_")) continue;
        if (
          sub.current_period_end &&
          new Date(sub.current_period_end).getTime() <= now
        )
          continue;
        if (!memberIds.includes(sub.user_id)) memberIds.push(sub.user_id);
        if (memberIds.length >= MAX_ALERTS) break;
      }
      targetIds = memberIds;
    }
    if (targetIds.length === 0) return alerted;

    // Contact details so the email/SMS channels can fire once their providers
    // are configured. There is no prefs toggle for these alerts today (the
    // notification_prefs keys are homeowner-facing), so recipients get them all.
    const { data: users } = await admin
      .from("users")
      .select("id, email, phone")
      .in("id", targetIds);
    const userById = new Map((users ?? []).map((u) => [u.id, u]));

    const categoryLabel = labelFor(JOB_CATEGORIES, lead.category);
    const timingLabel = lead.timing
      ? labelFor(TIMING_OPTIONS, lead.timing)
      : null;
    const description = (lead.issue_description ?? "").trim();
    const snippet =
      description.length > 120 ? `${description.slice(0, 117)}...` : description;
    const body =
      [
        timingLabel ? `Timing: ${timingLabel}.` : null,
        snippet ? `"${snippet}"` : null,
      ]
        .filter(Boolean)
        .join(" ") || "A homeowner just posted a job that matches your services.";

    for (let i = 0; i < targetIds.length; i += ALERT_BATCH_SIZE) {
      const batch = targetIds.slice(i, i + ALERT_BATCH_SIZE);
      await Promise.all(
        batch.map(async (userId) => {
          const contact = userById.get(userId);
          const sent = await sendNotification(admin, {
            userId,
            kind: "new_lead",
            title: `New ${categoryLabel} job just posted`,
            body,
            url: "/pro",
            email: contact?.email ?? null,
            phone: contact?.phone ?? null,
          });
          if (sent) alerted.add(userId);
        })
      );
    }
  } catch (err) {
    console.error(
      "pro new-lead alerts:",
      err instanceof Error ? err.message : err
    );
  }
  return alerted;
}
