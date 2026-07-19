import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Twilio's inbound-SMS webhook: fires whenever someone texts our Twilio
// number back. This is the OTHER half of the TCPA consent gate in
// src/lib/notify.ts - a STOP here must always be able to turn sendSms back
// off, regardless of what the /account checkbox says, or the "Reply STOP to
// opt out." line on every text we send would be a lie.
//
// PUBLIC route: Twilio calls this with no Hearth session, so it must be
// reachable with no auth. The middleware allowlist entry for
// /api/twilio/inbound is added elsewhere (not this file).
//
// SIGNATURE VERIFICATION: every request must carry a valid X-Twilio-Signature
// before From/Body are trusted or sms_consent is touched, same shape as
// src/lib/checkr.ts's verifyWebhookSignature - HMAC over (full URL + sorted
// POST param key+value pairs), keyed by TWILIO_AUTH_TOKEN, constant-time
// compared. FAIL CLOSED: a missing TWILIO_AUTH_TOKEN, a missing header, or a
// mismatch all return 403 without processing STOP/START. Twilio is dormant
// until TWILIO_AUTH_TOKEN/TWILIO_ACCOUNT_SID/TWILIO_FROM_NUMBER are set (see
// src/lib/notify.ts), so there is no legitimate inbound traffic to lose by
// refusing everything until then.
//
// runtime = "nodejs": needs the real node:crypto HMAC, same requirement as
// the Checkr webhook (src/app/api/checkr/webhook/route.ts).
export const runtime = "nodejs";
// dynamic = force-dynamic: this must never be cached, matching the other
// webhook routes (checkr, stripe).
export const dynamic = "force-dynamic";

const STOP_WORDS = new Set([
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
]);
const START_WORDS = new Set(["START", "YES", "UNSTOP"]);

const TWIML_EMPTY_RESPONSE = "<Response></Response>";

// Best-effort US phone match: strip everything but digits and compare the
// last 10 (the national number), so it doesn't matter whether one side has a
// leading "+1" and the other doesn't.
function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(-10);
}

// Reconstructs the exact public URL Twilio signed. Behind a proxy (Vercel,
// etc.) req.url's host/proto can be rewritten before this handler ever sees
// it, so prefer an explicit override, then the standard forwarded headers,
// then fall back to whatever req.nextUrl reports.
//
// TODO(config): TWILIO_WEBHOOK_URL must exactly match the URL entered as
// this number's "A message comes in" webhook in the Twilio console
// (scheme + host + path, no query string) - if they ever drift apart, every
// genuine Twilio request starts failing signature verification (403) too.
// Set that env var explicitly if the forwarded-header fallback below ever
// proves unreliable for this deployment's proxy.
function inboundWebhookUrl(req: NextRequest): string {
  const configured = process.env.TWILIO_WEBHOOK_URL;
  if (configured) return configured;

  const proto =
    req.headers.get("x-forwarded-proto") ??
    req.nextUrl.protocol.replace(":", "");
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    req.nextUrl.host;
  return `${proto}://${host}${req.nextUrl.pathname}`;
}

// Twilio's request-validation scheme: base64(HMAC-SHA1(authToken, url +
// sorted-by-key concatenation of every POST param's "key"+"value")). See
// https://www.twilio.com/docs/usage/security#validating-requests - no query
// string for a form POST like this one.
function computeTwilioSignature(
  url: string,
  params: URLSearchParams,
  authToken: string
): string {
  const sorted = Array.from(params.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  );
  let data = url;
  for (const [key, value] of sorted) data += key + value;
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

// Verifies X-Twilio-Signature against the reconstructed URL + form params.
// Never throws: returns false (reject) on any missing config, missing
// header, or mismatch - mirrors src/lib/checkr.ts's
// verifyWebhookSignature, including the constant-time compare via
// timingSafeEqual (only run once both buffers are confirmed equal length).
function verifyTwilioSignature(
  url: string,
  params: URLSearchParams,
  signatureHeader: string | null
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken || !signatureHeader) return false;

  let expected: string;
  try {
    expected = computeTwilioSignature(url, params, authToken);
  } catch {
    return false;
  }

  const provided = Buffer.from(signatureHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (provided.length !== expectedBuf.length || provided.length === 0) {
    return false;
  }
  try {
    return timingSafeEqual(provided, expectedBuf);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // Read the raw body once (form-encoded, not multipart) so the exact same
    // bytes back both the signature check and the From/Body values below -
    // req.formData() would consume the body without giving us the raw param
    // pairs the signature needs.
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);

    const signatureHeader = req.headers.get("x-twilio-signature");
    const url = inboundWebhookUrl(req);

    if (!verifyTwilioSignature(url, params, signatureHeader)) {
      // FAIL CLOSED: do not touch STOP/START or any user's sms_consent on an
      // unverified request.
      console.error("twilio inbound: signature verification failed");
      return new NextResponse("Forbidden", { status: 403 });
    }

    const body = (params.get("Body") ?? "").trim().toUpperCase();
    const from = params.get("From") ?? "";

    let consent: boolean | null = null;
    if (STOP_WORDS.has(body)) consent = false;
    else if (START_WORDS.has(body)) consent = true;

    const fromDigits = normalizePhone(from);
    if (consent !== null && fromDigits) {
      const admin = createAdminClient();

      // Stored phone numbers come from PhoneInput (see
      // src/components/PhoneInput.tsx), which writes the US display format
      // "(555) 123-4567" - not the E.164 format Twilio sends in `From`
      // ("+15551234567"). There's no column suited to an indexed lookup in
      // that format, so this pulls every user with a phone on file and
      // compares normalized digits in memory.
      // TODO(perf): this still full-scans every user with a phone on every
      // request. Signature verification above already closes the
      // abusive-volume angle (a forged/unsigned flood is rejected with 403
      // before it ever reaches this query), but a legitimate high-volume
      // deployment should still add a normalized, indexed `phone_digits`
      // column (needs a migration) and look up by equality instead of
      // scanning + comparing in memory.
      // TODO: if phone storage ever changes format (or goes non-US/+1), this
      // matching logic needs to change with it.
      const { data: users, error } = await (admin as any)
        .from("users")
        .select("id, phone")
        .not("phone", "is", null);

      if (error) {
        console.error("twilio inbound: users lookup failed:", error.message);
      } else {
        const match = (users ?? []).find(
          (u: { id: string; phone: string | null }) =>
            u.phone && normalizePhone(u.phone) === fromDigits
        );

        if (match) {
          // sms_consent_at only advances on a fresh grant (START). A STOP
          // flips consent off but deliberately leaves sms_consent_at alone,
          // same rule as saveAccountAction in
          // src/app/(app)/account/actions.ts - it should keep recording when
          // consent was originally given, not when it was revoked.
          const updatePayload =
            consent === true
              ? { sms_consent: true, sms_consent_at: new Date().toISOString() }
              : { sms_consent: false };

          const { error: updateError } = await admin
            .from("users")
            .update(updatePayload)
            .eq("id", match.id);
          if (updateError) {
            console.error(
              "twilio inbound: consent update failed:",
              updateError.message
            );
          }
        }
      }
    }
  } catch (err) {
    // Twilio retries on a non-2xx response - always 200 with empty TwiML
    // below regardless of what went wrong here, so a parsing hiccup doesn't
    // turn into a retry storm.
    console.error("twilio inbound:", err instanceof Error ? err.message : err);
  }

  return new NextResponse(TWIML_EMPTY_RESPONSE, {
    status: 200,
    headers: { "Content-Type": "text/xml" },
  });
}
