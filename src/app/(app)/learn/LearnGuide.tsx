"use client";

import { useEffect, useState } from "react";

// An interactive maintenance-basics card: shows the owner's actual system status
// inline, checkable upkeep steps (remembered per system), and buttons that fire
// a question into Ask Hearth (the box at the top of Learn). Personalized + tied
// to the AI - the thing a Google search can't be.
export default function LearnGuide({
  systemType,
  label,
  icon,
  lifespan,
  statusLabel,
  statusStyle,
  age,
  tips,
  askQuestion,
}: {
  systemType: string;
  label: string;
  icon: string;
  lifespan: number | string;
  statusLabel?: string;
  statusStyle?: string;
  age?: number | null;
  tips: string[];
  askQuestion: string;
}) {
  const key = `hearth_guide_${systemType}`;
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setChecked(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [key]);

  function toggle(i: number) {
    setChecked((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function ask(q: string) {
    window.dispatchEvent(new CustomEvent("hearth:ask-question", { detail: q }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <li className="card">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-medium text-stone-900 [&::-webkit-details-marker]:hidden">
          <span className="flex flex-wrap items-center gap-2">
            <span>
              {icon} {label}
            </span>
            {statusLabel && (
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${statusStyle ?? ""}`}
              >
                {statusLabel}
              </span>
            )}
          </span>
          <span className="shrink-0 text-sm text-stone-400">Read more</span>
        </summary>

        <p className="mt-3 text-xs text-stone-400">
          Typical lifespan: {lifespan} years
          {age != null ? ` · yours is about ${age} yrs old` : ""}
        </p>

        <ul className="mt-2 space-y-1.5">
          {tips.map((t, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => toggle(i)}
                className="flex items-start gap-2 text-left text-sm"
              >
                <span
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                    checked[i]
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-stone-300 text-transparent"
                  }`}
                >
                  ✓
                </span>
                <span
                  className={
                    checked[i] ? "text-stone-400 line-through" : "text-stone-600"
                  }
                >
                  {t}
                </span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => ask(askQuestion)}
            className="rounded-lg bg-hearth-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-hearth-700"
          >
            ✨ Ask Hearth about this
          </button>
          <button
            type="button"
            onClick={() =>
              ask(
                `Something seems off with my ${label.toLowerCase()}. Can you help me figure out what's going on and whether I need a pro?`
              )
            }
            className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:border-hearth-400 hover:text-hearth-700"
          >
            Something wrong?
          </button>
        </div>
      </details>
    </li>
  );
}
