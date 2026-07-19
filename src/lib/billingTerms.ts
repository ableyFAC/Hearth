import { PLUS_PLAN, PRO_PLAN } from "@/lib/constants";

// The ONE place the auto-renewal disclosure language lives, for both paid
// memberships. Five surfaces have to say the same thing about a recurring
// charge, and the law cares that they agree:
//
//   1. Pre-checkout, next to the button that starts the charge
//      (src/components/AutoRenewalTerms.tsx, rendered by both plan toggles).
//   2. The consent record stashed in Stripe Checkout session metadata by the
//      two checkout actions, so what the buyer agreed to is retrievable later.
//   3. The post-purchase acknowledgment on the welcome screens.
//   4. The acknowledgment notification the Stripe webhook sends, which is the
//      copy the buyer can actually keep.
//   5. The renewal-reminder cron (src/app/api/cron/renewal-reminders).
//
// Everything here is derived from PLUS_PLAN / PRO_PLAN, so a price edit in
// src/lib/constants.ts moves the disclosure with it and the two can't drift
// into quoting different numbers.
//
// Why this exists at all: an intro price that steps up to a higher recurring
// price is the exact pattern the FTC (ROSCA, 15 U.S.C. 8403) and the
// California Automatic Renewal Law (Bus. & Prof. Code 17600 et seq.) police.
// Both require the recurring terms up front, express consent, a retainable
// acknowledgment describing how to cancel, and a cancellation path at least
// as easy as signing up was.

export type PaidPlan = "monthly" | "yearly" | "pro_monthly" | "pro_yearly";

export type BillingTerms = {
  // "Hearth Plus", "Hearth Pro" - the thing being bought.
  product: string;
  // What is charged right now, at checkout.
  chargedToday: string;
  // The recurring commitment: amount, interval, and that it repeats until
  // canceled. This is the sentence the law is really about.
  recurring: string;
  // Present only when the first period costs less than every period after it
  // (free month, intro month). Spells out the step-up in dollars.
  stepUp: string | null;
  // How to cancel, in the same medium the purchase happened in.
  cancel: string;
  // Where that cancel control lives, for links.
  cancelPath: string;
};

function money(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

// Terms for a specific plan. `introEligible` must mirror the exact signal the
// checkout action uses to grant the intro offer (no existing subscription row
// on that side), so a returning subscriber is never shown step-up copy for a
// discount they will not receive.
export function billingTerms(
  plan: PaidPlan,
  introEligible: boolean
): BillingTerms {
  const pro = plan === "pro_monthly" || plan === "pro_yearly";
  const yearly = plan === "yearly" || plan === "pro_yearly";
  const product = pro ? "Hearth Pro" : "Hearth Plus";
  const cancelPath = pro ? "/pro/plus" : "/plus";
  const cancel = `Cancel anytime online at ${cancelPath} using the "Cancel membership" button. Cancelling takes effect at the end of the period you have already paid for, and there is nothing to call or email.`;

  if (yearly) {
    const price = money(pro ? PRO_PLAN.yearly : PLUS_PLAN.yearly);
    return {
      product,
      chargedToday: `${price} today.`,
      recurring: `After that, ${price} is automatically charged to the same payment method every 12 months until you cancel.`,
      stepUp: null,
      cancel,
      cancelPath,
    };
  }

  const full = money(pro ? PRO_PLAN.monthly : PLUS_PLAN.monthly);

  // Hearth Pro's intro month is a one-time coupon: money moves today, just
  // less of it. Hearth Plus's is a 30-day Stripe trial: nothing is charged
  // today at all. Both step up, and both have to say by how much.
  if (introEligible && pro) {
    const intro = money(PRO_PLAN.introFirstMonth);
    return {
      product,
      chargedToday: `${intro} today for your first month.`,
      recurring: `After that first month, the price goes up to ${full} and ${full} is automatically charged to the same payment method every month until you cancel.`,
      stepUp: `Your first month is ${intro}. Every month after that is ${full}.`,
      cancel,
      cancelPath,
    };
  }

  if (introEligible) {
    return {
      product,
      chargedToday: `Nothing today. Your first ${PLUS_PLAN.trialDays} days are free.`,
      recurring: `When the free month ends, ${full} is automatically charged to your payment method, and ${full} every month after that until you cancel.`,
      stepUp: `Your first month is free. Every month after that is ${full}.`,
      cancel,
      cancelPath,
    };
  }

  return {
    product,
    chargedToday: `${full} today.`,
    recurring: `After that, ${full} is automatically charged to the same payment method every month until you cancel.`,
    stepUp: null,
    cancel,
    cancelPath,
  };
}

// The disclosure flattened to one plain-text block. Used where there is no
// markup to work with: the consent record written into Stripe metadata, and
// the acknowledgment notification sent after purchase.
export function billingTermsText(
  plan: PaidPlan,
  introEligible: boolean
): string {
  const t = billingTerms(plan, introEligible);
  return [
    `${t.product} renews automatically.`,
    t.chargedToday,
    t.recurring,
    t.cancel,
  ].join(" ");
}
