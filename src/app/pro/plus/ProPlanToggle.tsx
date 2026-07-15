"use client";

import { useState } from "react";
import { startProCheckoutAction } from "./actions";
import { PRO_PLAN } from "@/lib/constants";

const PLANS = {
  monthly: { label: "Monthly", price: "$9.99 first mo" },
  yearly: { label: "Yearly", price: "$19.99/mo" },
} as const;

// Monthly / yearly toggle for the Pro pricing card. Monthly starts with a
// $9.99 intro month (a one-time coupon at checkout), then $29.99/mo; yearly
// is $249, shown against the honest anchor of 12 months at the monthly rate
// (never an invented list price). Charged amounts live in the checkout
// action; PRO_PLAN keeps display and billing in sync.
export default function ProPlanToggle() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");

  return (
    <div id="pricing" className="card-hero space-y-4 text-center">
      <div className="mx-auto inline-flex rounded-full border border-stone-200 bg-stone-50 p-1 dark:border-white/10 dark:bg-stone-800">
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
                Save $120
              </span>
            )}
          </button>
        ))}
      </div>

      {plan === "monthly" ? (
        <div className="space-y-0.5">
          {/* The intro deal IS the headline: full price struck through, the
              $9.99 first month front and center, so the discount is
              impossible to miss. Both numbers are real: $29.99 is what month
              two actually costs. */}
          <p className="text-sm font-medium text-hearth-700 dark:text-hearth-300">
            First month deal
          </p>
          <p className="text-4xl font-semibold text-stone-900 dark:text-stone-100">
            <span className="mr-2 align-middle text-2xl font-normal text-stone-500 line-through dark:text-stone-400">
              ${PRO_PLAN.monthly}
            </span>
            ${PRO_PLAN.introFirstMonth}
            <span className="text-base font-normal text-stone-500 dark:text-stone-400">
              {" "}
              your first month
            </span>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            then ${PRO_PLAN.monthly}/mo. Cancel anytime.
          </p>
        </div>
      ) : (
        <div className="space-y-0.5">
          {/* Honest anchor: the struck-through number is the plan's real
              monthly price. Yearly genuinely works out to $19.99/mo, never
              an invented list price. */}
          <p className="text-sm font-medium text-hearth-700 dark:text-hearth-300">Yearly deal</p>
          <p className="text-4xl font-semibold text-stone-900 dark:text-stone-100">
            <span className="mr-2 align-middle text-2xl font-normal text-stone-500 line-through dark:text-stone-400">
              ${PRO_PLAN.monthly}
            </span>
            ${(PRO_PLAN.yearly / 12).toFixed(2)}
            <span className="text-base font-normal text-stone-500 dark:text-stone-400">/mo</span>
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            billed yearly at ${PRO_PLAN.yearly}. Save $
            {Math.round(PRO_PLAN.monthly * 12 - PRO_PLAN.yearly)} vs paying
            monthly.
          </p>
        </div>
      )}

      <form action={startProCheckoutAction} className="space-y-2">
        <input type="hidden" name="plan" value={plan} />
        <button className="btn-primary w-full">
          {plan === "monthly"
            ? `Start for $${PRO_PLAN.introFirstMonth}`
            : "Get a year of Pro"}
        </button>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Cancel anytime. Your lead access never changes either way.
        </p>
      </form>
    </div>
  );
}
