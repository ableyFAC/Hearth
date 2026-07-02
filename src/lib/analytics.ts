// Minimal, dependency-free client-side event tracking. Fire-and-forget: never
// throws, never blocks navigation, and is a no-op on the server.
export function track(event: string, props?: Record<string, unknown>) {
  if (typeof window === "undefined" || !navigator?.sendBeacon) return;
  try {
    navigator.sendBeacon(
      "/api/track",
      JSON.stringify({ event, props, ts: Date.now() })
    );
  } catch {
    /* ignore - analytics should never break the app */
  }
}
