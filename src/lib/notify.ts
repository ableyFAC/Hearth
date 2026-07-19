import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// Single entry point for notifying a homeowner. Always writes the in-app
// notification row (what the bell in the nav shows), then tries the email and
// SMS channels - which stay dormant until their provider env vars exist, so
// wiring up a provider later is just adding keys, no code changes.
//
// To activate email: create a Resend account (resend.com) and set
//   RESEND_API_KEY - from resend.com/api-keys
//   RESEND_FROM    - a verified sender, e.g. "Hearth <hello@yourdomain.com>"
// To activate SMS: create a Twilio account (twilio.com) and set
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
//
// TCPA gate: SMS is a strictly opt-in channel (statutory damages of $500-1500
// PER TEXT for sending without consent, per user_id.sms_consent - migration
// 0073). sendSms requires smsConsent === true in addition to the env vars and
// a phone number; any other value (undefined, false, null) is treated as "no
// consent on file" and the text is skipped. Callers must read sms_consent off
// the users row themselves and pass it through - this module never queries
// the DB for it, so a caller that forgets to pass it simply gets no SMS
// rather than an accidental send.

export type NotificationInput = {
  userId: string;
  kind: string;
  title: string;
  body?: string | null;
  url?: string | null;
  // Optional contact details for the email / SMS channels. Ignored until the
  // provider env vars above are set.
  email?: string | null;
  phone?: string | null;
  // Must be exactly `true` (the caller's users.sms_consent value) for the SMS
  // channel to fire at all. See the TCPA gate note above.
  smsConsent?: boolean | null;
};

// Returns true if the in-app notification was written. Email / SMS delivery
// is best-effort and never fails the caller.
export async function sendNotification(
  supabase: SupabaseClient<Database>,
  input: NotificationInput
): Promise<boolean> {
  const { error } = await supabase.from("notifications").insert({
    user_id: input.userId,
    kind: input.kind,
    title: input.title,
    body: input.body ?? null,
    url: input.url ?? null,
  });
  if (error) {
    // Was a silent no-op: the in-app row is the source of truth, so a failed
    // insert here means the recipient gets nothing and nothing says why.
    console.error("sendNotification: insert failed:", error.message ?? error);
    return false;
  }

  await Promise.all([sendEmail(input), sendSms(input)]);
  return true;
}

// Email via the Resend REST API. Plain fetch, no SDK, so there is no new
// dependency to install. Dormant until RESEND_API_KEY is set.
async function sendEmail(input: NotificationInput): Promise<void> {
  if (!process.env.RESEND_API_KEY || !input.email) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "Hearth <onboarding@resend.dev>",
        to: input.email,
        subject: input.title,
        text: input.body ? `${input.title}\n\n${input.body}` : input.title,
      }),
    });
  } catch {
    // A provider hiccup must never break the caller - the in-app
    // notification is the source of truth.
  }
}

// SMS via the Twilio REST API. Dormant until the TWILIO_* env vars are set -
// and, separately, until the recipient has opted in (TCPA gate: see the note
// atop this file). Both gates must pass; either alone is not enough.
async function sendSms(input: NotificationInput): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from || !input.phone) return;
  if (input.smsConsent !== true) return;
  try {
    const body = input.body ? `${input.title} ${input.body}` : input.title;
    await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString(
            "base64"
          )}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          To: input.phone,
          From: from,
          // "Reply STOP to opt out." is appended to every SMS (never the
          // email body) so each text carries its own opt-out instruction,
          // independent of whatever the inbound STOP webhook also does.
          Body: `${body} Reply STOP to opt out.`,
        }),
      }
    );
  } catch {
    // Same as email: never let a provider error break the caller.
  }
}
