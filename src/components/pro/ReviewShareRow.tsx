"use client";

import { useState } from "react";

// One row in the "Share your reviews" list: mirrors WinShareButton's
// open/download pair for the review-card route, plus a copy-paste caption
// button using the same clipboard pattern as PublicPageCard's copyText. The
// caption is fixed and honest - no incentive, no reward, just a thank-you and
// the pro's own public profile link - and review collection itself stays a
// completely separate flow (leave_review / saveReviewAction) that this
// component never touches.
export default function ReviewShareRow({
  reviewId,
  rating,
  comment,
  profileUrl,
}: {
  reviewId: string;
  rating: number;
  comment: string | null;
  profileUrl: string;
}) {
  const [copied, setCopied] = useState(false);
  const cardUrl = `/api/review-card/${reviewId}`;
  const caption = `Thanks for the kind words! Find me on Hearth: ${profileUrl}`;

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions, http). The caption is
      // still visible above for the pro to select by hand.
    }
  }

  return (
    <li className="rounded-lg border border-stone-200 p-3 dark:border-white/10">
      <span className="text-sm text-amber-500">
        {"★".repeat(rating)}
        <span className="text-stone-300 dark:text-stone-600">{"★".repeat(5 - rating)}</span>
      </span>
      {comment && (
        <p className="mt-1 break-words text-sm text-stone-600 dark:text-stone-300">
          {Array.from(comment).length > 160
            ? `${Array.from(comment).slice(0, 160).join("").trimEnd()}…`
            : comment}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          href={cardUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-secondary text-xs px-2.5 py-1"
        >
          Download share card
        </a>
        <button
          type="button"
          onClick={copyCaption}
          className="btn-secondary text-xs px-2.5 py-1"
        >
          {copied ? "Copied!" : "Copy caption"}
        </button>
      </div>
    </li>
  );
}
