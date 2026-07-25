"use client";

import { useState } from "react";
import { SERVICE_CATEGORIES } from "@/lib/constants";

const CANONICAL = new Set<string>(SERVICE_CATEGORIES.map((c) => c.value));

// Per-category line icons (monochrome, turn white when the card is selected).
const CATEGORY_ICON: Record<string, JSX.Element> = {
  roof: <path d="M3 11l9-7 9 7M5 10v9h14v-9" />,
  plumbing: <path d="M12 3s5 5.5 5 9a5 5 0 11-10 0c0-3.5 5-9 5-9z" />,
  electrical: <path d="M13 3L5 13h5l-1 8 8-11h-5l1-7z" />,
  hvac: <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />,
  structural: (
    <path d="M4 21V5l8-2 8 2v16M9 9h.01M9 13h.01M15 9h.01M15 13h.01M10 21v-4h4v4" />
  ),
  remodeling: (
    <path d="M9 12l-5 5 3 3 5-5M12 9l6-6 3 3-6 6M9 12l3-3 3 3-3 3z" />
  ),
  landscaping: (
    <path d="M11 20A7 7 0 014 13c0-5 4-9 9-9 5 0 7 3 7 7a7 7 0 01-9 9zM11 20V10" />
  ),
  cleaning: <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />,
  windows: <path d="M4 4h16v16H4zM12 4v16M4 12h16" />,
  painting: <path d="M4 4h12v5H4zM16 6h3v4h-8v3M10 13h3v8h-3z" />,
  pest: (
    <path d="M12 4v3M9 7h6M8 10h8M12 10v8M8 12H5M19 12h-3M8 15H5.5M18.5 15H16M9 19l-2 2M15 19l2 2" />
  ),
  garage_door: (
    <path d="M4 21V11l8-7 8 7v10M4 21h16M6 15h12M6 18h12" />
  ),
  handyman: (
    <path d="M14.5 3.5a4 4 0 00-5.4 5.4L3 15v4h4l6.1-6.1a4 4 0 005.4-5.4l-2.7 2.7-2-2 2.7-2.7z" />
  ),
  other: <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />,
};

// Selectable service-category cards plus a free-text "Other". Selected canonical
// values and any typed "Other" service are submitted as repeated hidden inputs
// named "categories", which saveCompanyAction reads with getAll. Shared by the
// onboarding and edit-profile forms so they stay identical.
export default function CategoryPicker({
  defaultSelected,
}: {
  defaultSelected: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    new Set(defaultSelected.filter((v) => CANONICAL.has(v)))
  );
  // Anything stored that isn't a canonical value is treated as the custom
  // "Other" service, so it round-trips on edit.
  const [other, setOther] = useState(
    defaultSelected.filter((v) => !CANONICAL.has(v)).join(", ")
  );

  function toggle(value: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const otherActive = other.trim().length > 0;

  return (
    <div className="grid grid-cols-2 gap-3">
      {SERVICE_CATEGORIES.map((c) => {
        const on = selected.has(c.value);
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => toggle(c.value)}
            aria-pressed={on}
            className={`relative flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
              on
                ? "border-bark-500 bg-bark-50 ring-1 ring-bark-500 dark:border-bark-400 dark:bg-bark-900/40 dark:ring-bark-400"
                : "border-stone-200 bg-white hover:bg-stone-50 dark:border-white/10 dark:bg-stone-800 dark:hover:bg-stone-700"
            }`}
          >
            <span
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                on
                  ? "bg-bark-600 text-white"
                  : "bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {CATEGORY_ICON[c.value] ?? CATEGORY_ICON.other}
              </svg>
            </span>
            <span
              className={`text-sm font-medium ${
                on ? "text-bark-700 dark:text-bark-300" : "text-stone-700 dark:text-stone-300"
              }`}
            >
              {c.label}
            </span>
            {on && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-bark-600 dark:text-bark-400">
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              </span>
            )}
          </button>
        );
      })}

      {/* Full-width "Other". Describe a service not listed above. */}
      <div
        className={`col-span-2 flex items-center gap-3 rounded-xl border px-3 py-3 transition-colors ${
          otherActive
            ? "border-bark-500 bg-bark-50 ring-1 ring-bark-500 dark:border-bark-400 dark:bg-bark-900/40 dark:ring-bark-400"
            : "border-stone-200 bg-white dark:border-white/10 dark:bg-stone-800"
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            otherActive
              ? "bg-bark-600 text-white"
              : "bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {CATEGORY_ICON.other}
          </svg>
        </span>
        <span
          className={`text-sm font-medium ${
            otherActive ? "text-bark-700 dark:text-bark-300" : "text-stone-700 dark:text-stone-300"
          }`}
        >
          Other
        </span>
        <input
          type="text"
          value={other}
          onChange={(e) => setOther(e.target.value)}
          placeholder="Describe the service you provide"
          className="min-w-0 flex-1 border-0 bg-transparent text-base text-stone-700 placeholder:text-stone-500 focus:outline-none focus:ring-0 sm:text-sm dark:text-stone-200 dark:placeholder:text-stone-500"
        />
      </div>

      {/* Submit selected categories + any custom "Other" service. */}
      {[...selected].map((v) => (
        <input key={v} type="hidden" name="categories" value={v} />
      ))}
      {otherActive && (
        <input type="hidden" name="categories" value={other.trim()} />
      )}
    </div>
  );
}
