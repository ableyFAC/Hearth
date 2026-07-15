"use client";

import { useState } from "react";
import { saveTaxAssessmentAction } from "./actions";

export default function TaxForm({
  assessedValue,
  assessedYear,
  currentYear,
  startOpen,
}: {
  assessedValue: number | null;
  assessedYear: number | null;
  currentYear: number;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const hasData = assessedValue != null && assessedYear != null;

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Edit these numbers
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        // Only collapse when the server confirms the save stuck. A rejected
        // or soft-failed save still resolves, and closing on that would show
        // the old numbers as if the new ones were saved.
        const result = await saveTaxAssessmentAction(fd);
        if (!result?.ok) return;
        if (!hasData) return;
        setOpen(false);
      }}
      className="card space-y-4"
    >
      <h3 className="font-semibold text-stone-900 dark:text-stone-100">
        {hasData ? "Update your assessment" : "Enter your assessment"}
      </h3>
      {!hasData && (
        <p className="text-sm text-stone-500 dark:text-stone-400">
          Look for a line called &quot;assessed value&quot; or &quot;total
          assessed value&quot; on your county&apos;s assessment notice or
          property tax bill, along with the tax year it applies to. Two
          numbers and you&apos;re done.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Assessed value</label>
          {/* step="any": assessed values are never round thousands, and a
              1000 step makes the browser reject real ones outright. */}
          <input
            name="assessed_value"
            type="number"
            min="1"
            step="any"
            className="input"
            placeholder="320000"
            defaultValue={assessedValue ?? ""}
            required
          />
        </div>
        <div>
          <label className="label">Assessment year</label>
          <input
            name="assessed_year"
            type="number"
            min="1990"
            max={currentYear}
            className="input"
            placeholder={String(currentYear)}
            defaultValue={assessedYear ?? ""}
            required
          />
        </div>
      </div>

      <div className="flex gap-3">
        {hasData && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
        )}
        <button className="btn-primary flex-1">Save</button>
      </div>
    </form>
  );
}
