import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/database.types";

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the auth session on every request and guards app routes.
// Public routes: "/", "/get-started", "/signin", the sign-up pages,
// "/preview", "/auth/*". Everything else requires a session.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic =
    path === "/" ||
    path.startsWith("/get-started") ||
    path.startsWith("/signin") ||
    path.startsWith("/homeowner-signup") ||
    path.startsWith("/contractor-signup") ||
    path.startsWith("/preview") ||
    path.startsWith("/auth") ||
    // A pro's shareable public page: readable with no account by design.
    path.startsWith("/p/") ||
    // Public pros landing page: /p/ pages link here ("Powered by Hearth"),
    // so logged-out visitors must not bounce to /signin. Exact match: the
    // signed-in pro app lives under /pro/ and must stay guarded.
    path === "/pros" ||
    // Public SEO guide pages (src/app/guides/...): informational content
    // meant to be read by anonymous search visitors, not gated behind login.
    path.startsWith("/guides") ||
    // City landing pages (src/app/fountain-valley, src/app/huntington-beach):
    // local SEO + Nextdoor/chamber citation targets, same reasoning as the
    // guide pages above. startsWith with the slash variant too: these pages
    // exist to receive EXTERNAL links (directories, QR codes) that sometimes
    // append a trailing slash, and an exact match would bounce those
    // visitors to /signin.
    path === "/fountain-valley" ||
    path.startsWith("/fountain-valley/") ||
    path === "/huntington-beach" ||
    path.startsWith("/huntington-beach/") ||
    // Privacy policy + Terms of Service (src/app/privacy, src/app/terms):
    // legally need to be readable by anyone, logged in or not, same reasoning
    // as the guide and city pages above.
    path === "/privacy" ||
    path.startsWith("/privacy/") ||
    path === "/terms" ||
    path.startsWith("/terms/") ||
    // SEO endpoints (src/app/sitemap.ts, robots.ts): crawlers have no
    // session, and a 307 to /signin here would hide the whole site from them.
    path === "/sitemap.xml" ||
    path === "/robots.txt" ||
    // Cron routes authenticate via CRON_SECRET (Bearer/header/query), not a
    // user session. Vercel Cron sends no session cookie, so WITHOUT this
    // entry every scheduled job would 307 to /signin (an HTML 200!) before
    // its own secret check ever ran, and the platform would report the runs
    // as successful while nothing executed. The secret check inside each
    // route remains the real gate.
    path.startsWith("/api/cron/") ||
    // The embeddable rating widget is fetched by THIRD-PARTY sites (a pro's
    // own website embeds it), so there is never a session on the request. It
    // serves aggregate-only public data by design.
    path.startsWith("/api/pro-widget/") ||
    // Stripe webhook authenticates via its signature, not a user session, and
    // must never be redirected: Stripe doesn't follow redirects and would treat
    // the 307 as a failed delivery, so deposits would never be credited.
    path.startsWith("/api/stripe/webhook") ||
    // Checkr webhook (0057): same reasoning as Stripe above - authenticates
    // via X-Checkr-Signature, not a user session, and a 307 here would read
    // as a failed delivery, so background check results would never land.
    path.startsWith("/api/checkr/webhook");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // One unified sign-in for everyone; "/" routes by role after login.
    // The page they were headed to rides along as ?next= so signin can send
    // them back instead of dropping them on the dashboard (GET pages only:
    // a POST's destination would just 404 or sit empty after a redirect).
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/signin";
    url.search =
      request.method === "GET" && next.startsWith("/") && !next.startsWith("//")
        ? `?next=${encodeURIComponent(next)}`
        : "";
    return NextResponse.redirect(url);
  }

  return response;
}
