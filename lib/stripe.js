import Stripe from "stripe";

let stripeInstance = null;

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("Falta STRIPE_SECRET_KEY");
  }

  stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeInstance;
}