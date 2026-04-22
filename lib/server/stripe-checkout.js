import Stripe from "stripe";
import { prisma } from "@/lib/prisma";

export const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

export const BASE_URL =
  process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function normalizePhone(phone = "") {
  return String(phone).replace(/[^\d+]/g, "").trim();
}

export async function resolveCheckoutProduct({ plan, productId }) {
  if (productId) {
    const product = await prisma.product.findUnique({
      where: { id: productId },
    });

    if (!product?.stripe_price_id) return null;

    return {
      priceId: product.stripe_price_id,
      productTier: product.tier || "basic",
      productName: product.name || "",
    };
  }

  const value = String(plan || "").toLowerCase();

  if (value === "premium") {
    return {
      priceId: process.env.STRIPE_PRICE_PREMIUM || "",
      productTier: "premium",
      productName: "Premium",
    };
  }

  if (value === "pro") {
    return {
      priceId: process.env.STRIPE_PRICE_PRO || "",
      productTier: "pro",
      productName: "Pro",
    };
  }

  return {
    priceId: process.env.STRIPE_PRICE_BASIC || "",
    productTier: value === "starter" ? "starter" : "basic",
    productName: value === "starter" ? "Starter" : "Basic",
  };
}

export async function resolveCheckoutConfig({ plan, productId }) {
  const product = await resolveCheckoutProduct({ plan, productId });

  if (!product?.priceId) {
    return null;
  }

  const price = await stripe.prices.retrieve(product.priceId);
  const mode = price?.type === "recurring" ? "subscription" : "payment";

  return {
    ...product,
    mode,
    isRecurring: mode === "subscription",
    interval: price?.recurring?.interval || null,
  };
}
