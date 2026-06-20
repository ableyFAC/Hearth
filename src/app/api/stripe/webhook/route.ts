import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe needs the raw body + Node runtime to verify the signature.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  }

  return NextResponse.json({ received: true });
}
