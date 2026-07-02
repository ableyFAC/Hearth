"use client";

import SubmitButton from "@/components/SubmitButton";
import { saveNotificationPrefsAction } from "./actions";
import { NOTIFICATION_CHANNELS } from "./channels";

// A row of toggles for each notification channel. New homeowners default to
// everything on, so an unset preference reads as enabled.
export default function NotificationPrefsForm({
  prefs,
}: {
  prefs: { [key: string]: boolean } | null;
}) {
  const isOn = (key: string) => prefs?.[key] ?? true;

  return (
    <form
      action={saveNotificationPrefsAction}
      className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <div className="divide-y divide-stone-100">
        {NOTIFICATION_CHANNELS.map((c) => (
          <label
            key={c.key}
            className="flex cursor-pointer items-start justify-between gap-4 py-4 first:pt-0"
          >
            <span>
              <span className="block text-sm font-medium text-stone-900">
                {c.label}
              </span>
              <span className="block text-sm text-stone-500">{c.desc}</span>
            </span>
            <input
              type="checkbox"
              name={c.key}
              defaultChecked={isOn(c.key)}
              className="mt-1 h-5 w-5 shrink-0 rounded border-stone-300 text-hearth-600 focus:ring-hearth-500"
            />
          </label>
        ))}
      </div>

      <div className="mt-5">
        <SubmitButton>Save preferences</SubmitButton>
      </div>
    </form>
  );
}
