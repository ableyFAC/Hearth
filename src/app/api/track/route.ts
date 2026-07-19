import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Cap the raw body we'll even look at, so a caller can't DoS this endpoint
// (or the log) with an unbounded payload. Also cap what actually reaches the
// logs, independent of that, since even an allowed body shouldn't be logged
// unbounded.
const MAX_BODY_CHARS = 2048;
const MAX_LOG_CHARS = 2048;

// Stub analytics sink: just logs for now so events aren't dropped silently.
// Swap this for a real analytics provider later.
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    if (body.length <= MAX_BODY_CHARS) {
      console.log("[track]", body);
    } else {
      console.log(
        "[track] (truncated, body too large)",
        body.slice(0, MAX_LOG_CHARS)
      );
    }
  } catch {
    /* ignore - never fail the client over analytics */
  }
  return NextResponse.json({ ok: true });
}
