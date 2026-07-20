"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { setFlash } from "@/lib/flash";

// Length caps for an endpoint with no session and no per-user rate limit to
// fall back on - account/help's saveSupportMessageAction (which this mirrors)
// gets that for free by requiring a signed-in user; this one is reachable by
// anyone, so every field needs its own floor and ceiling before anything
// touches the database.
const MAX_NAME = 200;
const MAX_EMAIL = 254;
const MAX_PHONE = 40;
const MAX_MESSAGE = 5000;
const MIN_MESSAGE = 10;

const HONEST_SUCCESS = "Thanks. We read every message and reply by email.";

// Saves a message from the public /contact form (src/app/contact/page.tsx)
// so the team can read and reply, the same way saveSupportMessageAction
// (src/app/(app)/account/help/actions.ts) does for signed-in homeowners.
export async function sendContactMessageAction(formData: FormData) {
  // Honeypot: see ContactForm.tsx for how "company_website" is hidden from a
  // real visitor. A bot that fills every field in the form fills this one
  // too. Pretend success and store nothing, so it gets no signal to adapt on.
  const honeypot = ((formData.get("company_website") as string) || "").trim();
  if (honeypot) {
    setFlash(HONEST_SUCCESS, "success");
    return;
  }

  const str = (k: string, max: number) => {
    const v = ((formData.get(k) as string) || "").trim();
    return v.slice(0, max);
  };

  const name = str("name", MAX_NAME);
  const email = str("email", MAX_EMAIL);
  const phone = str("phone", MAX_PHONE);
  const message = str("message", MAX_MESSAGE);

  if (message.length < MIN_MESSAGE) {
    setFlash("Please write a few more words so we know what you need.", "error");
    return;
  }
  if (!email && !phone) {
    setFlash("Please add an email or a phone number so we can reply.", "error");
    return;
  }
  if (email && !email.includes("@")) {
    setFlash("That doesn't look like a valid email address.", "error");
    return;
  }

  // Unauthenticated and public, so it needs its own throttle before touching
  // the database at all - same fixed-window rate_limit_hit RPC (migration
  // 0068) and IP derivation as src/app/api/track/route.ts and
  // src/app/(auth)/recordTermsAcceptance.ts. Keyed separately (contact:<ip>)
  // so a burst of analytics beacons or terms-acceptance retries from the same
  // visitor can never exhaust their contact-form budget, or vice versa. Fails
  // open on an RPC hiccup: only an explicit `allowed === false` blocks the
  // message, so an outage never silently eats a real visitor's message.
  const h = headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `contact:${ip ?? "unknown"}`,
    p_limit: 5,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    setFlash(
      "You've sent several messages already. Please wait a bit before sending another.",
      "error"
    );
    return;
  }

  // ADMIN client, not the normal request-scoped client: a visitor here has no
  // session, and support_messages' RLS only grants insert to the
  // `authenticated` role (supabase/migrations/0021_support_messages.sql) -
  // by design, since the same table backs the signed-in-only Help page.
  // user_id stays null; that alone is how the team tells an anonymous
  // /contact message apart from a signed-in homeowner's, no schema change
  // needed since the column was already nullable.
  const { error } = await admin.from("support_messages").insert({
    user_id: null,
    name: name || null,
    email: email || null,
    phone: phone || null,
    message,
  });

  if (error) {
    console.error("sendContactMessageAction: insert failed", error);
    setFlash("Couldn't send your message. Please try again.", "error");
    return;
  }

  setFlash(HONEST_SUCCESS, "success");
}
