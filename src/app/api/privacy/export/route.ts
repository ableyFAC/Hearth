import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectUserData } from "@/lib/privacy";

export const runtime = "nodejs";
// The payload is built per-request from live data; never cache it.
export const dynamic = "force-dynamic";

// Right to know / right to data portability (Cal. Civ. Code 1798.100, 1798.110,
// 1798.130(a)(2)): a signed-in person downloads everything Hearth holds about
// them, in a structured, machine-readable format, right now.
//
// Verification is the live session itself. Under 11 CCR 7060 a business must
// verify a request to a "reasonable degree of certainty"; being signed in to
// the account whose data is being exported is the password-backed, first-party
// version of that, and it is why this returns the CALLER'S data only - the
// user id comes from getUser(), never from a query parameter, so there is no
// id to tamper with.
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await collectUserData(user.id);
  } catch {
    // Don't leak the underlying database error to the browser.
    return NextResponse.json(
      { error: "Couldn't build your export. Please try again." },
      { status: 500 }
    );
  }

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="hearth-data-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
