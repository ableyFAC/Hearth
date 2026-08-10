"use client";

import { isMajorCategory } from "@/lib/constants";
import { useDraftJob } from "./DraftJobContext";

// Extra project-scope fields for major-tier categories (roof, structural,
// remodeling - LEAD_TIER_FEES.major). Pros bidding on a big-ticket job need
// more than a one-line description to quote seriously (migration 0114). All
// three are optional (postJobAction never rejects a post over them, only
// clamps/caps what's given), unlike the budget requirement in BudgetField.
// Renders nothing at all for every other category, so a non-major post is
// byte-for-byte the form it was before this component existed.
export default function ProjectScopeFields({
  category,
}: {
  // Server-rendered initial category (searchParams.category), used only if
  // this ever renders without the draft-job context around it - mirrors
  // CategoryFilter's own fallback.
  category: string;
}) {
  const ctx = useDraftJob();
  const value = ctx ? ctx.category : category;
  if (!isMajorCategory(value)) return null;

  return (
    <div className="space-y-3 rounded-lg border border-dashed border-stone-300 p-3 dark:border-stone-700">
      <div>
        <p className="text-sm font-medium text-stone-900 dark:text-stone-100">
          Project scope
        </p>
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Jobs this size get sharper bids with a few more details. All
          optional.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="job-square-footage">
            Square footage (optional)
          </label>
          <input
            name="square_footage"
            id="job-square-footage"
            type="number"
            inputMode="numeric"
            min={1}
            max={20000}
            className="input"
            placeholder="e.g. 1800"
          />
        </div>
        <div>
          <label className="label" htmlFor="job-material-notes">
            Materials (optional)
          </label>
          <input
            name="material_notes"
            id="job-material-notes"
            type="text"
            className="input"
            placeholder="e.g. asphalt shingle, quartz counters"
            maxLength={300}
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
        <input
          type="checkbox"
          name="has_plans_permits"
          className="h-4 w-4 shrink-0 rounded border-stone-300 text-bark-600 focus:ring-bark-600 dark:border-white/20"
        />
        I have plans or permits already
      </label>
    </div>
  );
}
