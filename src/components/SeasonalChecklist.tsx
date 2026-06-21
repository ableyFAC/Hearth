"use client";

import { useEffect, useState } from "react";
import { useChecklist } from "@/components/ChecklistProvider";

// Checklist with clickable checkmarks. The task CONTENT is seasonal, but the
// checked state is remembered per `period` (a year-month like "2026-06"), so the
// checkmarks reset on the 1st of each month for a fresh nudge.
export default function SeasonalChecklist({
  period,
  tasks,
}: {
  period: string;
  tasks: string[];
}) {
  const key = `hearth_checklist_${period}`;
  const [done, setDone] = useState<Record<number, boolean>>({});
  const checklist = useChecklist();

  useEffect(() => {
    let loaded: Record<number, boolean> = {};
    try {
      const raw = localStorage.getItem(key);
      if (raw) loaded = JSON.parse(raw);
    } catch {
      /* ignore */
    }
    setDone(loaded);
    tasks.forEach((_, i) => checklist?.register(`${period}-${i}`, !!loaded[i]));
    return () =>
      tasks.forEach((_, i) => checklist?.unregister(`${period}-${i}`));
  }, [key, period, tasks, checklist]);

  function toggle(i: number) {
    setDone((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      checklist?.report(`${period}-${i}`, !!next[i]);
      return next;
    });
  }

  // Renders plain <li> rows (no <ul>/card) so it can share the "This month" list.
  return (
    <>
      {tasks.map((t, i) => (
        <li key={i}>
          <button
            type="button"
            onClick={() => toggle(i)}
            className="flex w-full items-start gap-2 text-left text-sm"
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
                done[i]
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-stone-300 text-transparent"
              }`}
            >
              ✓
            </span>
            <span
              className={done[i] ? "text-stone-400 line-through" : "text-stone-800"}
            >
              {t}
            </span>
          </button>
        </li>
      ))}
    </>
  );
}
