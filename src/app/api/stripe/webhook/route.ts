import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRO_DEPOSIT_BOOST_PTS } from "@/lib/constants";

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
// 0036 hasn't run on the live DB yet (no side column / no composite unique),
// retry once with the pre-0036 payload and the old user_id conflict target
// so checkouts keep working either way.
async function upsertSubscriptionRow(
  admin: any,
  row: Record<string, unknown>,
  side: "homeowner" | "pro"
) {
  const { error } = await admin
    .from("subscriptions")
    .upsert({ ...row, side }, { onConflict: "user_id,side" });
  if (error) {
    await admin.from("subscriptions").upsert(row, { onConflict: "user_id" });
  }
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
      const cents = Number(meta.deposit_cents) || 0;
      if (cents > 0) {
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
            const { data: proSub } = await (admin as any)
              .from("subscriptions")
              .select("plan, status, current_period_end")
              .eq("user_id", proRow.user_id)
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

        // Credits cash, computes + grants the tier bonus, and writes the ledger.
        const depositArgs = {
          p_contractor: meta.contractor_id,
          p_deposit_cents: cents,
        };
        let runUnboosted = boostPts <= 0;
        if (boostPts > 0) {
          const { error } = await (admin as any).rpc("apply_deposit", {
            ...depositArgs,
            p_bonus_boost_pts: boostPts,
          });
          if (error) {
            // Graceful degradation, but ONLY for the missing-function
            // fingerprint (migration 0032 not on the live DB yet, so the
            // boosted signature doesn't exist, same detection as
            // rehireProAction). Any other error means the boosted call may
            // have already applied the deposit, and a blind retry risks
            // double-crediting: losing the boost beats applying it twice.
            const msg = error.message ?? "";
            const missingFn =
              error.code === "PGRST202" ||
              error.code === "42883" ||
              (/apply_deposit/i.test(msg) &&
                /(does not exist|schema cache|not find)/i.test(msg));
            if (missingFn) {
              runUnboosted = true;
            } else {
              console.error(
                "apply_deposit (boosted) failed, NOT retrying:",
                msg || error
              );
            }
          }
        }
        if (runUnboosted) {
          await (admin as any).rpc("apply_deposit", depositArgs);
        }
      }
    }

    if (meta.type === "pro_subscription" && meta.user_id && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const admin = createAdminClient();
      const interval = planFromItems(subscription);
      await upsertSubscriptionRow(
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
      await upsertSubscriptionRow(
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
          const yearly = subRow.plan === "pro_yearly";
          // Credit is keyed off the PLAN, never the amount paid: the $9.99
          // intro first month earns the full $10 on purpose, and the yearly
          // price change didn't touch the $120. The invoice id is the
          // idempotency key: Stripe retries and duplicate deliveries reuse
          // it, while every new cycle mints a fresh one. A period-start
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
