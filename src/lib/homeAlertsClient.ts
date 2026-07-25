// Client-side helper for /api/home-alerts, shared by WeatherStrip (always-on
// current conditions at the top of the dashboard) and HomeAlerts (alert-only
// freeze/heat/recall list). Both mount on the same page, so without sharing
// they would each hit the route - and the route re-runs its Supabase reads on
// every call (it is deliberately uncached per user). A short module-level
// share window dedupes that into ONE fetch per page load while still
// refetching fresh data on a later navigation back to the dashboard. The
// cache is keyed by the active property's id: switching homes via
// HomeSwitcher soft-redirects to /dashboard without remounting, so a
// property change must bypass the share window or the new home would show
// the old home's weather for up to 30s.

export type HomeAlert = {
  kind: "freeze" | "heat" | "recall";
  title: string;
  detail: string;
  url?: string;
};

export type CurrentWeather = {
  tempF: number;
  code: number;
  highF: number;
  lowF: number;
  city: string;
};

export type HomeAlertsPayload = {
  weather: HomeAlert[];
  recalls: HomeAlert[];
  current: CurrentWeather | null;
};

let shared: {
  at: number;
  propertyId: string;
  promise: Promise<HomeAlertsPayload | null>;
} | null = null;

// Long enough that two components mounting in the same render share one call,
// short enough that revisiting the dashboard later gets fresh weather.
const SHARE_WINDOW_MS = 30_000;

// Resolves to null on any failure (network error, non-200, or the hard 6s
// timeout) - callers render nothing in that case, never an error state. The
// 6s cap lives here rather than per-caller so a shared in-flight promise has
// exactly one abort authority; consumers just stop listening on unmount.
export function fetchHomeAlerts(
  propertyId: string
): Promise<HomeAlertsPayload | null> {
  if (
    shared &&
    shared.propertyId === propertyId &&
    Date.now() - shared.at < SHARE_WINDOW_MS
  )
    return shared.promise;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  const promise: Promise<HomeAlertsPayload | null> = fetch("/api/home-alerts", {
    signal: controller.signal,
  })
    .then((r) => (r.ok ? (r.json() as Promise<HomeAlertsPayload>) : null))
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
  shared = { at: Date.now(), propertyId, promise };
  return promise;
}
