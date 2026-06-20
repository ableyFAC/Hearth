import Stripe from "stripe";

// Server-side Stripe client. Uses the secret key from the environment; the
// hosted-checkout flow doesn't need the publishable key.
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "");
