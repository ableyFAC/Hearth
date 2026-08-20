import { createAdminClient } from "@/lib/supabase/admin";
import { sendNotification } from "@/lib/notify";
import { isMissingSchemaError } from "@/lib/dbErrors";
import { launchCityForZip } from "@/lib/serviceArea";
import { redactContact } from "@/lib/redact";
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
  // Property's ZIP, for the launch-city filter (0124). Same null-safe rule as
  // the state above: a ZIP that is not in one of the launch cities, or a pro
  // whose launch_cities the database hasn't got yet, never hides anyone.
  property_zip?: string | null;
  // Fan-out-cannon gate (migration 0093): when false, every pro still gets
  // the in-app notification row below, but email/SMS are held back by
  // simply not handing sendNotification any contact details - its own
  // "no email/phone, nothing to send" guards do the rest, so this file
  // never needs to know Resend/Twilio's specifics. Required, not optional:
  // an implicit default here previously fell open (any caller that forgot
  // to pass it got full email/SMS), so every call site must now name its
  // choice explicitly.
  externalChannels: boolean;
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
    const externalChannels = lead.externalChannels;

    // COLD START: the same null-safe state predicate the JS filter below
    // applies, computed once up front so it can be pushed into the query
    // itself instead of pulling every category match nationwide just to
    // throw most of them away in JS.
    const propState =
      COLD_START_FREE_ALERTS
        ? (lead.property_state ?? "").trim().toUpperCase()
        : "";
    // Only a clean two-letter code is safe to splice into the raw .or()
    // filter string below (same reasoning as the category regex check
    // above: unvalidated text landing in PostgREST filter grammar can break
    // or redefine the filter). service_state itself is only ever written as
    // NULL or /^[A-Z]{2}$/ (see pro/actions.ts), so this also guarantees an
    // exact-match .eq behaves identically to the JS comparison it stands in
    // for. Anything else (property.state wasn't a clean code) just skips the
    // server-side narrowing - the unchanged JS filter below still runs on
    // the full category-matched set, so behavior stays identical either way.
    const propStateForQuery = /^[A-Z]{2}$/.test(propState) ? propState : "";

    // Pros whose services cover this job. Null categories means "takes
    // anything", matching how open_jobs_for_me() treats them. service_state is
    // fetched for the cold-start locality check, but the column ships in
    // migration 0046 and may not exist on this database yet: on the
    // missing-column fingerprint, retry without it and treat every pro's state
    // as unknown (which, per the null-safe rule, includes them all).
    // isMissingSchemaError, not a hand-rolled regex: PostgREST reports a
    // missing SELECT column as PGRST204 "schema cache" just as often as it
    // reports 42703, and the old code-42703-or-literal-name pattern here
    // missed that, silently swallowing the whole query (and every alert with
    // it) on a live DB without 0046 instead of falling back cleanly.
    // Which launch city this job actually sits in (0124), or null when the ZIP
    // is in none of them - null means "don't filter", exactly like an unknown
    // state above.
    const leadCity = launchCityForZip(lead.property_zip ?? "");

    type ContractorRow = {
      user_id: string | null;
      contact_phone?: string | null;
      service_state?: string | null;
      launch_cities?: string[] | null;
    };
    let contractors: ContractorRow[] = [];
    {
      let query = (admin as any)
        .from("contractors")
        .select("user_id, contact_phone, service_state, launch_cities")
        .not("user_id", "is", null)
        .or(`categories.is.null,categories.cs.{${lead.category}}`);
      // Server-side version of the COLD_START state filter below (the
      // membership path applies no state filter, same as before, so this
      // only ever runs alongside COLD_START_FREE_ALERTS). Only narrows the
      // result set - the unchanged JS filter further down still re-checks
      // every row, so this can only ever be a superset-safe prefilter, never
      // a source of a different outcome.
      if (propStateForQuery) {
        query = query.or(
          `service_state.is.null,service_state.eq.${propStateForQuery}`
        );
      }
      const res = await query.limit(1000);
      if (res.error) {
        if (!isMissingSchemaError(res.error)) throw res.error;
        // Retry without service_state OR launch_cities: either column may not
        // exist yet (pre-0046 / pre-0124 database), so neither selecting them
        // nor filtering on them is safe here. Every pro's state and city pick
        // is then treated as unknown, which the null-safe rules below already
        // include rather than exclude.
        const retry = await admin
          .from("contractors")
          .select("user_id, contact_phone")
          .not("user_id", "is", null)
          .or(`categories.is.null,categories.cs.{${lead.category}}`)
          .limit(1000);
        if (retry.error) throw retry.error;
        contractors = (retry.data ?? []) as ContractorRow[];
      } else {
        contractors = (res.data ?? []) as ContractorRow[];
      }
    }

    // SMS goes to the number the pro actually gave us: contractor onboarding
    // writes contractors.contact_phone and never touches users.phone, so
    // reading only users.phone below would mean no pro ever gets a text.
    // users.phone stays as the fallback for anyone who has one.
    const contactPhoneByUser = new Map<string, string>();
    for (const c of contractors) {
      if (c.user_id && c.contact_phone && !contactPhoneByUser.has(c.user_id)) {
        contactPhoneByUser.set(c.user_id, c.contact_phone);
      }
    }

    // COLD START: state-level locality, mirroring 0046's null-safe rules in
    // code: a pro is excluded ONLY when both the pro's service_state and the
    // property's state exist and differ. Missing data never hides anyone.
    // (The membership path keeps its original behavior: no state filter.)
    if (COLD_START_FREE_ALERTS) {
      contractors = contractors.filter((c) => {
        const svcState = (c.service_state ?? "").trim().toUpperCase();
        return !svcState || !propState || svcState === propState;
      });
    }

    // Launch-city locality (0124), mirroring in code the gate
    // open_jobs_for_me() and apply_to_lead() apply in SQL: don't text a pro
    // about a job they cannot see on the board or apply to. Applied on both
    // the cold-start and membership paths, because an alert for an
    // unappliable job is pure noise either way.
    //
    // Deliberately PERMISSIVE where the SQL gate is strict, exactly like the
    // state filter above: a pro is excluded ONLY when the job's ZIP resolves
    // to a launch city AND the row actually carries a launch_cities array that
    // omits it. A null/missing column (pre-0124 database, or the retry path
    // that dropped the column) or a ZIP that maps to no launch city excludes
    // nobody. This is a best-effort notifier, so the failure mode has to be an
    // extra alert, never a silently missed one.
    if (leadCity) {
      contractors = contractors.filter((c) => {
        const cities = c.launch_cities;
        if (!Array.isArray(cities)) return true;
        return cities.includes(leadCity);
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
      .select("id, email, phone, sms_consent")
      .in("id", targetIds);
    const userById = new Map((users ?? []).map((u) => [u.id, u]));

    const categoryLabel = labelFor(JOB_CATEGORIES, lead.category);
    const timingLabel = lead.timing
      ? labelFor(TIMING_OPTIONS, lead.timing)
      : null;
    // Belt-and-suspenders: postJobAction already stores a redacted
    // description, but redact again here so this snippet is scrubbed of
    // contact info even if a future caller passes an unredacted description.
    const description = redactContact((lead.issue_description ?? "").trim());
    const snippet =
      description.length > 120 ? `${description.slice(0, 117)}...` : description;
    // Honest urgency: homeowners overwhelmingly go with the first pro to
    // respond, and this instant alert is the whole point of racing them there,
    // so the body says so plainly instead of staying silent about why speed
    // matters. (No hard percentage: we don't have a sourced figure.)
    const urgencyLine = "Heads up: the first pro to reply usually wins the job.";
    const body =
      ([
        timingLabel ? `Timing: ${timingLabel}.` : null,
        snippet ? `"${snippet}"` : null,
      ]
        .filter(Boolean)
        .join(" ") || "A homeowner just posted a job that matches your services.") +
      ` ${urgencyLine}`;

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
            // Withholding email/phone (rather than skipping the call) is what
            // keeps the in-app row firing even when externalChannels is
            // false - sendNotification always writes it, and only reaches
            // for email/SMS when it actually has contact details to use.
            email: externalChannels ? contact?.email ?? null : null,
            phone: externalChannels
              ? contactPhoneByUser.get(userId) ?? contact?.phone ?? null
              : null,
            smsConsent: externalChannels && contact?.sms_consent === true,
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
