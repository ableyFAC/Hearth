"use client";

import { useState } from "react";
import Link from "next/link";

export type PrepKey = "water_shutoff" | "gas_shutoff" | "breaker_panel";

export type PanicFlow = {
  key: string;
  emoji: string;
  title: string;
  subtitle: string;
  category: string;
  desc: string;
  steps: string[];
  // Which saved prep photo (if any) is relevant to this flow's first step.
  prepKey?: PrepKey;
};

// One panic flow: a big tappable card that expands into short, numbered steps.
// Closed by default so the page reads as five calm choices, not a wall of text.
export default function PanicCard({
  flow,
  prepPhotoSrc,
  prepNote,
}: {
  flow: PanicFlow;
  prepPhotoSrc: string | null;
  prepNote: string | null;
}) {
  const [open, setOpen] = useState(false);

  const ctaHref =
    `/contractors?category=${encodeURIComponent(flow.category)}` +
    `&desc=${encodeURIComponent(flow.desc)}` +
    `&timing=asap`;

  return (
    <div className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <span className="text-2xl" aria-hidden="true">
          {flow.emoji}
        </span>
        <span className="flex-1">
          <span className="block font-semibold text-stone-900">{flow.title}</span>
          <span className="block text-sm text-stone-500">{flow.subtitle}</span>
        </span>
        <span className="text-sm font-medium text-hearth-700">
          {open ? "Hide steps" : "See steps"}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-stone-100 px-5 py-4">
          <ol className="space-y-3">
            {flow.steps.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-hearth-100 text-sm font-semibold text-hearth-800">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="text-stone-800">{step}</p>
                  {i === 0 && prepPhotoSrc && (
                    <div className="mt-2 rounded-md bg-hearth-50 p-2">
                      <p className="mb-1 text-xs font-medium text-hearth-700">
                        Your shutoff is here:
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={prepPhotoSrc}
                        alt="Saved shutoff location"
                        className="h-32 w-full max-w-xs rounded-md object-cover"
                      />
                      {prepNote && (
                        <p className="mt-1 text-xs text-stone-500">{prepNote}</p>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <Link href={ctaHref} className="btn-primary block w-full text-center">
            Get a pro on it
          </Link>
        </div>
      )}
    </div>
  );
}
