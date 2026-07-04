import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

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
        // Credits cash, computes + grants the tier bonus, and writes the ledger.
        await (admin as any).rpc("apply_deposit", {
          p_contractor: meta.contractor_id,
          p_deposit_cents: cents,
        });
      }
    }

    if (meta.type === "plus_subscription" && meta.user_id && session.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        session.subscription as string
      );
      const admin = createAdminClient();
      await (admin as any).from("subscriptions").upsert(
        {
          user_id: meta.user_id,
          stripe_customer_id: session.customer ?? null,
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          plan: meta.plan ?? planFromItems(subscription),
          current_period_end: periodEnd(subscription),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
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
    const plan = planFromItems(subscription);
    const admin = createAdminClient();
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

  return NextResponse.json({ received: true });
}
