"use client";

import { useEffect, useState } from "react";
import {
  completeReminderAction,
  uncompleteReminderAction,
  deleteReminderAction,
} from "./actions";
import { useChecklist } from "@/components/ChecklistProvider";
import { SYSTEM_TYPES } from "@/lib/constants";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Format a YYYY-MM-DD date string as e.g. "Jul 15" without going through Date
// (avoids timezone off-by-one and the argless-Date restriction).
function formatDue(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const month = MONTHS[Number(m[2]) - 1];
  return month ? `${month} ${Number(m[3])}` : d;
}

// Whole days between today and a YYYY-MM-DD due date (negative = overdue).
// Built from local date parts on both sides so it lines up with formatDue and
// never drifts a day off from time-of-day or timezone.
function daysUntil(d: string): number {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return NaN;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// A friendly due-date chip: overdue (red), due soon (amber), or a plain date
// further out. Purely presentational, computed from data already on hand.
function dueChip(
  due: string | null,
  done: boolean
): { label: string; className: string } | null {
  if (done) {
    return {
      label: "Done",
      className: "border-green-200 bg-green-50 text-green-700",
    };
  }
  if (!due) return null;
  const days = daysUntil(due);
  if (Number.isNaN(days)) {
    return {
      label: formatDue(due),
      className: "border-stone-200 bg-stone-50 text-stone-500",
    };
  }
  if (days < 0) {
    return {
      label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`,
      className: "border-red-200 bg-red-50 text-red-700",
    };
  }
  if (days === 0) {
    return {
      label: "Due today",
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days} day${days === 1 ? "" : "s"}`,
      className: "border-amber-200 bg-amber-50 text-amber-700",
    };
  }
  return {
    label: formatDue(due),
    className: "border-stone-200 bg-stone-50 text-stone-500",
  };
}

// Best-effort icon for a reminder, matched from its title against the system
// list (e.g. "Flush the water heater" -> the water heater icon). Falls back to
// a generic tool icon when nothing matches, purely cosmetic.
function iconForTitle(title: string): string {
  const t = title.toLowerCase();
  for (const s of SYSTEM_TYPES) {
    const key = s.label.toLowerCase();
    if (t.includes(key) || t.includes(s.value.replace(/_/g, " "))) {
      return s.icon;
    }
  }
  return "🛠️";
}

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
  const [removed, setRemoved] = useState(false);
  const checklist = useChecklist();

  useEffect(() => {
    checklist?.register(id, initialDone);
    return () => checklist?.unregister(id);
  }, [id, initialDone, checklist]);

  if (removed) return null;

  async function remove() {
    setBusy(true);
    try {
      await deleteReminderAction(id);
      checklist?.unregister(id);
      setRemoved(true);
    } catch {
      setBusy(false);
    }
  }

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

  const chip = dueChip(due, done);

  return (
    <li className="list-none">
      <div
        className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors ${
          done ? "bg-stone-50/60" : "hover:bg-stone-50"
        }`}
      >
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
              done
                ? "border-green-500 bg-green-500 text-white"
                : "border-stone-300 text-transparent"
            }`}
          >
            ✓
          </span>
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {iconForTitle(title)}
          </span>
          <span
            className={`truncate text-sm ${
              done ? "text-stone-400 line-through" : "text-stone-800"
            }`}
          >
            {title}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {chip && (
            <span
              className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${chip.className}`}
            >
              {chip.label}
            </span>
          )}
          {done && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="text-xs text-stone-400 hover:text-red-600"
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
