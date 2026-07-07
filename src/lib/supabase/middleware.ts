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
    // SEO endpoints (src/app/sitemap.ts, robots.ts): crawlers have no
    // session, and a 307 to /signin here would hide the whole site from them.
    path === "/sitemap.xml" ||
    path === "/robots.txt" ||
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
