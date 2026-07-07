"use client";

// Small affordance on a won job: opens the win share image
// (src/app/api/win-card/[leadId]/route.tsx) in a new tab, and offers a
// direct download of the same PNG. The route re-checks ownership and win
// state on the server, so this component only ever needs the lead id. It
// renders no homeowner data itself: the card behind these links carries
// none either (business name and logo, category, city and state, real
// rating, Hearth branding only).
export default function WinShareButton({
  leadId,
  businessName,
}: {
  leadId: string;
  businessName: string;
}) {
  const cardUrl = `/api/win-card/${leadId}`;
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "win";

  return (
    <span className="flex shrink-0 items-center gap-2">
      <a
        href={cardUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50"
      >
        Share this win
      </a>
      <a
        href={cardUrl}
        download={`hearth-win-${slug}.png`}
        className="rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 shadow-sm hover:bg-stone-50"
      >
        Download
      </a>
    </span>
  );
}
