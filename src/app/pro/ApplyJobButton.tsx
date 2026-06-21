"use client";

import { useState } from "react";
import { applyToJobAction } from "./actions";

// Apply to an open job. Applying charges the per-category fee from the wallet,
// so it always takes an explicit confirmation first (and lets the pro add a note
// to the homeowner). If the wallet can't cover the fee, it points to billing.
export default function ApplyJobButton({
  leadId,
  fee,
  canAfford,
}: {
  leadId: string;
  fee: string;
  canAfford: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  if (!canAfford) {
    return (
      <a href="/pro/billing" className="btn-primary text-sm">
        Add funds to apply ({fee})
      </a>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="btn-primary text-sm"
      >
        Apply · {fee}
      </button>
    );
  }

  return (
    <form
      action={applyToJobAction}
      className="space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3"
    >
      <input type="hidden" name="id" value={leadId} />
      <textarea
        name="message"
        rows={2}
        className="textarea w-full text-sm"
        placeholder="Add a note to the homeowner (optional)"
      />
      <p className="text-xs text-stone-500">
        Applying charges the {fee} lead fee from your wallet. This can&apos;t be
        undone.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="btn-secondary text-sm"
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary flex-1 text-sm">
          Confirm and pay {fee}
        </button>
      </div>
    </form>
  );
}
