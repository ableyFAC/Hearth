"use client";

import { useState } from "react";
import { BUDGET_RANGES, isMajorCategory } from "@/lib/constants";
import { useDraftJob } from "./DraftJobContext";

// Budget select for the post-a-job form. Optional (and defaults to "Prefer
// not to say") for most categories, but REQUIRED for major-tier ones (roof,
// structural, remodeling - migration 0114): those jobs are expensive enough
// that a pro can't bid seriously without a range, so the silent no-answer
// default goes away right when it matters most. Reacts live to the category
// picked in CategoryFilter via the shared draft-job context - switching INTO
// or OUT OF a major category flips the requirement without a page reload.
// postJobAction enforces the same rule server-side; this is the UX half.
export default function BudgetField({
  category,
  defaultValue,
}: {
  // Server-rendered initial category (searchParams.category), used only if
  // this ever renders without the draft-job context around it - mirrors
  // CategoryFilter's own fallback.
  category: string;
  defaultValue: string;
}) {
  const ctx = useDraftJob();
  const value = ctx ? ctx.category : category;
  const isMajor = isMajorCategory(value);
  // Controlled so a category flip can never silently re-point the selection:
  // an uncontrolled select whose "" option vanishes (major hides "Prefer not
  // to say") would snap to the first budget bracket without the user noticing.
  const [budget, setBudget] = useState(defaultValue);

  return (
    <div>
      <label className="label" htmlFor="job-budget">
        Rough budget{isMajor ? "" : " (optional)"}
      </label>
      <select
        name="budget_range"
        id="job-budget"
        className="select"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
        required={isMajor}
      >
        {isMajor ? (
          // No "Prefer not to say" for a major-tier job. While nothing valid
          // is selected, a disabled placeholder holds the empty value so
          // `required` actually blocks submit until a real range is picked -
          // same pattern CategoryFilter uses for "Choose what you need".
          budget === "" && (
            <option value="" disabled>
              Choose a budget range
            </option>
          )
        ) : (
          <option value="">Prefer not to say</option>
        )}
        {BUDGET_RANGES.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
        {isMajor
          ? "Pros need a budget range to bid seriously on projects this size."
          : "Helps pros give realistic quotes. Not a commitment."}
      </p>
    </div>
  );
}
