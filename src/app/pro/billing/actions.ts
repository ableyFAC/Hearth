"use server";

import { redirect } from "next/navigation";
import { stripe } from "@/lib/stripe";
import { getCurrentContractor } from "@/lib/contractor";

const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

// Deposit cash into the wallet. The bonus tier is computed + granted in the DB
// (apply_deposit) when the Stripe webhook confirms payment.
export async function depositAction(formData: FormData) {
  const dollars = Number(formData.get("amount"));
  const cents = Math.round(dollars * 100);
  if (!cents || cents < 500) redirect("/pro/billing"); // $5 minimum to deposit
  // $2,000 maximum per deposit. The amount that lands in Stripe checkout
  // metadata (and therefore what apply_deposit ultimately credits) is set
  // server-side right here, so this cap isn't itself forgeable - it exists to
  // bound how much a single chargeback can claw back through, on top of the
  // reverse_deposit wallet-reversal handling in the Stripe webhook.
  if (cents > 200_000) redirect("/pro/billing"); // $2,000 maximum per deposit

  const contractor = await getCurrentContractor();
  if (!contractor) redirect("/pro/onboarding");

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: cents,
          product_data: { name: "Hearth wallet deposit" },
        },
      },
    ],
    metadata: {
      type: "deposit",
      contractor_id: contractor.id,
      deposit_cents: String(cents),
    },
    success_url: `${siteUrl()}/pro/billing?paid=1`,
    cancel_url: `${siteUrl()}/pro/billing?canceled=1`,
  });

  if (session.url) redirect(session.url);
  redirect("/pro/billing");
}
