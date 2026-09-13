"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { cappedField, honeypotTripped, FIELD_MAX } from "@/lib/formFields";
import { err, ok, type ActionResult } from "@/lib/actionResult";
import { clientIpFromHeaders } from "@/lib/clientIp";
import { JOB_CATEGORIES } from "@/lib/constants";
import { PRO_WAITLIST_CONFIRMATION } from "@/lib/previewMode";

// Longest city we will store. Not a validation the visitor can fail - the
// field is quietly truncated, the same way every other cappedField() call
// site in the repo treats a paste-happy value.
const MAX_CITY = 80;
const MAX_TRADE = 40;

// Postgres' unique_violation. The lower(email) index raises it for a repeat
// signup, which is a normal outcome here and not an error worth reporting.
const UNIQUE_VIOLATION = "23505";

// The one message this action ever shows on the success path, whether the row
// was inserted, was already there, or was a bot's (see NEVER REVEAL below),
// is PRO_WAITLIST_CONFIRMATION in src/lib/previewMode.ts: a "use server" file
// may export only async functions, so the constant cannot live here.

// Every accepted trade value: the canonical service categories plus "other".
// Derived from JOB_CATEGORIES rather than re-listed, so a new category added
// to the app is accepted here the day it is added and a forged value never is.
const TRADE_VALUES: readonly string[] = JOB_CATEGORIES.map((c) => c.value);

// "Tell me when OakTend for Pros opens." The only thing a contractor can do
// during the homeowner preview (src/lib/previewMode.ts): every real pro door
// renders ProsComingSoon, and this is the form on it.
//
// NO AUTH, BY DESIGN. The people this is for do not have accounts yet, and
// the ones who do are staring at a closed shell. That makes it a public,
// unauthenticated write endpoint, so it carries the same three defenses
// src/app/contact/actions.ts carries for exactly the same reason: a honeypot,
// hard length caps on every field, and an IP rate limit before anything
// touches the database.
//
// NEVER REVEAL WHETHER THE EMAIL WAS ALREADY THERE. A "you're already on the
// list" message turns this into an oracle that answers "is this contractor
// signed up with OakTend?" for any email somebody cares to type. The unique
// index does the deduplication in the database, the insert ignores the
// conflict, and every non-validation outcome - new row, duplicate row,
// honeypot, even an insert error - returns the same sentence.
export async function joinProWaitlistAction(
  formData: FormData
): Promise<ActionResult> {
  // A hand-crafted POST to the action endpoint arrives without a FormData
  // body; reading it would throw a TypeError and a 500. Same quiet refusal
  // sendContactMessageAction makes.
  if (!(formData instanceof FormData)) {
    return err("Bad request.");
  }

  // Honeypot (src/components/Honeypot.tsx). A bot that fills every field fills
  // this one too: pretend it worked and store nothing, so the script gets no
  // signal to adapt on.
  if (honeypotTripped(formData)) {
    return ok();
  }

  const email = cappedField(formData, "email", FIELD_MAX.email);
  const trade = cappedField(formData, "trade", MAX_TRADE);
  const city = cappedField(formData, "city", MAX_CITY);
  const source = cappedField(formData, "source", 40) || "pros";

  // Shape only, never a deliverability check: an over-strict regex rejects
  // real addresses, and the only cost of a bad one here is an email that
  // bounces when the pro side opens. Mirrors the contact form's rule (an "@"
  // with something either side of it) plus a no-whitespace check, since this
  // value goes into a unique index.
  const at = email.indexOf("@");
  if (
    !email ||
    at <= 0 ||
    at === email.length - 1 ||
    email.includes(" ") ||
    !email.slice(at + 1).includes(".")
  ) {
    return err("That doesn't look like a valid email address.");
  }

  // An unrecognised trade is dropped rather than refused: the select only
  // offers the list, so a value outside it is a forged or stale submit, and
  // the email is the part worth keeping either way.
  const storedTrade = TRADE_VALUES.includes(trade) ? trade : null;

  // Unauthenticated and public, so it needs its own throttle before touching
  // the database at all - the same fixed-window rate_limit_hit RPC (migration
  // 0068) and the same IP derivation as src/app/contact/actions.ts. Keyed
  // separately (pro_waitlist:<ip>) so a burst here can never eat a visitor's
  // contact-form budget or the reverse. Fails OPEN on an RPC hiccup (only an
  // explicit `allowed === false` blocks), so an outage never silently eats a
  // real contractor's signup.
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const admin = createAdminClient();
  const { data: allowed } = await admin.rpc("rate_limit_hit", {
    p_bucket: `pro_waitlist:${ip ?? "unknown"}`,
    p_limit: 5,
    p_window_seconds: 3600,
  });
  if (allowed === false) {
    return err(
      "You've signed up a few times already. Please wait a bit before trying again."
    );
  }

  // ADMIN client: pro_waitlist has RLS on and NO policies (migration 0168), so
  // anon and authenticated cannot read or write it at all. Only the service
  // role gets in, which is what keeps a public email-capture table from being
  // a public email-capture LIST.
  //
  // The email is stored as typed; the unique index is on lower(email), so
  // "Sam@X.com" and "sam@x.com" are one row.
  //
  // A PLAIN INSERT WITH THE DUPLICATE SWALLOWED, not .upsert(). PostgREST's
  // on_conflict parameter takes a COLUMN list and cannot name an expression
  // index, so `{ onConflict: "lower(email)" }` would come back as 42P10
  // ("no unique or exclusion constraint matching the ON CONFLICT
  // specification") on every single call. Catching 23505 from the index is
  // the same outcome by the honest route.
  // `(admin as any)` because pro_waitlist is not in src/lib/database.types.ts
  // yet - the same cast every other not-yet-typed table in the repo uses
  // (market_waitlist in src/app/onboarding/actions.ts, pro_feedback,
  // rentcast_cache).
  const { error } = await (admin as any).from("pro_waitlist").insert({
    email,
    trade: storedTrade,
    city: city || null,
    source,
  });

  // Logged, not surfaced, and a duplicate is not even logged: signing up
  // twice is the ordinary case, and telling the visitor "couldn't save" on
  // one would be the oracle this action exists to avoid. A genuine DB failure
  // is ours to notice, not theirs to retry into.
  if (error && (error as { code?: string }).code !== UNIQUE_VIOLATION) {
    console.error("joinProWaitlistAction: insert failed", error);
  }

  return ok();
}
