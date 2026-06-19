"use client";

import { useState } from "react";

// Little popup that asks the homeowner to rate a pro once the job's chat has
// been closed. Stars + an optional comment; submits via a server action.
export default function ReviewPopup({
  leadId,
  contractorId,
  propertyId,
  contractorName,
  action,
}: {
  leadId: string;
  contractorId: string;
  propertyId: string;
  contractorName: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-stone-900">
          How was {contractorName}?
        </h2>
        <p className="mt-1 text-sm text-stone-500">
          Your job was marked complete. Leave a quick rating to help other
          homeowners.
        </p>

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="lead_id" value={leadId} />
          <input type="hidden" name="contractor_id" value={contractorId} />
          <input type="hidden" name="property_id" value={propertyId} />
          <input type="hidden" name="rating" value={rating} />

          <div className="flex justify-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                className={`text-3xl leading-none transition ${
                  (hover || rating) >= n ? "text-amber-400" : "text-stone-300"
                }`}
              >
                ★
              </button>
            ))}
          </div>

          <textarea
            name="comment"
            rows={3}
            placeholder="Anything to add? (optional)"
            className="input w-full"
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="btn-secondary flex-1"
            >
              Maybe later
            </button>
            <button
              type="submit"
              disabled={rating === 0}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
