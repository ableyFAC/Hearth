"use client";

import { useState } from "react";

// "Leave a review" / "Edit review" button shown on a closed job's row. Opens a
// star + comment form that submits through the saveReviewAction server action
// (which routes to the leave_review RPC). Prefills when a review already exists.
//
// After a fresh submit of 4 or 5 stars, a "Share your pro" follow-up appears
// underneath: word of mouth is how most homeowners find a pro, and the moment
// right after a good review is the highest-intent moment to ask. No reward is
// ever offered here (FTC-clean): just the pro's own public page.
export default function ReviewButton({
  leadId,
  contractorName,
  action,
  existing,
  proProfilePath,
  categoryLabel,
}: {
  leadId: string;
  contractorName: string;
  action: (formData: FormData) => Promise<void>;
  existing?: { rating: number; comment: string | null } | null;
  // The pro's public page PATH (e.g. "/p/<id>"). The full URL is built here
  // on the client from window.location.origin, the same way PublicPageCard
  // does: a server-side env fallback could bake "localhost:3000" into a
  // production share sheet if the env var were ever unset.
  proProfilePath: string;
  categoryLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  // Set on a fresh submit of >= 4 stars; drives the share follow-up below.
  // Component state only, cleared by "Not now": no table, no persistence.
  const [justRatedHigh, setJustRatedHigh] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copied" | "show-link">(
    "idle"
  );

  async function handleShare() {
    const url = `${window.location.origin}${proProfilePath}`;
    const shareData = {
      title: `${contractorName} on Hearth`,
      text: `${contractorName} did great work. Here's their Hearth page:`,
      url,
    };
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        // The user closing the share sheet is a decision, not a failure:
        // do not copy the link behind their back.
        if (err instanceof Error && err.name === "AbortError") return;
        // A real failure falls through to copying the link.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2000);
    } catch {
      // Clipboard unavailable too (permissions, insecure origin): show the
      // link as selectable text so there is always SOME way to grab it.
      setShareState("show-link");
    }
  }

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
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop dark:bg-stone-800">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-100">
              How was {contractorName}?
            </h2>
            <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
              Your rating helps other homeowners pick the right pro.
            </p>

            <form
              action={action}
              onSubmit={() => {
                setOpen(false);
                if (rating >= 4) setJustRatedHigh(true);
              }}
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
                      (hover || rating) >= n ? "text-amber-400" : "text-stone-300 dark:text-stone-600"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>

              <textarea
                name="comment"
                rows={3}
                maxLength={600}
                defaultValue={existing?.comment ?? ""}
                placeholder="Anything to add? (optional, up to 600 characters)"
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

      {justRatedHigh && (
        <div className="mt-2 w-full basis-full rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-white/10 dark:bg-stone-700">
          <p className="text-sm text-stone-700 dark:text-stone-300">
            Know a neighbor who needs a good {categoryLabel.toLowerCase()} pro?
            Share {contractorName}.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="btn-primary text-sm"
            >
              {shareState === "copied" ? "Link copied" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => setJustRatedHigh(false)}
              className="btn-secondary text-sm"
            >
              Not now
            </button>
          </div>
          {shareState === "show-link" && (
            <p className="mt-2 select-all break-all text-xs text-stone-500 dark:text-stone-400">
              {typeof window !== "undefined"
                ? `${window.location.origin}${proProfilePath}`
                : proProfilePath}
            </p>
          )}
        </div>
      )}
    </>
  );
}
