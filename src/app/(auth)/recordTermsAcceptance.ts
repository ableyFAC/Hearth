"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Records a terms/pro-terms acceptance into public.terms_acceptances (0073),
// called from the signup pages (src/app/homeowner-signup/page.tsx,
// src/app/contractor-signup/page.tsx) right after signUp() returns a session,
// i.e. only when the required agreement checkbox was checked. Uses the admin
// client because the table's RLS "insert own" policy targets the
// `authenticated` role, and this action can run before the browser's new
// session cookie has propagated back to a server-side request.
//
// TODO(legal): confirm the email-confirmation path also records acceptance -
// when Supabase email confirmation is ON, signUp() returns no session and
// this never fires; /auth/callback (which exchanges the code for a session)
// should call this too once a userId is available there.
//
// TODO(legal): bump VERSION whenever /terms or /pro-terms changes materially.
const VERSION = "2026-07-18";

export async function recordTermsAcceptance(
  userId: string,
  doc: "terms" | "pro_terms"
): Promise<void> {
  if (!UUID_RE.test(userId)) {
    console.error("recordTermsAcceptance: malformed userId", { userId, doc });
    return;
  }

  // Prefer the server-verified session's own id over the caller-supplied
  // arg: this is a "use server" action, so a crafted call (forged from
  // outside the normal signup flow) could otherwise pass an arbitrary
  // userId and forge a consent record for someone else. If a session
  // exists, trust ONLY it and reject a mismatching arg outright.
  //
  // Residual weak spot: when there is NO session yet (the signup-
  // propagation-lag case below), we still have to fall back to the passed
  // arg, since there is nothing server-verified to check it against.
  const authClient = createClient();
  const {
    data: { user: sessionUser },
  } = await authClient.auth.getUser();

  let verifiedUserId = userId;
  if (sessionUser) {
    if (sessionUser.id !== userId) {
      console.error("recordTermsAcceptance: userId mismatch with session", {
        argUserId: userId,
        sessionUserId: sessionUser.id,
        doc,
      });
      return;
    }
    verifiedUserId = sessionUser.id;
  }
  // else: no session yet - the browser's new session cookie hasn't
  // propagated back to this server-side request. Fall back to the passed
  // arg (see module comment above); this is the one case where the id is
  // not independently verified server-side.

  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");

  const admin = createAdminClient();
  const { error } = await admin.from("terms_acceptances").insert({
    user_id: verifiedUserId,
    doc,
    version: VERSION,
    ip,
    user_agent: userAgent,
  });

  // Best-effort: a logging failure here must never block signup. Surfacing an
  // error to the user for a background audit-trail write would be worse than
  // a missing row, which is still visible/fixable from the admin side.
  if (error) {
    console.error("recordTermsAcceptance failed", { userId, doc, error });
  }
}
