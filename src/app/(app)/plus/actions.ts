"use server";

import type Stripe from "stripe";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { getSubscription } from "@/lib/subscription";
import { setFlash } from "@/lib/flash";

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
          unit_amount: plan === "yearly" ? 3999 : 499,
          recurring: { interval: plan === "yearly" ? ("year" as const) : ("month" as const) },
          product_data: { name: "Hearth Plus" },
        },
      };

  const existing = await getSubscription();

  // Brand-new subscribers on the monthly plan get their first month free (a
  // 30-day trial). Yearly is already discounted, so no trial there.
  const freeTrial = plan === "monthly" && !existing;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem],
    subscription_data: freeTrial ? { trial_period_days: 30 } : undefined,
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

// Switch a monthly subscriber to yearly, effective immediately. Stripe swaps
// the subscription item to the yearly price and invoices right away with
// proration, so unused monthly time comes off the yearly charge as a credit.
// A trialing subscriber's trial ends now: yearly never carries a trial.
export async function upgradeToYearlyAction() {
  const user = await getUser();
  if (!user) redirect("/signin");

  // getSubscription is scoped to the signed-in user, so this Stripe
  // subscription id is theirs by construction.
  const sub = await getSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash("No active subscription to change.", "error");
    redirect("/plus");
  }
  if (sub.plan === "yearly") {
    setFlash("You're already on the yearly plan.", "info");
    redirect("/plus");
  }

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id
    );
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }
  const item = stripeSub.items.data[0];
  const yearlyPriceId = process.env.STRIPE_PRICE_PLUS_YEARLY;
  const productId =
    typeof item.price.product === "string"
      ? item.price.product
      : item.price.product.id;

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      items: [
        yearlyPriceId
          ? { id: item.id, price: yearlyPriceId, quantity: 1 }
          : {
              id: item.id,
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: 3999,
                recurring: { interval: "year" as const },
                product: productId,
              },
            },
      ],
      // Bill the yearly price today; unused monthly time becomes a credit.
      proration_behavior: "always_invoice",
      // A free-month trial doesn't carry over - yearly starts (and bills) now.
      ...(stripeSub.status === "trialing" ? { trial_end: "now" as const } : {}),
    });
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }

  // The webhook flips the stored plan once Stripe confirms the update.
  setFlash("You're on yearly now. Unused monthly time was credited.");
  revalidatePath("/plus");
}

// Schedule a yearly subscriber's switch to monthly at renewal. Nothing is
// charged or refunded now: they keep the yearly access they already paid for,
// and the subscription simply renews at $4.99/mo instead. Implemented as a
// Stripe subscription schedule - phase 1 mirrors the rest of the current paid
// year, phase 2 is one month of the monthly price (no trial, no proration),
// then the schedule releases and the subscription renews monthly on its own.
export async function downgradeToMonthlyAction() {
  const user = await getUser();
  if (!user) redirect("/signin");

  const sub = await getSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash("No active subscription to change.", "error");
    redirect("/plus");
  }
  if (sub.plan !== "yearly") {
    setFlash("You're already on the monthly plan.", "info");
    redirect("/plus");
  }

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id
    );
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }
  if (stripeSub.schedule) {
    setFlash("Your switch to monthly is already scheduled.", "info");
    redirect("/plus");
  }

  let schedule: Stripe.SubscriptionSchedule;
  try {
    schedule = await stripe.subscriptionSchedules.create({
      from_subscription: sub.stripe_subscription_id,
    });
  } catch {
    setFlash(
      "Couldn't schedule the switch. If your plan is set to cancel, use Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }

  // from_subscription yields a single phase covering the current (already
  // paid) period. Re-send it unchanged and append the monthly phase after it.
  const current = schedule.phases[0];
  const item = stripeSub.items.data[0];
  const monthlyPriceId = process.env.STRIPE_PRICE_PLUS_MONTHLY;
  const productId =
    typeof item.price.product === "string"
      ? item.price.product
      : item.price.product.id;

  try {
    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      proration_behavior: "none",
      phases: [
        {
          items: current.items.map((i) => ({
            price: typeof i.price === "string" ? i.price : i.price.id,
            quantity: i.quantity ?? undefined,
          })),
          start_date: current.start_date,
          end_date: current.end_date,
        },
        {
          items: [
            monthlyPriceId
              ? { price: monthlyPriceId, quantity: 1 }
              : {
                  quantity: 1,
                  price_data: {
                    currency: "usd",
                    unit_amount: 499,
                    recurring: { interval: "month" as const },
                    product: productId,
                  },
                },
          ],
          // One month at the new price, then release: the subscription
          // carries on renewing monthly by itself.
          duration: { interval: "month" as const, interval_count: 1 },
          proration_behavior: "none",
        },
      ],
    });
  } catch (err) {
    // Don't leave a half-built schedule attached to the subscription.
    await stripe.subscriptionSchedules.release(schedule.id).catch(() => {});
    throw err;
  }

  setFlash("Done. You'll switch to monthly at your renewal date.");
  revalidatePath("/plus");
}

// Undo a scheduled downgrade: release the schedule so the subscription keeps
// renewing yearly as if nothing happened.
export async function keepYearlyAction() {
  const user = await getUser();
  if (!user) redirect("/signin");

  const sub = await getSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash("No active subscription to change.", "error");
    redirect("/plus");
  }

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id
    );
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }
  const scheduleId =
    typeof stripeSub.schedule === "string"
      ? stripeSub.schedule
      : stripeSub.schedule?.id;
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId);
  }

  setFlash("You're keeping the yearly plan.");
  revalidatePath("/plus");
}

// Cancel the membership at period end. Nothing changes today: they keep every
// Plus benefit through the time they already paid for, and it simply doesn't
// renew. If a switch to monthly was scheduled, that schedule is released
// first, since a canceled plan has no next phase to switch into.
export async function cancelMembershipAction() {
  const user = await getUser();
  if (!user) redirect("/signin");

  const sub = await getSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash("No active subscription to cancel.", "error");
    redirect("/plus");
  }

  let stripeSub: Stripe.Subscription;
  try {
    stripeSub = await stripe.subscriptions.retrieve(
      sub.stripe_subscription_id
    );
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }
  const scheduleId =
    typeof stripeSub.schedule === "string"
      ? stripeSub.schedule
      : stripeSub.schedule?.id;
  if (scheduleId) {
    await stripe.subscriptionSchedules.release(scheduleId);
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }

  setFlash("Your membership won't renew. You keep Plus until it ends.");
  revalidatePath("/plus");
}

// Undo a pending cancellation: the membership keeps renewing as before.
export async function resumeMembershipAction() {
  const user = await getUser();
  if (!user) redirect("/signin");

  const sub = await getSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash("No subscription to resume.", "error");
    redirect("/plus");
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/plus");
  }

  setFlash("Welcome back. Your membership will keep renewing.");
  revalidatePath("/plus");
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
