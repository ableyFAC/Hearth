"use client";

import { useId, useState } from "react";
import type { PlaybookGuideData } from "./guides";

// One expandable playbook card, mirroring the homeowner LearnGuide chrome:
// title + summary always visible, and once opened each section is its own
// tappable row so a pro can skim titles and only read what they need.
export default function PlaybookGuide({ guide }: { guide: PlaybookGuideData }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  // The first section starts open so an expanded card is never a wall of
  // closed rows.
  const [openSection, setOpenSection] = useState(0);

  return (
    <li className="card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-2 text-left font-medium text-stone-900"
      >
        <span>
          {guide.icon} {guide.title}
        </span>
        <span
          className={`shrink-0 text-lg text-stone-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        >
          ⌄
        </span>
      </button>

      <p className="mt-1 text-sm text-stone-500">{guide.summary}</p>

      <div
        id={panelId}
        role="region"
        aria-hidden={!open}
        className={`grid transition-all duration-200 ease-out ${
          open ? "mt-3 grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">
          <ul className="divide-y divide-stone-100">
            {guide.sections.map((s, i) => {
              const active = openSection === i;
              return (
                <li key={s.title}>
                  <button
                    type="button"
                    onClick={() => setOpenSection(active ? -1 : i)}
                    tabIndex={open ? 0 : -1}
                    aria-expanded={active}
                    className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm font-medium text-stone-700 hover:text-hearth-700"
                  >
                    {s.title}
                    <span
                      className={`shrink-0 text-stone-500 transition-transform duration-200 ${
                        active ? "rotate-180" : ""
                      }`}
                      aria-hidden="true"
                    >
                      ⌄
                    </span>
                  </button>
                  {active && (
                    <div className="space-y-2 pb-3 text-sm text-stone-600">
                      {s.body.map((p, j) =>
                        s.quote && j === s.quote ? (
                          <p
                            key={j}
                            className="rounded-lg border border-stone-200 bg-stone-50 p-3 italic text-stone-600"
                          >
                            {p}
                          </p>
                        ) : (
                          <p key={j}>{p}</p>
                        )
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </li>
  );
}
