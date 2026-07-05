"use client";

import { useState } from "react";
import { saveInsuranceAction } from "./insurance-actions";

// Collapsible entry form for the "Home insurance" card: the renewal date and
// annual premium off the owner's current policy. Mirrors TaxForm on /taxes.
export default function InsuranceForm({
  renewalDate,
  premium,
  startOpen,
}: {
  renewalDate: string | null;
  premium: number | null;
  startOpen: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const hasData = renewalDate != null && premium != null;

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        Edit insurance details
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        // Only collapse when the server confirms the save stuck. A rejected
        // or soft-failed save still resolves, and closing on that would show
        // the old numbers as if the new ones were saved.
        const result = await saveInsuranceAction(fd);
        if (!result?.ok) return;
        if (!hasData) return;
        setOpen(false);
      }}
      className="card space-y-4"
    >
      <h3 className="font-semibold text-stone-900">
        {hasData ? "Update your policy details" : "Add your policy details"}
      </h3>
      {!hasData && (
        <p className="text-sm text-stone-500">
          Both numbers are on your policy&apos;s declarations page (or the
          renewal letter your insurer mails you). Two numbers and you&apos;re
          done.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">Renewal date</label>
          <input
            name="insurance_renewal_date"
            type="date"
            className="input"
            defaultValue={renewalDate ?? ""}
            required
          />
        </div>
        <div>
          <label className="label">Annual premium</label>
          <input
            name="insurance_premium"
            type="number"
            min="1"
            step="1"
            className="input"
            placeholder="2400"
            defaultValue={premium ?? ""}
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
