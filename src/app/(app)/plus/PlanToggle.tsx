"use client";

import { useState } from "react";
import { startPlusCheckoutAction } from "./actions";
import AutoRenewalTerms from "@/components/AutoRenewalTerms";
import { PLUS_PLAN } from "@/lib/constants";

const PLANS = {
  monthly: { label: "Monthly", price: `$${PLUS_PLAN.monthly}/mo` },
  yearly: { label: "Yearly", price: `$${PLUS_PLAN.yearly}/yr` },
} as const;

// Monthly / yearly toggle for the Plus pricing card. Monthly gives the first
// month free then $4.99/mo; yearly is $39.99 (about $3.33/mo, a real 33% off,
// so it clearly beats paying monthly). Charged amounts live in the checkout
// action, these are display only.
//
// `trialEligible` mirrors the exact signal startPlusCheckoutAction uses to grant
// the free month (no existing homeowner subscription row). Only eligible users
// see the "first month free" language; a returning subscriber sees the honest
// price and a plain Subscribe button, since they will be charged right away.
export default function PlanToggle({
  trialEligible = true,
}: {
  trialEligible?: boolean;
}) {
  // Default to monthly for trial-eligible users, since that's where the free
  // month applies; everyone else starts on yearly, the better deal.
  const [plan, setPlan] = useState<"monthly" | "yearly">(
    trialEligible ? "monthly" : "yearly"
  );

  return (
    <div id="pricing" className="card-hero space-y-4 text-center">
      <div className="mx-auto inline-flex rounded-full border border-stone-200 bg-stone-50 p-1 dark:border-white/10 dark:bg-stone-900">
        {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPlan(key)}
            aria-pressed={plan === key}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              plan === key
                ? "bg-hearth-600 text-white shadow-sm"
                : "text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200"
            }`}
          >
            <span className="block leading-tight">{PLANS[key].label}</span>
            <span
              className={`block text-[10px] font-normal leading-tight ${
                plan === key ? "text-hearth-100" : "text-stone-500 dark:text-stone-400"
              }`}
            >
              {PLANS[key].price}
            </span>
            {key === "yearly" && (
              <span className="absolute -top-3 right-0 rounded-full bg-hearth-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Save 33%
              </span>
            )}
          </button>
        ))}
      </div>

      {plan === "monthly" ? (
        <div className="space-y-0.5">
          {trialEligible && (
            <p className="text-sm font-medium text-hearth-700 dark:text-hearth-300">
              First month free
            </p>
          )}
          <p className="text-4xl font-semibold text-stone-900 dark:text-stone-100">
            ${PLUS_PLAN.monthly}
            <span className="text-base font-normal text-stone-500 dark:text-stone-400">/mo</span>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {trialEligible
              ? `after your free ${PLUS_PLAN.trialDays} days, then every month until you cancel.`
              : "billed monthly until you cancel."}
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          <p className="text-4xl font-semibold text-stone-900 dark:text-stone-100">
            ${PLUS_PLAN.yearly}
            <span className="text-base font-normal text-stone-500 dark:text-stone-400">/yr</span>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            about ${(PLUS_PLAN.yearly / 12).toFixed(2)}/mo, save 33% vs
            monthly, billed yearly until you cancel
          </p>
        </div>
      )}

      {/* The recurring terms sit INSIDE the checkout form, immediately above
          the button that starts the charge, so the disclosure and the act of
          consent are in visual proximity (see AutoRenewalTerms). The yearly
          plan never carries the free month, so introEligible is monthly-only
          and mirrors the signal startPlusCheckoutAction actually uses. */}
      <form action={startPlusCheckoutAction} className="space-y-3">
        <input type="hidden" name="plan" value={plan} />
        <AutoRenewalTerms
          plan={plan}
          introEligible={plan === "monthly" && trialEligible}
        />
        <button className="btn-primary w-full">
          {plan === "monthly"
            ? trialEligible
              ? "Start my free month"
              : "Subscribe to monthly"
            : "Get a year of Plus"}
        </button>
        {/* Restates the cancellation right at the point of consent. The
            button label is the affirmative act; this line makes clear what is
            being agreed to. */}
        <p className="text-xs text-stone-500 dark:text-stone-400">
          By continuing you agree to the automatic renewal terms above. Cancel
          anytime. No commitment.
        </p>
      </form>
    </div>
  );
}
