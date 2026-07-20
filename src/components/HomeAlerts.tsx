"use client";

import { useEffect, useState } from "react";
import { Snowflake, Thermometer, AlertTriangle, type LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/Skeleton";

type Alert = {
  kind: "freeze" | "heat" | "recall";
  title: string;
  detail: string;
  url?: string;
};

const ICON: Record<Alert["kind"], LucideIcon> = {
  freeze: Snowflake,
  heat: Thermometer,
  recall: AlertTriangle,
};

const ICON_STYLE: Record<Alert["kind"], string> = {
  freeze: "text-amber-600 dark:text-amber-400",
  heat: "text-amber-600 dark:text-amber-400",
  recall: "text-red-600 dark:text-red-400",
};

// Proactive, time- and home-specific alerts (weather + safety recalls) fetched
// client-side so the dashboard render isn't blocked by external APIs. Renders
// NOTHING unless there's a real alert - kept deliberately compact so it never
// clutters the dashboard.
export default function HomeAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  // Once the rest of the page has fully loaded, a still-pending alerts
  // fetch no longer earns a placeholder: the skeleton gives up (renders
  // nothing) and real alerts simply appear if/when they arrive. Keeps a
  // slow nice-to-have widget from being the last skeleton on an otherwise
  // finished page.
  const [pageLoaded, setPageLoaded] = useState(false);

  useEffect(() => {
    if (document.readyState === "complete") {
      setPageLoaded(true);
      return;
    }
    const onLoad = () => setPageLoaded(true);
    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  useEffect(() => {
    let alive = true;
    // Hard 6s cap: the route aggregates slow external APIs (weather,
    // recalls), and without a timeout the skeleton row below can float on
    // the dashboard indefinitely. Alerts are nice-to-have; past 6s we show
    // nothing rather than a stuck placeholder.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);
    fetch("/api/home-alerts", { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const all = [...(d.weather ?? []), ...(d.recalls ?? [])];
        setAlerts(all);
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timeout);
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  // Brief skeleton only while the first fetch is in flight AND the page
  // itself is still settling - most loads resolve to zero alerts, so this
  // must not linger or reserve space once we know there's nothing to show,
  // and it must never be the last skeleton standing on a loaded page.
  if (loading && !pageLoaded) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-stone-200 p-3 dark:border-white/10" aria-hidden="true">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  // Keep the dashboard tight: show the three most pressing (weather comes first
  // from the API), tuck the rest behind a toggle.
  const shown = expanded ? alerts : alerts.slice(0, 3);

  return (
    <section className="space-y-2">
      <ul className="space-y-2">
        {shown.map((a, i) => {
          const Icon = ICON[a.kind];
          return (
          <li
            key={i}
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              a.kind === "recall"
                ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40"
                : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/15"
            }`}
          >
            <Icon className={`h-5 w-5 shrink-0 ${ICON_STYLE[a.kind]}`} aria-hidden="true" />
            <div>
              <p className="font-medium text-stone-900 dark:text-stone-100">{a.title}</p>
              <p className="mt-0.5 text-stone-600 dark:text-stone-300">{a.detail}</p>
              {a.url && (
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block font-medium text-bark-700 hover:underline dark:text-stone-300"
                >
                  View the official notice →
                </a>
              )}
            </div>
          </li>
          );
        })}
      </ul>
      {alerts.length > 3 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-xs font-medium text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-300"
        >
          Show {alerts.length - 3} more
        </button>
      )}
    </section>
  );
}
