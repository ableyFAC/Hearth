import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncConnectAccount, disconnectAccount } from "@/lib/stripeConnect";

// The CONNECT webhook: events about CONNECTED accounts, not about OakTend's
// own platform account.
//
// WHY THIS IS A SECOND ROUTE AND A SECOND SECRET. In the Stripe dashboard a
// webhook endpoint is either "Listen to events on your account" or "Listen to
// events on Connected accounts". They are separate endpoints with separate
// signing secrets, and an `account.updated` for a connected account is only
// ever delivered to the Connect one. So this cannot ride on
// src/app/api/stripe/webhook/route.ts: that endpoint's secret would reject
// these deliveries outright. New env var: STRIPE_CONNECT_WEBHOOK_SECRET.
//
// WHAT IT IS FOR. The contractors row holds a MIRROR of the connected
// account's state (migration 0164) - charges_enabled, payouts_enabled,
// details_submitted, currently_due, disabled_reason. Stripe is the authority;
// this route is how the mirror stays honest, and the on-return sync in
// /pro/payouts is the backstop for the seconds it can lag by.
//
// It moves NO money and grants nothing. The worst a forged delivery could do
// is lie about a pro's payout readiness - which, once step 2 ships, is exactly
// the lie that would let an invoice go out against an account Stripe will not
// pay into. Hence the same fail-closed signature posture the money webhook has.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Claim a Connect event id for exactly one side effect, ever.
//
// Same processed_stripe_events table (migration 0060) and the same shape as
// claimRiskEvent in the main webhook, with its own NAMESPACE so it can never
// collide with the money paths' claims: they claim the bare event id, the risk
// paths claim "risk:<id>", and this claims "connect:<id>".
//
// Unlike the money paths this fails OPEN on an unexpected error. The write it
// guards is idempotent (syncConnectAccount writes the same values for the same
// account object, and its stripe_account_synced_at filter refuses anything
// stale), so doing it twice is harmless, while refusing to do it at all leaves
// a pro looking at a stale "finish setting up payouts" card forever. Only the
// 23505 duplicate - the claim genuinely losing to an earlier delivery - stops
// the handler.
async function claimConnectEvent(
  admin: any,
  eventId: string,
  kind: string
): Promise<boolean> {
  try {
    const { error } = await admin
      .from("processed_stripe_events")
      .insert({ event_id: `connect:${eventId}`, kind });
    if (!error) return true;
    if (error.code === "23505") return false;
    console.error("claimConnectEvent failed:", error.message ?? error);
    return true;
  } catch (err) {
    console.error("claimConnectEvent threw:", err);
    return true;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  // FAIL CLOSED ON A MISSING SECRET, BEFORE constructEvent EVER RUNS.
  //
  // Exactly the rationale src/app/api/stripe/webhook/route.ts gives: stripe-node
  // does not object to an empty signing secret, it computes HMAC-SHA256 keyed
  // by the empty string and compares. Anyone can compute that, so an
  // unconfigured deployment does not reject forged Connect webhooks - it
  // accepts them, and the payout-readiness mirror below is written from
  // attacker-chosen JSON.
  //
  // 500, not 400: this is OakTend's own misconfiguration, and a 5xx makes
  // Stripe keep the event queued and redeliver once the secret is set, instead
  // of marking real events permanently failed.
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error(
      "STRIPE_CONNECT_WEBHOOK_SECRET is not set - refusing every Stripe Connect webhook. " +
        "An empty secret verifies nothing (see docs/GO-LIVE-WIRING.md)."
    );
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  if (event.type === "account.updated") {
    const admin = createAdminClient();
    // Claim FIRST, write second. A redelivery that loses the claim returns
    // 200 having touched nothing.
    if (!(await claimConnectEvent(admin, event.id, "connect_account_updated"))) {
      return NextResponse.json({ received: true, duplicate: true });
    }
    // event.created is seconds; the mirror's out-of-order guard compares
    // timestamps, so the event's own clock is what must be passed - not now().
    await syncConnectAccount(
      event.data.object as Stripe.Account,
      new Date(event.created * 1000)
    );
    return NextResponse.json({ received: true });
  }

  if (event.type === "account.application.deauthorized") {
    // On a Connect event, `event.account` IS the connected account id (the
    // data object here is the Application, not the Account, so reading .id off
    // it would store the platform's application id). The fallback only exists
    // because a payload shape that ever put the account id on the object
    // itself would otherwise silently disconnect nobody.
    const accountId =
      event.account ?? ((event.data.object as any)?.id as string | undefined);
    await disconnectAccount(accountId);
    return NextResponse.json({ received: true });
  }

  // Everything else: a 200 so Stripe stops retrying, and no DB contact at all.
  return NextResponse.json({ received: true, ignored: event.type });
}
