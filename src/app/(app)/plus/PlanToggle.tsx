"use client";

import { useState } from "react";
import { startPlusCheckoutAction } from "./actions";

const PLANS = {
  monthly: { label: "Monthly" },
  yearly: { label: "Yearly" },
} as const;

// Monthly / yearly toggle for the Plus pricing card. Client-side so switching
// plans doesn't round-trip the server, the checkout form itself still posts
// to the real server action. Monthly shows the new-member intro ($4.99 first
// month, then $8.99); yearly is a flat $58.99. Charged amounts live in the
// checkout action, these are display only.
export default function PlanToggle() {
  const [plan, setPlan] = useState<"monthly" | "yearly">("monthly");

  return (
    <div id="pricing" className="card space-y-4 text-center">
      <div className="mx-auto inline-flex rounded-full border border-stone-200 bg-stone-50 p-1">
        {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPlan(key)}
            className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              plan === key
                ? "bg-white text-stone-900 shadow-sm"
                : "text-stone-500 hover:text-stone-700"
            }`}
          >
            {PLANS[key].label}
            {key === "yearly" && (
              <span className="absolute -top-3 right-0 rounded-full bg-hearth-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                Save ~45%
              </span>
            )}
          </button>
        ))}
      </div>

      {plan === "monthly" ? (
        <div className="space-y-0.5">
          <p className="text-sm text-stone-400 line-through">$8.99/mo</p>
          <p className="text-4xl font-semibold text-stone-900">
            $4.99
            <span className="text-base font-normal text-stone-500">
              {" "}
              first month
            </span>
          </p>
          <p className="text-xs text-stone-500">
            then $8.99/mo. New members only.
          </p>
        </div>
      ) : (
        <p className="text-4xl font-semibold text-stone-900">
          $58.99
          <span className="text-base font-normal text-stone-500">/yr</span>
        </p>
      )}

      <form action={startPlusCheckoutAction} className="space-y-2">
        <input type="hidden" name="plan" value={plan} />
        <button className="btn-primary w-full">
          {plan === "monthly" ? "Start for $4.99" : "Start my Plus plan"}
        </button>
        <p className="text-xs text-stone-400">Cancel anytime. No commitment.</p>
      </form>
    </div>
  );
}
