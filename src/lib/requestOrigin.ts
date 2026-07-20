import type { NextRequest } from "next/server";

// The origin the BROWSER is actually on, for building same-site redirects.
//
// request.url / request.nextUrl.origin are the wrong source for this: when
// the dev server is bound to another interface (`next dev -H 0.0.0.0`), Next
// reports the BIND address there, so `new URL("/", request.url)` redirects
// the browser to http://0.0.0.0:3000/ - a dead end. The Host header (or
// x-forwarded-host behind a proxy like Vercel or a cloudflared tunnel) is
// what the browser typed, so redirecting there always lands back on the same
// site the user is already on - localhost, the LAN IP, or the tunnel URL
// alike. NEXT_PUBLIC_SITE_URL is deliberately NOT used here for the same
// reason: it pins one canonical host and would break every other way of
// reaching the app.
//
// Only ever use this for the ORIGIN of a redirect whose path we control.
// The Host header is client-supplied, so it must never grant anything -
// sending someone back to the host they themselves asked for grants nothing.
export function requestOrigin(request: NextRequest): string {
  // Behind chained proxies x-forwarded-host can be comma-separated; the
  // first entry is the client-facing one.
  const host = (
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    ""
  )
    .split(",")[0]
    .trim();
  if (!host) return request.nextUrl.origin;
  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ||
    request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}
