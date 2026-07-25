"use client";

import { useState } from "react";
import { startPlusCheckoutAction } from "./actions";
import AutoRenewalTerms from "@/components/AutoRenewalTerms";
import SubmitButton from "@/components/SubmitButton";
import { PLUS_PLAN } from "@/lib/constants";

type Plan = "monthly" | "yearly";

// Yearly reframed as a monthly cost and its saving vs paying monthly, so the
// sticker price ($39.99) doesn't have to do all the work on its own. Compared
// against monthly x 12 ($59.88), never an invented list price.
const YEARLY_PER_MONTH = (PLUS_PLAN.yearly / 12).toFixed(2);
const YEARLY_SAVING = Math.round(PLUS_PLAN.monthly * 12 - PLUS_PLAN.yearly);

const PLAN_COPY: Record<
  Plan,
  { label: string; price: string; unit: string; billed: string }
> = {
  monthly: {
    label: "Monthly",
    price: `$${PLUS_PLAN.monthly}`,
    unit: "/month",
    billed: "billed every month",
  },
  yearly: {
    label: "Yearly",
    price: `$${PLUS_PLAN.yearly}`,
    unit: "/year",
    billed: "billed once a year",
  },
};

// Two plan cards: monthly and yearly. Weekly was retired as a new-checkout
// option (existing weekly subscribers keep their plan), so it's no longer
// offered here. Yearly is selected by default since it's the plan worth
// recommending, and it carries the "about $3.33/mo, save vs monthly" framing.
//
// `trialEligible` mirrors the exact signal startPlusCheckoutAction uses to
// grant the 3-day trial (no existing homeowner subscription row), and applies
// the same way to both cadences.
export default function PlanToggle({
  trialEligible = true,
}: {
  trialEligible?: boolean;
}) {
  const [plan, setPlan] = useState<Plan>("yearly");
  const copy = PLAN_COPY[plan];

  return (
    <div id="pricing" className="card-hero space-y-4 text-center">
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(PLAN_COPY) as Plan[]).map((key) => {
          const selected = plan === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPlan(key)}
              aria-pressed={selected}
              className={`relative rounded-xl border p-4 text-center transition-colors ${
                selected
                  ? "border-bark-600 bg-bark-50 dark:border-bark-600 dark:bg-bark-700/30"
                  : "border-stone-200 bg-white hover:border-stone-300 dark:border-white/10 dark:bg-stone-900 dark:hover:border-white/20"
              }`}
            >
              {key === "yearly" && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-bark-600 px-2 py-0.5 text-[10px] font-medium text-white">
                  Best value
                </span>
              )}
              <span className="block text-sm font-medium text-stone-700 dark:text-stone-300">
                {PLAN_COPY[key].label}
              </span>
              <span className="block text-xl font-semibold text-stone-900 dark:text-stone-100">
                {PLAN_COPY[key].price}
                <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                  {PLAN_COPY[key].unit}
                </span>
              </span>
              {key === "yearly" && (
                <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
                  about ${YEARLY_PER_MONTH}/mo, save ${YEARLY_SAVING} a year
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-0.5">
        {trialEligible && (
          <p className="text-sm font-medium text-bark-700 dark:text-stone-300">
            Free for 3 days
          </p>
        )}
        <p className="text-4xl font-semibold text-stone-900 dark:text-stone-100">
          {copy.price}
          <span className="text-base font-normal text-stone-500 dark:text-stone-400">
            {copy.unit}
          </span>
        </p>
        {plan === "yearly" && (
          <p className="text-xs text-stone-500 dark:text-stone-400">
            about ${YEARLY_PER_MONTH}/month, save ${YEARLY_SAVING} vs monthly
          </p>
        )}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {trialEligible
            ? `Free for 3 days, then ${copy.price}${copy.unit}, ${copy.billed} until you cancel.`
            : `${copy.price}${copy.unit}, ${copy.billed} until you cancel.`}
        </p>
      </div>

      {/* The recurring terms sit INSIDE the checkout form, immediately above
          the button that starts the charge, so the disclosure and the act of
          consent are in visual proximity (see AutoRenewalTerms). Both plans
          carry the same 3-day trial, so introEligible mirrors trialEligible
          directly instead of being plan-specific. */}
      <form action={startPlusCheckoutAction} className="space-y-3">
        <input type="hidden" name="plan" value={plan} />
        <AutoRenewalTerms plan={plan} introEligible={trialEligible} />
        <SubmitButton className="btn-primary w-full" pendingLabel="Starting checkout…">
          {trialEligible ? "Start my 3 days free" : "Subscribe"}
        </SubmitButton>
        {/* Restates the cancellation right at the point of consent. The
            button label is the affirmative act; this line makes clear what is
            being agreed to. */}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          {trialEligible
            ? "Cancel anytime. No charge if you cancel in the first 3 days."
            : "Cancel anytime."}
        </p>
      </form>
    </div>
  );
}
