"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getUser } from "@/lib/auth";
import { getCurrentContractor } from "@/lib/contractor";
import { getSubscription, getProSubscription } from "@/lib/subscription";
import { PRO_PLAN } from "@/lib/constants";
import { setFlash } from "@/lib/flash";

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// One-time $20-off coupon that makes a first monthly bill $9.99 instead of
// $29.99. Prefers the pre-configured coupon id from the env; otherwise looks
// up (and on first use, creates) a well-known fallback coupon so the intro
// offer works before anything is set up in Stripe. Returns null on any
// failure so checkout degrades to plain full price rather than blocking a
// subscription.
async function proIntroCouponId(): Promise<string | null> {
  const envId = process.env.STRIPE_PRO_INTRO_COUPON_ID;
  if (envId) return envId;

  const fallbackId = "hearth-pro-intro";
  try {
    await stripe.coupons.retrieve(fallbackId);
    return fallbackId;
  } catch {
    // Not there yet: create it. If a concurrent checkout won the race (or
    // Stripe is unhappy), fall through to full price.
    try {
      const coupon = await stripe.coupons.create({
        id: fallbackId,
        name: "Pro intro: first month $9.99",
        amount_off: 2000,
        currency: "usd",
        duration: "once",
      });
      return coupon.id;
    } catch {
      return null;
    }
  }
}

// Start a Hearth Pro checkout (monthly or yearly). Uses the pre-created
// Stripe Price if one is configured, otherwise falls back to inline
// price_data so the flow works before Products/Prices are set up in Stripe.
export async function startProCheckoutAction(formData: FormData) {
  const plan =
    (formData.get("plan") as string) === "yearly" ? "pro_yearly" : "pro_monthly";

  const user = await getUser();
  if (!user) redirect("/signin");

  // Membership is a contractor perk bundle, so only a set-up company can buy
  // it. It never changes which leads anyone can see or apply to.
  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const priceId =
    plan === "pro_yearly"
      ? process.env.STRIPE_PRO_YEARLY_PRICE_ID
      : process.env.STRIPE_PRO_MONTHLY_PRICE_ID;

  const lineItem = priceId
    ? { price: priceId, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(
            (plan === "pro_yearly" ? PRO_PLAN.yearly : PRO_PLAN.monthly) * 100
          ),
          recurring: {
            interval: plan === "pro_yearly" ? ("year" as const) : ("month" as const),
          },
          product_data: { name: "Hearth Pro" },
        },
      };

  // getProSubscription is contractor-side only; the same user may also carry
  // a homeowner Plus row (a pro who is also a homeowner) on the same Stripe
  // customer.
  const existing = await getProSubscription();
  const homeownerSub = await getSubscription();
  const customerId =
    existing?.stripe_customer_id ?? homeownerSub?.stripe_customer_id ?? null;

  // Double-checkout guard, mirroring startPlusCheckoutAction: our
  // subscriptions row only appears after the Stripe webhook fires, so two
  // checkouts opened back-to-back could each mint a live Stripe
  // subscription. When we already know the Stripe customer, ask Stripe
  // directly whether a live Pro membership exists before creating another
  // one. A live homeowner Plus subscription doesn't count (that sub is a
  // different membership), so the homeowner-side row's subscription id is
  // excluded from the check. If no customer id exists yet, the webhook's
  // upsert-by-(user_id, side), fed by the metadata below, keeps our side to
  // one row.
  if (customerId) {
    let alreadyMember = false;
    try {
      const stripeSubs = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      alreadyMember = stripeSubs.data.some(
        (s) =>
          (s.status === "active" || s.status === "trialing") &&
          s.id !== homeownerSub?.stripe_subscription_id
      );
    } catch {
      // If Stripe is unreachable, fall through to checkout as before.
    }
    if (alreadyMember) {
      setFlash(
        "You already have a Hearth Pro membership. No need to buy it twice.",
        "info"
      );
      redirect("/pro/plus");
    }
  }

  // Brand-new Pro subscribers on the monthly plan get an intro month: $9.99
  // for the first month via a one-time coupon, then full price. Yearly is
  // already discounted, so no intro offer there. A coupon hiccup quietly
  // falls back to full price rather than blocking the checkout.
  const introOffer = plan === "pro_monthly" && !existing;
  let discounts: Array<{ coupon: string }> | undefined;
  if (introOffer) {
    const coupon = await proIntroCouponId();
    if (coupon) discounts = [{ coupon }];
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [lineItem],
    discounts,
    customer: customerId ?? undefined,
    customer_email: customerId ? undefined : user.email ?? undefined,
    metadata: {
      type: "pro_subscription",
      user_id: user.id,
      plan,
    },
    success_url: `${siteUrl()}/pro/plus?welcome=1`,
    cancel_url: `${siteUrl()}/pro/plus`,
  });

  if (session.url) redirect(session.url);
  redirect("/pro/plus");
}

// Shared body for cancel/resume: both flip cancel_at_period_end on the
// Pro-side subscription and differ only in the flag and the flash copy.
async function setProRenewal(opts: {
  cancelAtPeriodEnd: boolean;
  missingFlash: string;
  doneFlash: string;
}) {
  const user = await getUser();
  if (!user) redirect("/signin");

  // Pro-side row only: the homeowner Plus subscription is a different
  // membership and must never be canceled or resumed from here.
  const sub = await getProSubscription();
  if (!sub?.stripe_subscription_id) {
    setFlash(opts.missingFlash, "error");
    redirect("/pro/plus");
  }

  try {
    await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: opts.cancelAtPeriodEnd,
    });
  } catch {
    setFlash(
      "Something went sideways talking to Stripe. Try Manage billing instead.",
      "error"
    );
    redirect("/pro/plus");
  }

  setFlash(opts.doneFlash);
  revalidatePath("/pro/plus");
}

// Cancel the membership at period end. Nothing changes today: they keep every
// Pro perk through the time they already paid for, and it simply doesn't
// renew. Lead access is unaffected either way.
export async function cancelProMembershipAction() {
  await setProRenewal({
    cancelAtPeriodEnd: true,
    missingFlash: "No active membership to cancel.",
    doneFlash: "Your membership won't renew. You keep every perk until it ends.",
  });
}

// Undo a pending cancellation: the membership keeps renewing as before.
export async function resumeProMembershipAction() {
  await setProRenewal({
    cancelAtPeriodEnd: false,
    missingFlash: "No membership to resume.",
    doneFlash: "Welcome back. Your membership will keep renewing.",
  });
}

// Send the pro to Stripe's billing portal to manage or cancel their plan.
// The portal is customer-scoped, so fall back to the homeowner-side row's
// customer id when no Pro-side row exists yet (same Stripe customer).
export async function manageProBillingAction() {
  const sub = (await getProSubscription()) ?? (await getSubscription());
  if (!sub?.stripe_customer_id) redirect("/pro/plus");

  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${siteUrl()}/pro/plus`,
  });

  redirect(portal.url);
}
