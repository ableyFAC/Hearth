import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_DEPOSIT_BOOST_PTS } from "@/lib/constants";
import { isMissingSchemaError } from "@/lib/dbErrors";

// Stripe needs the raw body + Node runtime to verify the signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// current_period_end lives on the subscription in older API versions and on
// the subscription item in newer ones - read whichever is present.
function periodEnd(subscription: any): string | null {
  const ts =
    subscription?.current_period_end ??
    subscription?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

// Derive the stored plan ("monthly"/"yearly") from the price actually on the
// subscription. It changes on an immediate upgrade and again when a scheduled
// downgrade's monthly phase kicks in at period end.
function planFromItems(subscription: any): string | null {
  const interval = subscription?.items?.data?.[0]?.price?.recurring?.interval;
  if (interval === "year") return "yearly";
  if (interval === "month") return "monthly";
  return null;
}

// One subscriptions row per (user, side) since migration 0036: a user can
// hold homeowner Plus AND a Pro membership at once, and the two checkout
// branches must never clobber each other's row. Graceful degradation: if
// 0036 hasn't run on the live DB yet (no side column / no composite unique,
// which surfaces as a missing-schema error), retry once with the pre-0036
// payload and the old user_id conflict target so checkouts keep working
// either way. Any OTHER first-attempt error (transient network, RLS, bad
// payload) must NOT fall back: post-0036 the user_id conflict target has no
// unique constraint, so the fallback would always fail with 42P10 and mask
// the real error. Returns the final error (null on success) so the caller
// can 500 and let Stripe redeliver instead of silently losing a paid
// membership; both upserts are idempotent by conflict target, so a
// redelivery after a partial success is harmless.
async function upsertSubscriptionRow(
  admin: any,
  row: Record<string, unknown>,
  side: "homeowner" | "pro"
): Promise<{ message?: string } | null> {
  const { error } = await admin
    .from("subscriptions")
    .upsert({ ...row, side }, { onConflict: "user_id,side" });
  if (!error) return null;
  if (!isMissingSchemaError(error)) return error;
  const { error: fallbackError } = await admin
    .from("subscriptions")
    .upsert(row, { onConflict: "user_id" });
  return fallbackError ?? null;
}

// True when an RPC error is the "this signature isn't on the live DB yet"
// fingerprint, so a call can fall back to an older overload instead of failing.
function isMissingFn(error: any, fn: string): boolean {
  const msg = error?.message ?? "";
  return (
    error?.code === "PGRST202" ||
    error?.code === "42883" ||
    (new RegExp(fn, "i").test(msg) &&
      /(does not exist|schema cache|not find)/i.test(msg))
  );
}

// Apply a deposit exactly once. Prefers the event-keyed 0058 signature, so a
// duplicated Stripe delivery of the same checkout.session.completed becomes a
// no-op in the database. If the live DB predates 0058 (or 0032), the call
// degrades to the older overloads, which still credit correctly but without
// idempotency - acceptable because Stripe live mode, and therefore any real
// duplicate delivery, is not enabled until the migration is applied.
//
// Failure handling splits by rung. A non-missing-function error on the
// event-keyed rung means the 0058 signature exists, and apply_deposit claims
// p_event_id in processed_stripe_events inside the same transaction as the
// credit, so forcing a Stripe redelivery (HTTP 500) is provably safe: if the
// first attempt actually committed, the retry is a no-op. Returns
// { retry: true } so the caller does exactly that instead of ACKing 200 and
// silently losing a paid deposit. On the older, non-keyed overloads a retry
// COULD double-credit, so those keep the log-and-ACK behavior
// ({ retry: false }): never double-credit beats never lose.
async function applyDepositOnce(
  admin: any,
  contractorId: string,
  cents: number,
  boostPts: number,
  eventId: string
): Promise<{ retry: boolean }> {
  const ladder: Record<string, unknown>[] = [
    { p_contractor: contractorId, p_deposit_cents: cents, p_bonus_boost_pts: boostPts, p_event_id: eventId },
    { p_contractor: contractorId, p_deposit_cents: cents, p_bonus_boost_pts: boostPts },
    { p_contractor: contractorId, p_deposit_cents: cents },
  ];
  for (let i = 0; i < ladder.length; i++) {
    const { error } = await admin.rpc("apply_deposit", ladder[i]);
    if (!error) return { retry: false };
    if (isMissingFn(error, "apply_deposit") && i < ladder.length - 1) {
      continue; // older DB: try the next-oldest overload
    }
    if (i === 0) {
      console.error(
        "apply_deposit failed on the event-keyed call, asking Stripe to redeliver:",
        error.message ?? error
      );
      return { retry: true };
    }
    console.error("apply_deposit failed, not retrying:", error.message ?? error);
    return { retry: false };
  }
  return { retry: false }; // unreachable: the loop always returns
}

// Credit a deposit checkout session: look up the Pro boost, then apply the
// deposit exactly once. Shared by checkout.session.completed (instant
// methods) and checkout.session.async_payment_succeeded (delayed methods);
// each event type carries its own event id, and only ONE of them ever has
// payment_status "paid" for a given session, so the credit lands exactly
// once. Returns { retry: true } when the caller should 500 so Stripe
// redelivers a safely-retryable failed credit.
async function creditDepositSession(
  session: any,
  eventId: string
): Promise<{ retry: boolean }> {
  const meta = session.metadata ?? {};
  if (meta.type !== "deposit" || !meta.contractor_id) return { retry: false };

  // Delayed-notification methods (ACH debit etc.) fire completed with
  // payment_status "unpaid" and only settle later. Never credit money that
  // hasn't arrived: the async_payment_succeeded event re-enters here with
  // payment_status "paid" once it has.
  if (session.payment_status !== "paid") return { retry: false };

  const cents = Number(meta.deposit_cents) || 0;
  if (cents <= 0) return { retry: false };
  const admin = createAdminClient();

  // Hearth Pro members earn extra points on the deposit bonus. The
  // lookup is best-effort: any hiccup here means "no boost", never a
  // failed deposit.
  let boostPts = 0;
  try {
    const { data: proRow } = await (admin as any)
      .from("contractors")
      .select("user_id")
      .eq("id", meta.contractor_id)
      .maybeSingle();
    if (proRow?.user_id) {
      // Filter to the pro row explicitly. Since migration 0036 a user can
      // hold BOTH homeowner Plus and a Pro membership, so a bare
      // .eq(user_id).maybeSingle() would throw on two rows and silently
      // cost a paying Pro member their boost. A user holds at most one
      // pro_ plan, so this stays single-row (and works pre-0036 too).
      const { data: proSub } = await (admin as any)
        .from("subscriptions")
        .select("plan, status, current_period_end")
        .eq("user_id", proRow.user_id)
        .like("plan", "pro_%")
        .maybeSingle();
      const activePro =
        proSub?.plan?.startsWith("pro_") &&
        (proSub.status === "active" || proSub.status === "trialing") &&
        (!proSub.current_period_end ||
          new Date(proSub.current_period_end) > new Date());
      if (activePro) boostPts = PRO_DEPOSIT_BOOST_PTS;
    }
  } catch {
    // Boost is a perk, deposits are not: swallow and continue unboosted.
  }

  // Credits cash, computes + grants the tier bonus, writes the ledger,
  // and (on the 0058 signature) dedups on the Stripe event id so a
  // duplicate delivery can't double-credit.
  return applyDepositOnce(
    admin,
    meta.contractor_id,
    cents,
    Math.max(boostPts, 0),
    eventId
  );
}

// Billing interval read off a paid invoice's own line items, for deciding
// the membership-credit amount. The recurring interval lives at
// line.price.recurring.interval in older Stripe API versions, line.plan on
// legacy shapes, and under line.pricing on newer ones: read whichever is
// present. Proration lines are skipped when a non-proration line is
// readable: a monthly-to-yearly upgrade invoice carries the old monthly
// price on its proration credit line, and only the non-proration charge
// line carries the interval that was actually bought.
function invoiceLineInterval(invoice: any): "year" | "month" | null {
  const readInterval = (line: any) =>
    line?.price?.recurring?.interval ??
    line?.plan?.interval ??
    line?.pricing?.price_details?.recurring?.interval ??
    null;
  const isProration = (line: any) =>
    line?.proration === true ||
    line?.parent?.subscription_item_details?.proration === true;
  let prorated: "year" | "month" | null = null;
  for (const line of invoice?.lines?.data ?? []) {
    const interval = readInterval(line);
    if (interval !== "year" && interval !== "month") continue;
    if (!isProration(line)) return interval;
    if (!prorated) prorated = interval;
  }
  return prorated;
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature") ?? "";

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET ?? ""
    );
  } catch {
    return new NextResponse("Bad signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const meta = session.metadata ?? {};

    if (meta.type === "deposit" && meta.contractor_id) {
      const { retry } = await creditDepositSession(session, event.id);
      if (retry) {
        // Safely-retryable credit failure (see applyDepositOnce): non-2xx
        // makes Stripe redeliver instead of marking a paid-but-uncredited
        // deposit consumed forever.
        return NextResponse.json({ error: "deposit credit failed" }, { status: 500 });
      }
    }

    if (meta.type === "pro_subscription" && meta.user_id && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const admin = createAdminClient();
      const interval = planFromItems(subscription);
      const upsertError = await upsertSubscriptionRow(
        admin,
        {
          user_id: meta.user_id,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          // Contractor plans carry the pro_ prefix so they never satisfy the
          // homeowner Plus checks (and vice versa).
          plan: meta.plan ?? (interval ? `pro_${interval}` : null),
          current_period_end: periodEnd(subscription),
          updated_at: new Date().toISOString(),
        },
        "pro"
      );
      if (upsertError) {
        // Without this row the membership never activates and no later event
        // heals it (updates match by stripe_subscription_id, invoices skip
        // row-less subscriptions). 500 makes Stripe redeliver; the upsert is
        // idempotent and the credit grant below is keyed on the invoice id,
        // so a retry can't double anything.
        console.error(
          "subscriptions upsert failed for pro checkout:",
          upsertError.message ?? upsertError
        );
        return NextResponse.json({ error: "subscription upsert failed" }, { status: 500 });
      }

      // First-cycle wallet credit. This event and the first
      // invoice.payment_succeeded race each other, and the invoice branch
      // below can only map an invoice to a user through the subscriptions row
      // upserted above. Granting here too, keyed on the SAME invoice id, means
      // the credit lands whichever event arrives first: the RPC's idempotency
      // guard makes the loser a no-op.
      try {
        const plan = meta.plan ?? (interval ? `pro_${interval}` : null);
        const latest = (subscription as any).latest_invoice;
        const invoiceId = typeof latest === "string" ? latest : latest?.id ?? null;
        if (typeof plan === "string" && plan.startsWith("pro_") && invoiceId) {
          const yearly = plan === "pro_yearly";
          // Keyed off the plan, never the amount paid: the $9.99 intro first
          // month still earns the full $10 on purpose.
          const { error } = await (admin as any).rpc("grant_membership_credit", {
            p_user: meta.user_id,
            p_amount_cents: yearly ? 12000 : 1000,
            p_period_key: invoiceId,
            p_expiry_days: yearly ? 400 : 60,
          });
          // Graceful degradation: if migration 0034 isn't on the live DB yet,
          // the RPC doesn't exist. The perk can wait; the membership can't.
          if (error) {
            console.error("grant_membership_credit failed:", error.message ?? error);
          }
        }
      } catch (err) {
        // The credit is a perk, the subscription is not: log and continue.
        console.error("grant_membership_credit failed:", err);
      }
    }

    if (meta.type === "plus_subscription" && meta.user_id && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const admin = createAdminClient();
      const upsertError = await upsertSubscriptionRow(
        admin,
        {
          user_id: meta.user_id,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          plan: meta.plan ?? planFromItems(subscription),
          current_period_end: periodEnd(subscription),
          updated_at: new Date().toISOString(),
        },
        "homeowner"
      );
      if (upsertError) {
        // Same reasoning as the pro branch: no row means Plus never
        // activates and nothing heals it. 500 so Stripe redelivers the
        // idempotent upsert.
        console.error(
          "subscriptions upsert failed for plus checkout:",
          upsertError.message ?? upsertError
        );
        return NextResponse.json({ error: "subscription upsert failed" }, { status: 500 });
      }
    }
  }

  // Delayed-notification payment methods (e.g. ACH debit): the checkout
  // session completes with payment_status "unpaid" and the money only settles
  // later. Credit the deposit when Stripe confirms settlement; the 0058 dedup
  // keys on THIS event's id, and creditDepositSession skipped the earlier
  // unpaid completed event, so the credit applies exactly once.
  if (event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object as any;
    const { retry } = await creditDepositSession(session, event.id);
    if (retry) {
      return NextResponse.json({ error: "deposit credit failed" }, { status: 500 });
    }
  }

  // The delayed payment never settled (e.g. ACH insufficient funds). Nothing
  // was credited (the unpaid completed event was skipped above), so there is
  // nothing to claw back: log loudly for support visibility and ACK.
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object as any;
    const failMeta = session.metadata ?? {};
    if (failMeta.type === "deposit") {
      console.error(
        "checkout.session.async_payment_failed: deposit never settled for contractor",
        failMeta.contractor_id ?? "(unknown)",
        "session",
        session.id
      );
    }
  }

  if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.deleted"
  ) {
    const subscription = event.data.object as any;
    const status =
      event.type === "customer.subscription.deleted"
        ? "canceled"
        : subscription.status;
    const interval = planFromItems(subscription);
    const admin = createAdminClient();
    // planFromItems only sees the billing interval, so on its own it would
    // rewrite a contractor's "pro_monthly" as "monthly". Check the stored row
    // (matched by stripe_subscription_id, so this only ever touches the one
    // side that Stripe subscription belongs to) and keep pro_ plans pro_.
    // Only the two standard names are re-derived from the interval (that's
    // how a plan switch lands); any other pro_ plan name is preserved as-is
    // rather than being normalized to pro_monthly/pro_yearly.
    let plan: string | null = interval;
    if (interval) {
      const { data: existing } = await (admin as any)
        .from("subscriptions")
        .select("plan")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      const existingPlan: string | null = existing?.plan ?? null;
      if (existingPlan?.startsWith("pro_")) {
        plan =
          existingPlan === "pro_monthly" || existingPlan === "pro_yearly"
            ? `pro_${interval}`
            : existingPlan;
      }
    }
    await (admin as any)
      .from("subscriptions")
      .update({
        status,
        // Only overwrite the plan when the payload carries items we can read.
        ...(plan ? { plan } : {}),
        current_period_end: periodEnd(subscription),
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id);
  }

  // Recurring Pro perk: every paid billing cycle grants bonus lead credit
  // ($10 monthly, $120 up front yearly). Subscription invoices only, and only
  // real cycles: proration and other mid-cycle update invoices don't count.
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object as any;
    // The subscription id lives at invoice.subscription in older Stripe API
    // versions and under invoice.parent.subscription_details in newer ones:
    // read whichever is present.
    const rawSub =
      invoice.subscription ??
      invoice.parent?.subscription_details?.subscription ??
      null;
    const subscriptionId = typeof rawSub === "string" ? rawSub : rawSub?.id ?? null;
    // subscription_create and subscription_cycle are the normal cycles.
    // subscription_update counts too when money actually moved (amount_paid
    // over zero): a monthly-to-yearly upgrade bills the $120 on an update
    // invoice and must earn its credit. Idempotency by invoice id already
    // prevents double grants on retries and duplicate deliveries.
    const isGrantableReason =
      invoice.billing_reason === "subscription_create" ||
      invoice.billing_reason === "subscription_cycle" ||
      (invoice.billing_reason === "subscription_update" &&
        (invoice.amount_paid ?? 0) > 0);
    if (subscriptionId && isGrantableReason) {
      // Best-effort from here down: the webhook must never fail over a perk.
      try {
        const admin = createAdminClient();
        // Match ONLY by stripe_subscription_id. A customer-id fallback would
        // be side-blind: one Stripe customer can carry both the homeowner
        // Plus and the Pro subscription, and a Plus invoice must never grant
        // pro credit off whichever row the customer lookup happened to hit.
        const { data: subRow } = await (admin as any)
          .from("subscriptions")
          .select("user_id, plan")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (!subRow?.user_id) {
          console.error(
            "invoice.payment_succeeded: no subscriptions row for",
            subscriptionId,
            "- skipping membership credit"
          );
        }
        if (subRow?.user_id && subRow?.plan?.startsWith("pro_")) {
          // The amount comes from the interval on the PAID INVOICE's own
          // lines, never the stored plan: on a portal plan switch the
          // subscriptions row is only flipped by customer.subscription.updated,
          // Stripe does not guarantee event ordering (see the race notes in
          // the checkout branch), and the invoice-id idempotency key would
          // lock a wrong stale-plan amount in forever. The stored plan stays
          // as the gate above (Pro vs homeowner Plus) and as the fallback
          // when no line carries a readable interval.
          const lineInterval = invoiceLineInterval(invoice);
          const yearly = lineInterval
            ? lineInterval === "year"
            : subRow.plan === "pro_yearly";
          // Credit is keyed off the BILLING INTERVAL, never the amount paid:
          // the $9.99 intro first month earns the full $10 on purpose, and
          // the yearly price change didn't touch the $120. The invoice id is
          // the idempotency key: Stripe retries and duplicate deliveries
          // reuse it, while every new cycle mints a fresh one. A period-start
          // YYYY-MM key would wrongly collapse two legitimate grants landing
          // in the same month (e.g. a monthly-to-yearly switch) and depends
          // on our own clock rendering; the invoice id does neither.
          const { error } = await (admin as any).rpc("grant_membership_credit", {
            p_user: subRow.user_id,
            p_amount_cents: yearly ? 12000 : 1000,
            p_period_key: invoice.id,
            p_expiry_days: yearly ? 400 : 60,
          });
          // Graceful degradation: if migration 0034 isn't on the live DB yet,
          // the RPC doesn't exist. Log and move on; never 500 over this.
          if (error) {
            console.error("grant_membership_credit failed:", error.message ?? error);
          }
        }
      } catch (err) {
        console.error("grant_membership_credit failed:", err);
      }
    }
  }

  return NextResponse.json({ received: true });
}
