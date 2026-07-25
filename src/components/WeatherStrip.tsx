"use client";

import { useEffect, useState } from "react";
import {
  Sun,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  CloudFog,
  CloudLightning,
  type LucideIcon,
} from "lucide-react";
import { Skeleton } from "@/components/Skeleton";
import { fetchHomeAlerts, type CurrentWeather } from "@/lib/homeAlertsClient";

// Open-Meteo WMO weather codes -> one icon and one short word. Buckets, not
// per-code labels: a homeowner glancing at the dashboard needs "Rain", not
// "moderate rain with slight hail". Unknown codes fall back to plain cloudy.
function conditionFor(code: number): { icon: LucideIcon; word: string } {
  if (code === 0 || code === 1) return { icon: Sun, word: "Sunny" };
  if (code === 2) return { icon: CloudSun, word: "Partly cloudy" };
  if (code === 3) return { icon: Cloud, word: "Cloudy" };
  if (code === 45 || code === 48) return { icon: CloudFog, word: "Foggy" };
  if (code >= 51 && code <= 57) return { icon: CloudDrizzle, word: "Drizzle" };
  if (code >= 61 && code <= 67) return { icon: CloudRain, word: "Rain" };
  if (code >= 71 && code <= 77) return { icon: CloudSnow, word: "Snow" };
  if (code >= 80 && code <= 82) return { icon: CloudRain, word: "Showers" };
  if (code === 85 || code === 86) return { icon: CloudSnow, word: "Snow" };
  if (code >= 95) return { icon: CloudLightning, word: "Storms" };
  return { icon: Cloud, word: "Cloudy" };
}

// One quiet row of current weather at the top of the dashboard: temperature,
// condition, today's high/low, city. Always shown when data arrives (unlike
// HomeAlerts below it, which stays alert-only). Shares one /api/home-alerts
// fetch with HomeAlerts via fetchHomeAlerts, and follows the same skeleton
// contract: a placeholder only while the page itself is still loading, then
// nothing at all if the lookup fails - never a stuck or empty box.
// propertyId comes from the dashboard server component: switching homes via
// HomeSwitcher soft-redirects here without remounting, so the effect below
// keys on it to refetch for the new home instead of showing stale weather.
export default function WeatherStrip({ propertyId }: { propertyId: string }) {
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [loading, setLoading] = useState(true);
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
    // The shared helper owns the 6s timeout and resolves null on any failure,
    // so this consumer only has to stop listening when unmounted (or when
    // propertyId changes and this run's closure goes stale).
    fetchHomeAlerts(propertyId).then((d) => {
      if (!alive) return;
      setWeather(d?.current ?? null);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [propertyId]);

  if (loading && !pageLoaded) {
    return (
      <div
        className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 shadow-card dark:border-white/10 dark:bg-stone-800"
        aria-hidden="true"
      >
        <Skeleton className="h-4 w-4 shrink-0 rounded-full" />
        <Skeleton className="h-4 w-40" />
      </div>
    );
  }

  if (!weather) return null;

  const { icon: Icon, word } = conditionFor(weather.code);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm shadow-card dark:border-white/10 dark:bg-stone-800">
      <Icon
        className="h-4 w-4 shrink-0 text-bark-700 dark:text-stone-300"
        aria-hidden="true"
      />
      <span className="font-medium text-stone-900 dark:text-stone-100">
        {weather.tempF}&deg; {word}
      </span>
      <span className="text-stone-500 dark:text-stone-400">
        H {weather.highF}&deg; L {weather.lowF}&deg;
      </span>
      {weather.city && (
        <span className="ml-auto min-w-0 truncate text-stone-500 dark:text-stone-400">
          {weather.city}
        </span>
      )}
    </div>
  );
}
