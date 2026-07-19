"use client";

import { useState } from "react";
import { startPlusCheckoutAction } from "./actions";
import AutoRenewalTerms from "@/components/AutoRenewalTerms";
import { PLUS_PLAN } from "@/lib/constants";

type Plan = "weekly" | "monthly" | "yearly";

// Yearly reframed as a weekly and monthly cost, so the sticker price ($39.99)
// doesn't have to do all the work on its own.
const YEARLY_PER_WEEK = (PLUS_PLAN.yearly / 52).toFixed(2);
const YEARLY_PER_MONTH = (PLUS_PLAN.yearly / 12).toFixed(2);

const PLAN_COPY: Record<
  Plan,
  { label: string; price: string; unit: string; billed: string }
> = {
  weekly: {
    label: "Weekly",
    price: `$${PLUS_PLAN.weekly}`,
    unit: "/week",
    billed: "billed every week",
  },
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

// Three plan cards, replacing the old monthly/yearly toggle now that Plus
// also has a weekly option. Yearly is picked by default since it's the plan
// worth recommending; weekly is priced and selectable but kept visually
// small, since it's the cheap-looking anchor next to the other two, not the
// plan we're steering anyone toward.
//
// `trialEligible` mirrors the exact signal startPlusCheckoutAction uses to
// grant the 3-day trial (no existing homeowner subscription row), and now
// applies the same way to all three cadences.
export default function PlanToggle({
  trialEligible = true,
}: {
  trialEligible?: boolean;
}) {
  const [plan, setPlan] = useState<Plan>("yearly");
  const copy = PLAN_COPY[plan];

  return (
    <div id="pricing" className="card-hero space-y-4 text-center">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(PLAN_COPY) as Plan[]).map((key) => {
          const selected = plan === key;
          const isWeekly = key === "weekly";
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPlan(key)}
              aria-pressed={selected}
              className={`relative rounded-xl border p-3 text-center transition-colors ${
                selected
                  ? "border-hearth-600 bg-hearth-50 dark:border-hearth-500 dark:bg-hearth-900/30"
                  : "border-stone-200 bg-white hover:border-stone-300 dark:border-white/10 dark:bg-stone-900 dark:hover:border-white/20"
              }`}
            >
              {key === "yearly" && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-hearth-600 px-2 py-0.5 text-[10px] font-medium text-white">
                  Best value
                </span>
              )}
              <span
                className={`block font-medium ${
                  isWeekly
                    ? "text-xs text-stone-500 dark:text-stone-400"
                    : "text-sm text-stone-700 dark:text-stone-300"
                }`}
              >
                {PLAN_COPY[key].label}
              </span>
              <span
                className={
                  isWeekly
                    ? "block text-base font-medium text-stone-500 dark:text-stone-400"
                    : "block text-xl font-semibold text-stone-900 dark:text-stone-100"
                }
              >
                {PLAN_COPY[key].price}
                <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
                  {PLAN_COPY[key].unit}
                </span>
              </span>
              {key === "yearly" && (
                <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
                  about ${YEARLY_PER_WEEK}/week
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-0.5">
        {trialEligible && (
          <p className="text-sm font-medium text-hearth-700 dark:text-hearth-300">
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
            about ${YEARLY_PER_WEEK}/week, or ${YEARLY_PER_MONTH}/month
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
          consent are in visual proximity (see AutoRenewalTerms). Every plan
          now carries the same 3-day trial, so introEligible mirrors
          trialEligible directly instead of being plan-specific. */}
      <form action={startPlusCheckoutAction} className="space-y-3">
        <input type="hidden" name="plan" value={plan} />
        <AutoRenewalTerms plan={plan} introEligible={trialEligible} />
        <button className="btn-primary w-full">
          {trialEligible ? "Start my 3 days free" : "Subscribe"}
        </button>
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
