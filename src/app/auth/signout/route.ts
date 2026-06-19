import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = createClient();
  await supabase.auth.signOut();
  // Land on the public landing page (neutral for both homeowner and pro).
  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}
