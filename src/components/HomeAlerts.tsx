"use client";

import { useEffect, useState } from "react";

type Alert = {
  kind: "freeze" | "heat" | "recall";
  title: string;
  detail: string;
  url?: string;
};

const ICON: Record<Alert["kind"], string> = {
  freeze: "🥶",
  heat: "🥵",
  recall: "🚨",
};

// Proactive, time- and home-specific alerts (weather + safety recalls) fetched
// client-side so the dashboard render isn't blocked by external APIs. Renders
// NOTHING unless there's a real alert - kept deliberately compact so it never
// clutters the dashboard.
export default function HomeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/home-alerts")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const all = [...(d.weather ?? []), ...(d.recalls ?? [])];
        setAlerts(all);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (alerts.length === 0) return null;

  // Keep the dashboard tight: show the three most pressing (weather comes first
  // from the API), tuck the rest behind a toggle.
  const shown = expanded ? alerts : alerts.slice(0, 3);

  return (
    <section className="space-y-2">
      <ul className="space-y-2">
        {shown.map((a, i) => (
          <li
            key={i}
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              a.kind === "recall"
                ? "border-red-200 bg-red-50"
                : a.kind === "freeze"
                  ? "border-sky-200 bg-sky-50"
                  : "border-amber-200 bg-amber-50"
            }`}
          >
            <span className="shrink-0">{ICON[a.kind]}</span>
            <div>
              <p className="font-medium text-stone-900">{a.title}</p>
              <p className="mt-0.5 text-stone-600">{a.detail}</p>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block font-medium text-hearth-700 hover:underline"
                >
                  View the official notice →
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {alerts.length > 3 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-stone-500 hover:text-stone-700"
        >
          Show {alerts.length - 3} more
        </button>
      )}
    </section>
  );
}
