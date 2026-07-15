"use client";

import { useState } from "react";
import { closeJobAction } from "./actions";

const REASONS = [
  "Found a pro elsewhere",
  "No longer need the work",
  "Posted by mistake",
  "Taking too long",
  "Other",
];

// Close (cancel) a job posting. Clicking "Close job" opens a small panel that
// asks for a reason before confirming. Only shown for jobs no pro has applied
// to yet. The panel expands downward, so nothing shifts horizontally.
export default function CloseJobButton({ leadId }: { leadId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");

  if (!confirming) {
    return (
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-xs text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
        >
          Close job
        </button>
      </div>
    );
  }

  return (
    <form action={closeJobAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="lead_id" value={leadId} />
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="select w-auto text-sm"
      >
        <option value="">
          Reason (optional)
        </option>
        {REASONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
      {reason === "Other" ? (
        <>
          <input
            value={other}
            onChange={(e) => setOther(e.target.value)}
            placeholder="Add a message (optional)"
            className="input w-56 text-sm"
          />
          {/* Optional: fall back to "Other" when they leave it blank. */}
          <input type="hidden" name="reason" value={other.trim() || "Other"} />
        </>
      ) : (
        <input type="hidden" name="reason" value={reason} />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="btn-secondary text-sm"
        >
          Cancel
        </button>
        <button type="submit" className="btn-primary text-sm">
          Confirm close
        </button>
      </div>
    </form>
  );
}
