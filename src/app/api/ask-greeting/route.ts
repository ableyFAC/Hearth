import { NextResponse } from "next/server";
import { getProactiveGreeting } from "@/lib/greeting";

export const runtime = "nodejs";
// Per-user, per-home, and it reflects issues and tasks that change under the
// user's own hands. Never cached, at any layer.
export const dynamic = "force-dynamic";

// The Ask Hearth dock's proactive opener, on demand.
//
// This used to be computed inside the (app) layout, which meant every single
// signed-in page view paid for it: three extra queries (issues, home_systems,
// maintenance_tasks) on top of the six the shell already runs, for a string
// that only ever appears if the user opens the dock. Most page views never do.
// Suspense kept it off the critical path for first byte, but the queries still
// ran, on every navigation, for everyone.
//
// Now the dock asks for it the first time it is opened (and speculatively on
// hover, so the answer is usually already sitting there by the time the panel
// appears). A user who never touches the dock never triggers these queries at
// all.
//
// Auth: this route is NOT on the middleware's public allowlist, so an
// unauthenticated request is redirected before it arrives. getProactiveGreeting
// re-derives the user and the active home itself and returns undefined for
// anyone it cannot resolve, so there is no way to ask it about someone else's
// home. It swallows its own failures too, which is why there is no try/catch
// here: a hiccup comes back as a null greeting and the dock falls back to its
// generic opener, exactly as it did when the layout computed this.
export async function GET() {
  const greeting = await getProactiveGreeting();

  return NextResponse.json(
    { greeting: greeting ?? null },
    { headers: { "Cache-Control": "no-store" } }
  );
}
