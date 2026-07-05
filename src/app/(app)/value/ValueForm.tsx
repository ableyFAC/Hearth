"use client";

import { useState } from "react";
import { saveHomeValueAction } from "./actions";

export default function ValueForm({
  purchasePrice,
  purchaseYear,
  mortgageBalance,
  currentYear,
  startOpen,
}: {
  purchasePrice: number | null;
  purchaseYear: number | null;
  mortgageBalance: number | null;
  currentYear: number;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const hasData = purchasePrice != null && purchaseYear != null;

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
        const result = await saveHomeValueAction(fd);
        if (!result?.ok) return;
        if (!hasData) return;
        setOpen(false);
      }}
      className="card space-y-4"
    >
      <h3 className="font-semibold text-stone-900">
        {hasData ? "Update your numbers" : "Tell us about your purchase"}
      </h3>
      {!hasData && (
        <p className="text-sm text-stone-500">
          Just two numbers to get started. We will estimate the rest.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">What you paid</label>
          <input
            name="purchase_price"
            type="number"
            min="1"
            step="1000"
            className="input"
            placeholder="350000"
            defaultValue={purchasePrice ?? ""}
            required
          />
        </div>
        <div>
          <label className="label">Year you bought it</label>
          <input
            name="purchase_year"
            type="number"
            min="1900"
            max={currentYear}
            className="input"
            placeholder={String(currentYear)}
            defaultValue={purchaseYear ?? ""}
            required
          />
        </div>
        <div>
          <label className="label">Mortgage balance (optional)</label>
          <input
            name="mortgage_balance"
            type="number"
            min="0"
            step="1000"
            className="input"
            placeholder="0 if paid off"
            defaultValue={mortgageBalance ?? ""}
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
