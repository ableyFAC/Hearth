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
  billingHref = "/pro/billing",
}: {
  leadId: string;
  fee: string;
  canAfford: boolean;
  // Billing link carrying job context (?need=&category=) so the deposit page
  // can say what the funds are for and preselect an amount that covers it.
  billingHref?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  // Ask the drafter route for a first-pass apply message and drop it into the
  // textarea, still fully editable. Errors show inline and never block typing
  // a message by hand.
  async function draftForMe() {
    setDrafting(true);
    setDraftError(null);
    try {
      const resp = await fetch("/api/draft-apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      if (resp.status === 401) {
        setDraftError("Please sign in and try again.");
        return;
      }
      const data = await resp.json().catch(() => ({}));
      if (data?.message) {
        setMessage(data.message as string);
      } else if (data?.reason === "rate_limited") {
        setDraftError(
          "Hearth has hit today's free usage limit. Please try again later."
        );
      } else if (data?.reason === "no_key") {
        setDraftError("The drafter isn't set up yet.");
      } else {
        setDraftError(
          data?.error || "Couldn't draft a message. Try writing your own."
        );
      }
    } catch {
      setDraftError("Something went wrong. Please try again.");
    } finally {
      setDrafting(false);
    }
  }

  if (!canAfford) {
    return (
      <a href={billingHref} className="btn-primary text-sm">
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
        rows={3}
        className="textarea w-full text-sm"
        placeholder="Add a note to the homeowner (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={draftForMe}
          disabled={drafting}
          className="text-xs font-medium text-hearth-700 hover:underline disabled:opacity-50"
        >
          {drafting ? "Drafting..." : "✨ Draft it for me"}
        </button>
        {draftError && (
          <span className="text-xs text-red-600">{draftError}</span>
        )}
      </div>
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
