"use client";

import { useState } from "react";

// "Leave a review" / "Edit review" button shown on a closed job's row. Opens a
// star + comment form that submits through the saveReviewAction server action
// (which routes to the leave_review RPC). Prefills when a review already exists.
export default function ReviewButton({
  leadId,
  contractorName,
  action,
  existing,
}: {
  leadId: string;
  contractorName: string;
  action: (formData: FormData) => Promise<void>;
  existing?: { rating: number; comment: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-sm"
      >
        {existing ? "Edit review" : "Leave a review"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-stone-900">
              How was {contractorName}?
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              Your rating helps other homeowners pick the right pro.
            </p>

            <form
              action={action}
              onSubmit={() => setOpen(false)}
              className="mt-4 space-y-4"
            >
              <input type="hidden" name="lead_id" value={leadId} />
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
                defaultValue={existing?.comment ?? ""}
                placeholder="Anything to add? (optional)"
                className="input w-full"
              />

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rating === 0}
                  className="btn-primary flex-1 disabled:opacity-50"
                >
                  {existing ? "Update" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
