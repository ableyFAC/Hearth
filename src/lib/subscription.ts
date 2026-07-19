import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import type { Subscription } from "@/lib/database.types";

// One user can hold TWO subscriptions rows at once (migration 0036): the
// homeowner Hearth Plus side ("monthly"/"yearly") and the contractor Hearth
// Pro side ("pro_monthly"/"pro_yearly"). The pro_ prefix keeps the two
// memberships from satisfying each other's checks.
function isProPlanName(plan: string | null | undefined): boolean {
  return typeof plan === "string" && plan.startsWith("pro_");
}

// Pure liveness predicate for a Pro-side row: a pro_ plan, active or
// trialing, and not past a known period end. Shared with server code that
// reads subscription rows directly (webhook lookups, crons, alerts), so it
// stays dependency-free: no auth, no Supabase, just the row.
export function isLiveProPlanRow(row: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}): boolean {
  if (!isProPlanName(row.plan)) return false;
  if (row.status !== "active" && row.status !== "trialing") return false;
  if (row.current_period_end && new Date(row.current_period_end) <= new Date())
    return false;
  return true;
}

// All of the current user's subscription rows (at most one per side). Written
// only by the Stripe webhook via the service role, so this is a read-only
// view for the app. Cached per request; both side-specific getters below
// share the single query. The side is derived from the plan prefix in code
// so these work the same whether or not migration 0036 has run yet.
const getSubscriptionRows = cache(async (): Promise<Subscription[]> => {
  const user = await getUser();
  if (!user) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id);

  return (data ?? []) as Subscription[];
});

// The current user's homeowner Hearth Plus subscription row (billing status,
// plan, renewal date). Never returns the contractor Pro-side row.
export const getSubscription = cache(
  async (): Promise<Subscription | null> => {
    const rows = await getSubscriptionRows();
    return rows.find((row) => !isProPlanName(row.plan)) ?? null;
  }
);

// The current user's contractor Hearth Pro membership row. Never returns the
// homeowner Plus-side row.
export const getProSubscription = cache(
  async (): Promise<Subscription | null> => {
    const rows = await getSubscriptionRows();
    return rows.find((row) => isProPlanName(row.plan)) ?? null;
  }
);

// Pending billing changes, read live from Stripe (one call) so the UI can't
// drift out of sync. Generic over whichever side's row is passed in:
// - scheduledDowngrade: a yearly subscriber's pending switch to monthly (the
//   subscription schedule created by downgradeToMonthlyAction), with the date
//   the monthly phase starts.
// - cancelsAt: when the membership is set to end (cancel_at_period_end), on
//   either plan, or null if it will keep renewing.
// Wrapped in React's per-request cache(): both /plus and /pro/plus render
// this off the SAME Subscription object (getSubscription/getProSubscription
// are themselves cached above, so repeated calls within one request return
// the identical reference), so cache() correctly collapses any repeat call
// with that same sub into the one live Stripe lookup already in flight/done.
// Nothing about the returned data changes - this only stops the same request
// from hitting Stripe twice for the same row.
export const getBillingOutlook = cache(
  async (
    sub: Subscription | null
  ): Promise<{
    scheduledDowngrade: { switchesAt: Date } | null;
    cancelsAt: Date | null;
  }> => {
    const none = { scheduledDowngrade: null, cancelsAt: null };
    if (!sub?.stripe_subscription_id) return none;

    try {
      const stripeSub = await stripe.subscriptions.retrieve(
        sub.stripe_subscription_id,
        { expand: ["schedule"] }
      );

      let scheduledDowngrade: { switchesAt: Date } | null = null;
      const schedule = stripeSub.schedule;
      if (
        sub.plan === "yearly" &&
        schedule &&
        typeof schedule !== "string" &&
        schedule.phases.length >= 2
      ) {
        const next = schedule.phases[schedule.phases.length - 1];
        scheduledDowngrade = { switchesAt: new Date(next.start_date * 1000) };
      }

      const cancelsAt =
        stripeSub.cancel_at_period_end && sub.current_period_end
          ? new Date(sub.current_period_end)
          : stripeSub.cancel_at
            ? new Date(stripeSub.cancel_at * 1000)
            : null;

      return { scheduledDowngrade, cancelsAt };
    } catch {
      return none;
    }
  }
);

// Shared billing-status check: active or trialing, and not past a known
// period end.
function isLive(sub: Subscription): boolean {
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date())
    return false;
  return true;
}

// Whether the current user has an active Hearth Plus subscription. Gates
// "finding a pro" (posting a job / contacting pros) - the rest of the app
// (home tracking, AI chat, document vault, alerts) stays free. Homeowner
// plans only: getSubscription never returns the Pro-side row, so a
// contractor's pro_ plan never counts as Plus.
export async function hasPlus(): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  return isLive(sub);
}

// Whether the current user has an active Hearth Pro membership (contractor
// side). Unlocks perks only: deposit bonus boost, alerts, back-office tools.
// It NEVER changes which leads a pro can see or apply to.
export async function hasProPlan(): Promise<boolean> {
  const sub = await getProSubscription();
  if (!sub) return false;
  return isLiveProPlanRow(sub);
}

// Whether the current user has already consumed a one-time promo (e.g. the
// Pro intro month). Explicit, lifecycle-independent guard against repeat
// intro-price farming: the promo_claims ledger (migration 0071) is never
// pruned by a subscription cancel, so this holds even if canceled
// subscription rows are ever deleted. Fails CLOSED: a broken lookup returns
// true so a farmer can never turn an outage into a repeat intro. Returns
// false only when the DB positively confirms no claim exists.
export async function hasClaimedPromo(key: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("has_claimed_promo", {
    p_key: key,
  });
  if (error) {
    // fail CLOSED: a broken lookup must never hand out a repeat intro
    console.error("has_claimed_promo failed - denying intro:", error.message ?? error);
    return true;
  }
  return Boolean(data);
}
