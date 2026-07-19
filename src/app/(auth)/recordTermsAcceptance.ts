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

  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = h.get("user-agent");

  const admin = createAdminClient();

  // Prefer the server-verified session's own id over the caller-supplied
  // arg: this is a "use server" action, so a crafted call (forged from
  // outside the normal signup flow) could otherwise pass an arbitrary
  // userId and forge a consent record for someone else. If a session
  // exists, trust ONLY it and reject a mismatching arg outright.
  //
  // Residual weak spot: when there is NO session yet (the signup-
  // propagation-lag case below), we still have to fall back to the passed
  // arg, since there is nothing server-verified to check it against. That
  // fallback is narrowed below: rate-limited, and only accepted for a real
  // auth.users row created moments ago (i.e. an in-flight signup), not an
  // arbitrary/forged id.
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
  } else {
    // No session yet - the browser's new session cookie hasn't propagated
    // back to this server-side request. This is an unauthenticated call
    // path, so it needs its own throttle (keyed on IP when available, since
    // the userId itself is attacker-choosable and trivially rotated) plus a
    // check that the id is not just well-formed but actually a very recent
    // signup, not any arbitrary existing/forged account id.
    const { data: allowed } = await admin.rpc("rate_limit_hit", {
      p_bucket: `terms-fallback:${ip ?? userId}`,
      p_limit: 10,
      p_window_seconds: 3600,
    });
    if (allowed === false) {
      console.error("recordTermsAcceptance: fallback rate limited", {
        userId,
        doc,
        ip,
      });
      return;
    }

    const { data: lookup, error: lookupError } =
      await admin.auth.admin.getUserById(userId);
    if (lookupError || !lookup?.user) {
      console.error("recordTermsAcceptance: fallback userId not found", {
        userId,
        doc,
        lookupError,
      });
      return;
    }
    // Only trust this for a signup that is genuinely still in flight: the
    // account must have been created moments ago. An older account here
    // means this is not the propagation-lag case at all, so reject it
    // rather than logging a consent record for it unverified.
    const RECENT_SIGNUP_WINDOW_MS = 15 * 60 * 1000;
    const createdAt = Date.parse(lookup.user.created_at ?? "");
    if (
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > RECENT_SIGNUP_WINDOW_MS
    ) {
      console.error("recordTermsAcceptance: fallback userId not a recent signup", {
        userId,
        doc,
        createdAt: lookup.user.created_at,
      });
      return;
    }
    verifiedUserId = lookup.user.id;
  }

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
