// Build-time guard: this module reads STRIPE_SECRET_KEY, so importing it from
// a Client Component must fail the build, not ship the key.
import "server-only";
import Stripe from "stripe";
import { assertProductionEnvSeparation } from "@/lib/envGuard";
import { isHomeownerPreview } from "@/lib/previewMode";

// The structural backstop for homeowner preview mode (guardrail C1). Every
// money action is supposed to return a friendly coming-soon flash long before
// it reaches this module; this is what happens if one is ever missed, or if a
// new one is written next year by somebody who has never heard of preview
// mode. A thrown error in a server action is a bad message for a person, which
// is exactly why it is the LAST line of defence and not the first.
export const PREVIEW_STRIPE_BLOCKED =
  "Stripe is disabled in preview mode (NEXT_PUBLIC_PREVIEW_MODE=homeowner)";

// The one Stripe namespace that stays reachable in preview. Signature
// verification (stripe.webhooks.constructEvent) is a LOCAL HMAC check - it
// makes no network call and moves no money - and Stripe keeps delivering to a
// test-mode endpoint whatever the app thinks its own mode is. The webhook
// routes must keep answering 200/400 rather than 500 in preview, and they
// cannot do that if the first thing they touch throws.
const PREVIEW_ALLOWED_PROP = "webhooks";

// Server-side Stripe client. Uses the secret key from the environment; the
// hosted-checkout flow doesn't need the publishable key.
//
// Constructed lazily on first use, NOT at import time. `new Stripe("")` throws
// ("Neither apiKey nor config.authenticator provided"), and this module is
// pulled in by src/lib/subscription.ts, which nearly every signed-in page
// imports. Eagerly constructing meant a dev machine without STRIPE_SECRET_KEY
// could not render any page at all. With the lazy client, pages that never
// touch Stripe work, and the first real Stripe call on a keyless machine
// throws a message that names the missing variable.
let client: Stripe | null = null;

function getStripe(prop?: PropertyKey): Stripe {
  // PREVIEW MODE: nothing may call Stripe. Checked BEFORE the client is
  // constructed and before the env guard, so a preview deploy that still holds
  // a live secret key cannot make a single billable call by accident.
  //
  // Keyed on the property being accessed rather than on the call, because that
  // is the only signal this module gets - the proxy below hands it through.
  // `webhooks` is the one exception; see PREVIEW_ALLOWED_PROP above.
  if (isHomeownerPreview() && prop !== PREVIEW_ALLOWED_PROP) {
    throw new Error(PREVIEW_STRIPE_BLOCKED);
  }
  if (!client) {
    // First server use of the Stripe secret. A live deploy still holding a
    // sk_test_ key takes no real money and reports success, so it stops here
    // rather than silently "working" (src/lib/envGuard.ts).
    assertProductionEnvSeparation();
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error(
        "STRIPE_SECRET_KEY is not set. Billing features are unavailable until it is added to the environment."
      );
    }
    client = new Stripe(key);
  }
  return client;
}

// Same call sites as before (`stripe.subscriptions.retrieve(...)`,
// `stripe.webhooks.constructEvent(...)`): property access resolves against the
// real client, which is created on the first access.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    const real = getStripe(prop) as unknown as Record<PropertyKey, unknown>;
    const value = real[prop];
    return typeof value === "function" ? (value as Function).bind(real) : value;
  },
});
