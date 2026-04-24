import Stripe from "stripe";
import { logEvent } from "@/lib/server/observability.mjs";

let stripeInstance = null;
let hasLoggedMissingStripe = false;

function createMissingStripeClient() {
  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error("Falta STRIPE_SECRET_KEY");
        };
      },
    }
  );
}

export function getStripe() {
  if (stripeInstance) return stripeInstance;

  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    if (!hasLoggedMissingStripe) {
      hasLoggedMissingStripe = true;
      logEvent("warn", "stripe.missing_env", {
        hasSecretKey: false,
      });
    }
    stripeInstance = createMissingStripeClient();
    return stripeInstance;
  }

  stripeInstance = new Stripe(secretKey);
  return stripeInstance;
}
