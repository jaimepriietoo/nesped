import Stripe from "stripe";

let stripeInstance = null;

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  stripeInstance = new Stripe(
    process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
  );
  return stripeInstance;
}
