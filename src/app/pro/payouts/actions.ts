"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentContractor } from "@/lib/contractor";
import { setFlash } from "@/lib/flash";
import {
  createAccountSession,
  createOnboardingLink,
  refreshConnectAccount,
} from "@/lib/stripeConnect";
import { previewBlocksMoney } from "@/lib/previewModeServer";
import { isHomeownerPreview, PREVIEW_MEMBERSHIP_COPY } from "@/lib/previewMode";

// Server actions behind /pro/payouts.
//
// THE ONE SECURITY RULE HERE, and it is the reason none of these takes an
// argument: every action resolves the contractor from the SESSION
// (getCurrentContractor(), which verifies the user against Supabase's auth
// server and then keys the row on user_id) and operates on that row only. No
// action accepts a contractor id, an account id, or anything else from the
// client. A Server Action is a POST endpoint anyone can call with any body;
// the only id it may ever act on is one the server resolved itself.
//
// Everything downstream of here writes through the admin (service_role)
// client, because migration 0164 grants the stripe_* columns to nobody - see
// the long grants note in that migration.

// Where Stripe sends the pro back. Same resolution as the rest of the app
// (src/app/pro/business/page.tsx, src/lib/legal.ts).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// One sentence for every failure. A pro does not need to know whether it was a
// missing migration, a missing API key or a Stripe 500 - all three mean "not
// now, try again", and the real reason is in the server log.
const COULD_NOT_OPEN = "Couldn't open Stripe right now. Try again in a minute.";

/**
 * Hosted onboarding: mint a single-use Stripe account link and send the pro
 * there. The fallback path everywhere the embedded component cannot run - the
 * native app shell, a missing publishable key, a connect.js failure - and
 * always available underneath the embedded component as "Continue on Stripe".
 */
export async function startHostedPayoutOnboardingAction(): Promise<void> {
  // PREVIEW MODE (guardrail A4). Connect onboarding creates a real Stripe
  // Express account against a real person's SSN and bank details; that is not
  // something to do on a product we are telling a lawyer is closed, and it is
  // not undone by flipping a flag back. Blocked for everyone, internal
  // accounts included - the whole Connect flow is tested with the flag off.
  if (await previewBlocksMoney()) redirect("/pro/payouts");

  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const result = await createOnboardingLink(contractor.id, {
    // returned=1 triggers the on-return sync: the webhook is the authority but
    // can lag by seconds, and a pro who just finished should not be shown
    // "finish setting up payouts" on the page they land back on.
    returnUrl: `${SITE_URL}/pro/payouts?returned=1`,
    // Stripe calls refresh_url when the link has EXPIRED (they are good for
    // minutes). The page treats it as "your link went stale, here is a fresh
    // one", not as an error.
    refreshUrl: `${SITE_URL}/pro/payouts?refresh=1`,
  });

  if ("error" in result) {
    await setFlash(COULD_NOT_OPEN, "error");
    redirect("/pro/payouts");
  }

  redirect(result.url);
}

/**
 * A client secret for the EMBEDDED onboarding component.
 *
 * Returns a plain object rather than redirecting, because connect.js calls
 * this from `fetchClientSecret` and expects a value back. The error string is
 * the same single sentence the hosted path flashes - the client component
 * falls back to the hosted button when it sees one.
 */
export async function createAccountSessionAction(): Promise<
  { clientSecret: string } | { error: string }
> {
  // PREVIEW MODE (A4). Returns the coming-soon sentence rather than
  // redirecting, because connect.js calls this from `fetchClientSecret` and
  // expects a value back - this action is the one of the three that never
  // redirects. No setFlash either (previewBlocksMoney is not used here): a
  // toast queued for a fetch() the visitor never navigates away from would
  // surface later on some unrelated page.
  if (isHomeownerPreview()) return { error: PREVIEW_MEMBERSHIP_COPY };

  const contractor = await getCurrentContractor();
  if (!contractor) return { error: COULD_NOT_OPEN };

  const result = await createAccountSession(contractor.id);
  if ("error" in result) return { error: COULD_NOT_OPEN };
  return { clientSecret: result.clientSecret };
}

/**
 * "Refresh status": pull the account straight from Stripe and re-mirror it.
 *
 * A form action, so it works with JavaScript off, and the escape hatch for the
 * one case the webhook cannot cover - a delivery that failed while the pro was
 * looking at the page. Revalidates all three surfaces that render the status
 * so they cannot disagree with each other.
 */
export async function refreshPayoutStatusAction(): Promise<void> {
  // PREVIEW MODE (A4): refreshConnectAccount() calls Stripe (accounts.retrieve)
  // and would throw on the stripe client's first property access.
  if (await previewBlocksMoney()) redirect("/pro/payouts");

  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  await refreshConnectAccount(contractor.id);

  revalidatePath("/pro/payouts");
  revalidatePath("/pro");
  revalidatePath("/pro/business");
}
