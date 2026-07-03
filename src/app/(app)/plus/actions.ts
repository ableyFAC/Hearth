"use server";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { getSubscription } from "@/lib/subscription";

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// New members get their first month of monthly Plus for $4.99: a one-time
// coupon that takes $4.00 off the first invoice ($8.99 -> $4.99). Reuses a
// fixed-id coupon so we never create duplicates, and falls back to full price
// if Stripe can't provide it, so checkout is never blocked.
async function ensureIntroCoupon(): Promise<string | null> {
  const envId = process.env.STRIPE_INTRO_COUPON;
  if (envId) return envId;
  const id = "hearth_plus_intro_first_month";
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch {
    try {
      const c = await stripe.coupons.create({
        id,
        amount_off: 400,
        currency: "usd",
        duration: "once",
        name: "Hearth Plus first month",
      });
      return c.id;
    } catch {
      return null;
    }
  }
}

// Start a Hearth Plus checkout (monthly or yearly). Uses the pre-created
// Stripe Price if one is configured, otherwise falls back to inline
// price_data so the flow works before Products/Prices are set up in Stripe.
export async function startPlusCheckoutAction(formData: FormData) {
  const plan = (formData.get("plan") as string) === "yearly" ? "yearly" : "monthly";

  const user = await getUser();
  if (!user) redirect("/signin");

  const priceId =
    plan === "yearly"
      ? process.env.STRIPE_PRICE_PLUS_YEARLY
      : process.env.STRIPE_PRICE_PLUS_MONTHLY;

  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: plan === "yearly" ? 5899 : 899,
          recurring: { interval: plan === "yearly" ? ("year" as const) : ("month" as const) },
          product_data: { name: "Hearth Plus" },
        },
      };

  const existing = await getSubscription();

  // Brand-new subscribers on the monthly plan get the $4.99 first-month intro.
  const introCoupon =
    plan === "monthly" && !existing ? await ensureIntroCoupon() : null;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem],
    discounts: introCoupon ? [{ coupon: introCoupon }] : undefined,
    customer: existing?.stripe_customer_id ?? undefined,
    customer_email: existing?.stripe_customer_id ? undefined : user.email ?? undefined,
    metadata: {
      type: "plus_subscription",
      user_id: user.id,
      plan,
    },
    success_url: `${siteUrl()}/plus?welcome=1`,
    cancel_url: `${siteUrl()}/plus`,
  });

  if (session.url) redirect(session.url);
  redirect("/plus");
}

// Send the user to Stripe's billing portal to manage or cancel their plan.
export async function manageBillingAction() {
  const sub = await getSubscription();
  if (!sub?.stripe_customer_id) redirect("/plus");

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${siteUrl()}/plus`,
  });

  redirect(portal.url);
}
