import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import type { Subscription } from "@/lib/database.types";

// The current user's Hearth Plus subscription row (billing status, plan,
// renewal date). Written only by the Stripe webhook via the service role, so
// this is a read-only view for the app. Cached per request.
export const getSubscription = cache(
  async (): Promise<Subscription | null> => {
    const user = await getUser();
    if (!user) return null;

    const supabase = createClient();
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    return data ?? null;
  }
);

// Pending billing changes, read live from Stripe (one call) so the UI can't
// drift out of sync:
// - scheduledDowngrade: a yearly subscriber's pending switch to monthly (the
//   subscription schedule created by downgradeToMonthlyAction), with the date
//   the monthly phase starts.
// - cancelsAt: when the membership is set to end (cancel_at_period_end), on
//   either plan, or null if it will keep renewing.
export async function getBillingOutlook(sub: Subscription | null): Promise<{
  scheduledDowngrade: { switchesAt: Date } | null;
  cancelsAt: Date | null;
}> {
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

// Whether the current user has an active Hearth Plus subscription. Gates
// "finding a pro" (posting a job / contacting pros) - the rest of the app
// (home tracking, AI chat, document vault, alerts) stays free.
export async function hasPlus(): Promise<boolean> {
  const sub = await getSubscription();
  if (!sub) return false;
  if (sub.status !== "active" && sub.status !== "trialing") return false;
  if (sub.current_period_end && new Date(sub.current_period_end) <= new Date())
    return false;
  return true;
}
