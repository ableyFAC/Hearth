// The `subscription_data` block of a Stripe Checkout Session, in one pure
// place so both membership checkouts build it identically and it can be
// tested without touching Stripe.
//
// Two fields, both load-bearing:
//
// - trial_period_days: present ONLY when this signup carries a free trial.
//   Stripe rejects a 0, and an explicit undefined would still serialize, so
//   the key is omitted entirely rather than set to a falsy value. `trialDays`
//   is null for a checkout that charges today.
//
// - metadata.intro_step_up: the durable "the next charge is higher than this
//   one" flag, read by the renewal-reminders cron and by the webhook's
//   abandoned-checkout rollback. It is stamped on the SUBSCRIPTION, not just
//   the session, because a session's metadata is not reachable from a later
//   subscription event.
//
// One-time payments (wallet deposits, lead fees) are mode:"payment" sessions
// and have no subscription_data at all, so nothing here can ever reach them.
export type SubscriptionCheckoutData = {
  trial_period_days?: number;
  metadata: { intro_step_up: string };
};

// The billing cadence a checkout form asked for.
//
// YEARLY IS THE DEFAULT, and that is the whole point of this helper existing.
// Both pricing cards preselect the yearly plan, so a submission whose "plan"
// field is missing or unreadable must land on the plan the buyer was actually
// looking at, not a different one. Only an explicit "monthly" opts out.
//
// Both checkout actions rebuild everything downstream from this single value -
// the Stripe line item, the billingTerms consent record stashed in session
// metadata, and the idempotency key - so whatever the fallback resolves to is
// also what is quoted and what is charged. They cannot disagree.
export type CheckoutCadence = "monthly" | "yearly";

export function checkoutCadence(raw: unknown): CheckoutCadence {
  return raw === "monthly" ? "monthly" : "yearly";
}

export function subscriptionCheckoutData(opts: {
  trialDays: number | null;
  introStepUp: boolean;
}): SubscriptionCheckoutData {
  return {
    ...(opts.trialDays && opts.trialDays > 0
      ? { trial_period_days: opts.trialDays }
      : {}),
    metadata: { intro_step_up: opts.introStepUp ? "true" : "false" },
  };
}
