"use client";

import { useState } from "react";
import Lightbox from "@/components/Lightbox";

// Thumbnail strip for a job's homeowner photos. Each thumbnail (and the
// Lightbox it opens) points at /api/job-photo, which signs a short-lived, gated
// URL. In PREVIEW mode (the open board, pre-application) the route serves a
// downscaled, recompressed image; in FULL mode (a pro the homeowner already
// chose) it serves the original. The route enforces the entitlement either way.
const MAX_THUMBS = 4;

function photoSrc(leadId: string, rawUrl: string, full: boolean): string {
  const base = `/api/job-photo?lead=${encodeURIComponent(
    leadId
  )}&path=${encodeURIComponent(rawUrl)}`;
  return full ? `${base}&full=1` : base;
}

export default function JobPhotoStrip({
  leadId,
  urls,
  full = false,
}: {
  leadId: string;
  urls: string[];
  full?: boolean;
}) {
  const [open, setOpen] = useState<string | null>(null);

  const clean = urls.filter((u) => typeof u === "string" && u.length > 0);
  if (clean.length === 0) return null;

  const shown = clean.slice(0, MAX_THUMBS);
  const extra = clean.length - shown.length;

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        {shown.map((u, i) => {
          const src = photoSrc(leadId, u, full);
          const isLast = i === shown.length - 1 && extra > 0;
          return (
            <button
              key={u}
              type="button"
              onClick={() => setOpen(src)}
              className="relative h-16 w-16 overflow-hidden rounded border border-stone-200 dark:border-white/10"
              aria-label="View job photo"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.currentTarget.parentElement as HTMLElement).style.display =
                    "none";
                }}
              />
              {isLast && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-sm font-semibold text-white">
                  +{extra}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {!full && (
        <p className="text-xs text-stone-500 dark:text-stone-400">
          Preview, full photos unlock when you apply.
        </p>
      )}

      <Lightbox
        src={open}
        alt="Job photo"
        caption={full ? "Job photo" : "Preview, full photos unlock when you apply."}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}
