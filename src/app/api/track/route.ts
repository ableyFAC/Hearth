import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Stub analytics sink: just logs for now so events aren't dropped silently.
// Swap this for a real analytics provider later.
export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    console.log("[track]", body);
  } catch {
    /* ignore - never fail the client over analytics */
  }
  return NextResponse.json({ ok: true });
}
