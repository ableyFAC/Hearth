// Stripe Connect account state, as five words a person can act on.
//
// PURE ON PURPOSE, and deliberately NOT "server-only" and NOT "use client":
// this module is imported by the server helpers (src/lib/stripeConnect.ts),
// by the server pages that decide which card to render, by the client
// components that render them, and by unit tests. Adding either directive here
// would cut one of those four off - and src/lib/serverClientBoundary.test.ts
// exists precisely because a server module reading a value out of a
// "use client" module reads `undefined` at runtime and fails silently.
//
// Nothing here talks to Stripe or to the database. It takes the seven
// contractors.stripe_* columns migration 0164 adds (any subset of them, all
// optional) and answers "what should this pro see, and may they send an
// invoice yet".

/**
 * Where a contractor is in Stripe Connect onboarding.
 *
 *   unavailable  - we could not tell. The live database has not run 0164 yet,
 *                  or the read failed. NOT a state the row can hold: callers
 *                  map a missing-schema read to this themselves, because a
 *                  missing column is a deployment fact, not a fact about the
 *                  contractor. Shows a "not switched on yet" card, no buttons.
 *   not_started  - no connected account exists yet. In practice rare after
 *                  2026-09-12: the account is created silently the moment the
 *                  onboarding wizard completes. A pro who signed up BEFORE
 *                  that (or whose silent create failed) lands here, and the
 *                  first thing /pro/payouts does is create one.
 *   in_progress  - an account exists, but the pro has not finished Express
 *                  onboarding (details_submitted is false).
 *   restricted   - they finished, and Stripe still will not let money move:
 *                  either something is in requirements.currently_due or the
 *                  account is disabled. This is the state that needs the
 *                  requirement list printed out.
 *   ready        - charges AND payouts are both enabled. The only state that
 *                  may send an invoice.
 */
export type ConnectStatus =
  | "unavailable"
  | "not_started"
  | "in_progress"
  | "restricted"
  | "ready";

/**
 * The 0164 columns, every one optional. Typed loosely on purpose: the row
 * arrives from a PostgREST select that may have been widened or narrowed, from
 * a database that may not have the columns at all, and from tests that pass a
 * literal. Anything unrecognized reads as absent, which is the safe direction -
 * absent means "not connected", never "ready".
 */
export type ConnectRow = {
  stripe_account_id?: string | null;
  stripe_charges_enabled?: boolean | null;
  stripe_payouts_enabled?: boolean | null;
  stripe_details_submitted?: boolean | null;
  stripe_requirements_currently_due?: string[] | null;
  stripe_disabled_reason?: string | null;
  stripe_account_synced_at?: string | null;
} | null | undefined;

/**
 * The status for a row. Pure, total, and never throws.
 *
 * FAILS TOWARD "not ready" at every step: a null row, a row with no account
 * id, a row whose booleans are null because the column does not exist - all of
 * them are "not connected". The one answer that costs real money to get wrong
 * is a false "ready", and nothing here can produce one without both Stripe
 * booleans being literally true.
 *
 * A row is never "unavailable": see the type above.
 */
export function connectStatusFor(row: ConnectRow): ConnectStatus {
  if (!row || !row.stripe_account_id) return "not_started";
  if (!row.stripe_details_submitted) return "in_progress";
  if (!(row.stripe_charges_enabled && row.stripe_payouts_enabled)) {
    return "restricted";
  }
  return "ready";
}

/**
 * THE FIRM RULE from the 2026-09-12 payment-model decision: every contractor
 * must have a live connected account before sending ANY invoice, whatever the
 * job is worth. No cash-only lane.
 *
 * Nothing in step 1 (Connect plumbing) calls this - it is here so step 2 (the
 * invoice flow) has exactly one place to ask, and so that place is unit
 * tested before there is any money behind it.
 */
export function canSendInvoices(row: ConnectRow): boolean {
  return connectStatusFor(row) === "ready";
}

// Stripe's requirement keys are API identifiers, not sentences. A pro staring
// at "individual.verification.document" has no idea they need to photograph a
// driver's license. These are the keys a US Express account actually surfaces
// in currently_due in practice; anything else falls through to the raw key,
// which is ugly but honest and still tells support what to look at.
//
// Deliberately NOT exhaustive and deliberately not scraped from Stripe: a
// wrong translation is worse than a raw key, so a key is only listed here when
// its plain-English meaning is unambiguous.
const REQUIREMENT_LABELS: Record<string, string> = {
  external_account: "A bank account to pay out to",
  "individual.id_number": "Your Social Security number",
  "individual.ssn_last_4": "The last 4 digits of your Social Security number",
  "individual.verification.document": "A photo of your ID",
  "individual.verification.additional_document":
    "One more document to confirm your identity",
  "individual.dob.day": "Your date of birth",
  "individual.dob.month": "Your date of birth",
  "individual.dob.year": "Your date of birth",
  "individual.address.line1": "Your home address",
  "individual.address.city": "Your home address",
  "individual.address.state": "Your home address",
  "individual.address.postal_code": "Your home address",
  "individual.first_name": "Your legal first name",
  "individual.last_name": "Your legal last name",
  "individual.email": "Your email address",
  "individual.phone": "Your phone number",
  "business_profile.url": "A website or social page for your business",
  "business_profile.mcc": "What kind of work your business does",
  "business_profile.product_description": "A short description of your work",
  "business_type": "Whether you're a sole proprietor or a company",
  "company.tax_id": "Your business tax ID (EIN)",
  "company.name": "Your registered business name",
  "company.address.line1": "Your business address",
  "company.phone": "A phone number for your business",
  "company.verification.document": "A document confirming your business",
  "tos_acceptance.date": "Accepting Stripe's terms",
  "tos_acceptance.ip": "Accepting Stripe's terms",
  "representative.first_name": "Who represents the business",
  "representative.last_name": "Who represents the business",
};

/**
 * One Stripe requirement key as a line a contractor can read. Unknown keys
 * come back unchanged rather than being guessed at or hidden - a pro seeing a
 * key they can quote to support beats a pro seeing nothing at all.
 */
export function humanizeRequirement(key: string): string {
  if (!key) return key;
  return REQUIREMENT_LABELS[key] ?? key;
}

/**
 * The whole currently_due list, humanized and de-duplicated in order. Several
 * raw keys map to one sentence on purpose (the three `individual.dob.*` keys
 * are one question to a human), and a list that says "Your date of birth"
 * three times reads like a bug.
 */
export function humanizeRequirements(
  keys: string[] | null | undefined
): string[] {
  if (!Array.isArray(keys)) return [];
  const out: string[] = [];
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const label = humanizeRequirement(key);
    if (!out.includes(label)) out.push(label);
  }
  return out;
}
