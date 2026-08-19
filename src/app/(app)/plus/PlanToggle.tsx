"use client";

import { useState } from "react";
import { startPlusCheckoutAction } from "./actions";
import AutoRenewalTerms from "@/components/AutoRenewalTerms";
import SubmitButton from "@/components/SubmitButton";
import {
  PLUS_PLAN,
  COLD_START_FREE_POSTING,
  formatUsd,
  yearlyAsMonthly,
  yearlyPerDay,
  yearlyRunRate,
  yearlySavings,
} from "@/lib/constants";

type Plan = "monthly" | "yearly";

// Every figure below is computed from PLUS_PLAN, never typed in. The saving is
// twelve charges at the real monthly price minus the yearly price - the only
// honest anchor - and the per-day line is the yearly price over 365 days,
// rounded UP to the cent so it never quotes less than the plan costs.
const YEARLY_PER_MONTH = formatUsd(yearlyAsMonthly(PLUS_PLAN)); // about $3.33
const YEARLY_PER_DAY = formatUsd(yearlyPerDay(PLUS_PLAN)); // about $0.11
const MONTHLY_YEAR_TOTAL = formatUsd(yearlyRunRate(PLUS_PLAN)); // $59.88
const YEARLY_SAVING = formatUsd(yearlySavings(PLUS_PLAN)); // $19.89

// What a free account really gets, stated as capabilities rather than as an
// absence. Free is a real plan here, not a strawman column: these lines match
// what the app actually allows (one home, one plan build, one quote check,
// in-app alerts) and the caps line names the limits in the same breath.
const FREE_INCLUDES = [
  "One home tracked: systems, documents, reminders",
  "Your first maintenance plan build",
  "Your 10-year cost total and monthly set-aside",
  "One quote check",
  COLD_START_FREE_POSTING
    ? "Post jobs to local pros, unlimited while Hearth is new"
    : "Up to 3 open job postings",
  "Every alert, in the app",
];

const PLAN_COPY: Record<
  Plan,
  { label: string; price: string; unit: string; billed: string }
> = {
  monthly: {
    label: "Monthly",
    price: formatUsd(PLUS_PLAN.monthly),
    unit: "/month",
    billed: "billed every month",
  },
  yearly: {
    label: "Yearly",
    price: formatUsd(PLUS_PLAN.yearly),
    unit: "/year",
    billed: "billed once a year",
  },
};

// Three real reference points, in one row: Free, Yearly, Monthly. No invented
// tier - Free is a plan people actually run on, and Monthly is the full price
// the yearly plan is measured against. Yearly sits in the middle as the hero
// and is preselected, because it is the one worth recommending.
//
// Weekly was retired as a new-checkout option (existing weekly subscribers
// keep their plan), so it is not offered here.
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

  // Shared shell for the two selectable columns. The hero keeps its elevated
  // look whether or not it is the current selection; the ring is what tracks
  // selection, so "recommended" and "chosen" stay readable as separate facts.
  const columnClass = (key: Plan) =>
    [
      "flex h-full flex-col rounded-xl border p-4 text-left transition-colors",
      plan === key
        ? "border-bark-600 ring-2 ring-bark-600 ring-offset-1 ring-offset-hearth-50 dark:ring-offset-stone-900"
        : "border-stone-200 hover:border-stone-300 dark:border-white/10 dark:hover:border-white/20",
      key === "yearly"
        ? "bg-bark-50 shadow-lift dark:bg-bark-700/30"
        : "bg-white dark:bg-stone-800",
    ].join(" ");

  return (
    <div id="pricing" className="space-y-4">
      {/* One row, three columns from sm up. On a phone they stack with the
          yearly hero first (order-1), then Free, then Monthly, so the plan
          worth recommending is the one a thumb reaches first. */}
      <div className="grid items-stretch gap-3 sm:grid-cols-3">
        {/* --- Free: a real column, with its real caps --- */}
        <div className="order-2 flex h-full flex-col rounded-xl border border-stone-200 bg-white p-4 text-left sm:order-1 dark:border-white/10 dark:bg-stone-800">
          <p className="text-sm font-medium text-stone-700 dark:text-stone-300">
            Free
          </p>
          <p className="mt-0.5 text-2xl font-semibold text-stone-900 dark:text-stone-100">
            $0
          </p>
          <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
            Yours forever, no card.
          </p>
          <ul className="mt-3 space-y-1.5">
            {FREE_INCLUDES.map((f) => (
              <li
                key={f}
                className="flex items-start gap-1.5 text-xs text-stone-600 dark:text-stone-300"
              >
                <span className="mt-px font-bold text-green-600" aria-hidden>
                  ✓
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-auto pt-3 text-[11px] text-stone-500 dark:text-stone-400">
            Caps: one home, one plan build, one quote check, 25 Ask Hearth
            questions a day. No cost forecast breakdown, quote analyzer, or home
            report.
          </p>
        </div>

        {/* --- Yearly: the hero, preselected --- */}
        <button
          type="button"
          onClick={() => setPlan("yearly")}
          aria-pressed={plan === "yearly"}
          className={`relative order-1 sm:order-2 ${columnClass("yearly")}`}
        >
          <span className="absolute -top-2.5 left-4 whitespace-nowrap rounded-full bg-bark-600 px-2 py-0.5 text-[10px] font-medium text-white">
            Best value
          </span>
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {PLAN_COPY.yearly.label}
          </span>
          <span className="mt-0.5 block text-2xl font-semibold text-stone-900 dark:text-stone-100">
            {PLAN_COPY.yearly.price}
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
              {PLAN_COPY.yearly.unit}
            </span>
          </span>
          {/* Honest arithmetic, not a discount claim: the yearly price divided
              by 365, rounded up to the cent. */}
          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
            About {YEARLY_PER_DAY} a day
          </span>
          <span className="mt-2 block text-xs font-medium text-bark-700 dark:text-stone-200">
            Save {YEARLY_SAVING} vs monthly
          </span>
          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
            About {YEARLY_PER_MONTH} a month, billed once a year.
          </span>
          <span className="mt-auto pt-3 text-[11px] text-stone-500 dark:text-stone-400">
            Everything in Free, plus the full cost forecast, the quote analyzer,
            your home report, up to 5 homes, and every alert on every channel.
          </span>
        </button>

        {/* --- Monthly: the full-price reference --- */}
        <button
          type="button"
          onClick={() => setPlan("monthly")}
          aria-pressed={plan === "monthly"}
          className={`order-3 ${columnClass("monthly")}`}
        >
          <span className="text-sm font-medium text-stone-700 dark:text-stone-300">
            {PLAN_COPY.monthly.label}
          </span>
          <span className="mt-0.5 block text-2xl font-semibold text-stone-900 dark:text-stone-100">
            {PLAN_COPY.monthly.price}
            <span className="text-xs font-normal text-stone-500 dark:text-stone-400">
              {PLAN_COPY.monthly.unit}
            </span>
          </span>
          <span className="mt-0.5 block text-[11px] text-stone-500 dark:text-stone-400">
            = {MONTHLY_YEAR_TOTAL} a year
          </span>
          <span className="mt-2 block text-xs text-stone-600 dark:text-stone-300">
            The same Plus, month to month.
          </span>
          {/* The page's one loss-framed line, and the loss is real today: this
              is the actual delta between the two plans on offer, not urgency
              or scarcity. */}
          <span className="mt-auto pt-3 text-[11px] text-stone-500 dark:text-stone-400">
            Monthly pays {YEARLY_SAVING} more for the same year.
          </span>
        </button>
      </div>

      {/* The chosen plan, restated once, then the disclosure and the button. */}
      <div className="card-hero space-y-4 text-center">
        <div className="space-y-0.5">
          {trialEligible && (
            <p className="text-sm font-medium text-bark-700 dark:text-stone-300">
              Free for 3 days
            </p>
          )}
          <p className="text-2xl font-semibold text-stone-900 dark:text-stone-100">
            {copy.price}
            <span className="text-sm font-normal text-stone-500 dark:text-stone-400">
              {copy.unit}
            </span>
          </p>
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
            directly instead of being plan-specific. The hidden field carries
            the selected cadence; startPlusCheckoutAction defaults to yearly,
            the same plan preselected above, so the two can never disagree. */}
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
    </div>
  );
}
