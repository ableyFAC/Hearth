"use server";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { getSubscription } from "@/lib/subscription";

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

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
          unit_amount: plan === "yearly" ? 5900 : 900,
          recurring: { interval: plan === "yearly" ? ("year" as const) : ("month" as const) },
          product_data: { name: "Hearth Plus" },
        },
      };

  const existing = await getSubscription();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem],
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
