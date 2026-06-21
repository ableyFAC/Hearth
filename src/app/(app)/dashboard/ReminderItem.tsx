"use client";

import { useEffect, useState } from "react";
import {
  completeReminderAction,
  uncompleteReminderAction,
} from "./actions";
import { useChecklist } from "@/components/ChecklistProvider";

// A reminder row: click the checkbox to cross it out (click again to uncross).
export default function ReminderItem({
  id,
  title,
  due,
  initialDone = false,
}: {
  id: string;
  title: string;
  due: string | null;
  initialDone?: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [busy, setBusy] = useState(false);
  const checklist = useChecklist();

  useEffect(() => {
    checklist?.register(id, initialDone);
    return () => checklist?.unregister(id);
  }, [id, initialDone, checklist]);

  async function toggle() {
    const next = !done;
    setBusy(true);
    try {
      if (next) await completeReminderAction(id);
      else await uncompleteReminderAction(id);
      setDone(next);
      checklist?.report(id, next);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center justify-between gap-3">
      <button
        type="button"
        disabled={busy}
        onClick={toggle}
        className="flex items-center gap-2 text-left"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] ${
            done
              ? "border-green-500 bg-green-500 text-white"
              : "border-stone-300 text-transparent"
          }`}
        >
          ✓
        </span>
        <span className={done ? "text-stone-400 line-through" : "text-stone-800"}>
          {title}
        </span>
      </button>
      {due && <span className="shrink-0 text-xs text-stone-400">{due}</span>}
    </li>
  );
}
