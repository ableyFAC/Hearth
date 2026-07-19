"use client";

import { useEffect, useState } from "react";
import {
  completeReminderAction,
  uncompleteReminderAction,
  deleteReminderAction,
} from "./actions";
import { useChecklist } from "@/components/ChecklistProvider";
import { SYSTEM_TYPES } from "@/lib/constants";
import { Wrench, type LucideIcon } from "lucide-react";

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

// A friendly due-date chip: overdue (red), due soon (amber), or a plain date
// further out. Purely presentational. `days` comes from the server (the same
// daysUntil the page uses to group rows under Overdue / Due soon) so the chip
// and its group heading can never disagree, which they did when this file
// recomputed days from the browser's clock while the page grouped by the
// server's.
function dueChip(
  due: string | null,
  done: boolean,
  days: number | null
): { label: string; className: string } | null {
  if (done) {
    return {
      label: "Done",
      className: "border-green-200 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/40 dark:text-green-200",
    };
  }
  if (!due) return null;
  if (days === null || Number.isNaN(days)) {
    return {
      label: formatDue(due),
      className: "border-stone-200 bg-stone-50 text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-400",
    };
  }
  if (days < 0) {
    return {
      label: days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`,
      className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
    };
  }
  if (days === 0) {
    return {
      label: "Due today",
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    };
  }
  if (days <= 7) {
    return {
      label: `Due in ${days} day${days === 1 ? "" : "s"}`,
      className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300",
    };
  }
  return {
    label: formatDue(due),
    className: "border-stone-200 bg-stone-50 text-stone-500 dark:border-white/10 dark:bg-stone-700 dark:text-stone-400",
  };
}

// Best-effort icon for a reminder, matched from its title against the system
// list (e.g. "Flush the water heater" -> the water heater icon). Falls back to
// a generic wrench icon when nothing matches, purely cosmetic.
function iconForTitle(title: string): LucideIcon {
  const t = title.toLowerCase();
  for (const s of SYSTEM_TYPES) {
    const key = s.label.toLowerCase();
    if (t.includes(key) || t.includes(s.value.replace(/_/g, " "))) {
      return s.icon;
    }
  }
  return Wrench;
}

// A reminder row: click the checkbox to cross it out (click again to uncross).
export default function ReminderItem({
  id,
  title,
  due,
  daysLeft = null,
  initialDone = false,
}: {
  id: string;
  title: string;
  due: string | null;
  // Whole days until due, computed by the server page with the same clock it
  // used to group rows, so chip and group heading always agree.
  daysLeft?: number | null;
  initialDone?: boolean;
}) {
  const [done, setDone] = useState(initialDone);
  const [busy, setBusy] = useState(false);
  const [removed, setRemoved] = useState(false);
  // True only right after the toggle turns a reminder on, so the check-pop
  // animation plays for that action and not for items already done on load.
  const [justCompleted, setJustCompleted] = useState(false);
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
      setJustCompleted(next);
      checklist?.report(id, next);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  const chip = dueChip(due, done, daysLeft);

  return (
    <li className="list-none">
      <div
        className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors ${
          done ? "bg-stone-50/60 dark:bg-stone-700/40" : "hover:bg-stone-50 dark:hover:bg-stone-700/40"
        }`}
      >
        <button
          type="button"
          disabled={busy}
          onClick={toggle}
          // The done state is otherwise only conveyed visually (fill +
          // strikethrough), so expose it as a checkbox to assistive tech.
          role="checkbox"
          aria-checked={done}
          aria-label={due ? `${title}, due ${formatDue(due)}` : title}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] ${
              done
                ? "border-green-500 bg-green-500 text-white"
                : "border-stone-300 text-transparent dark:border-stone-600"
            } ${justCompleted ? "motion-safe:animate-check-pop" : ""}`}
          >
            ✓
          </span>
          <span className="shrink-0 text-stone-500 dark:text-stone-400" aria-hidden>
            {(() => {
              const Icon = iconForTitle(title);
              return <Icon className="h-4 w-4" />;
            })()}
          </span>
          <span
            className={`truncate text-sm ${
              done ? "text-stone-500 line-through dark:text-stone-400" : "text-stone-800 dark:text-stone-200"
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
          {/* Rendered whether or not the task is done so an unwanted open
              reminder can be dismissed without marking it complete. */}
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="flex min-h-[44px] items-center px-1 text-xs text-stone-500 hover:text-red-600 dark:text-stone-400 dark:hover:text-red-400"
          >
            Delete
          </button>
        </div>
      </div>
    </li>
  );
}
