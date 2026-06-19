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
    path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    // One unified sign-in for everyone; "/" routes by role after login.
    url.pathname = "/signin";
    return NextResponse.redirect(url);
  }

  return response;
}
