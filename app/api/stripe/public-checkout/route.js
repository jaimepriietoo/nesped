import { NextResponse } from "next/server";
import {
  BASE_URL,
  resolveCheckoutConfig,
  stripe,
} from "@/lib/server/stripe-checkout";

const PUBLIC_PLANS = new Set(["starter", "pro"]);

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const plan = String(searchParams.get("plan") || "starter").toLowerCase();

    if (!PUBLIC_PLANS.has(plan)) {
      return NextResponse.redirect(`${BASE_URL}/pricing`, 303);
    }

    const resolved = await resolveCheckoutConfig({ plan });
    if (!resolved?.priceId) {
      return NextResponse.redirect(`${BASE_URL}/pricing?checkout=unavailable`, 303);
    }

    const sessionConfig = {
      mode: resolved.mode,
      line_items: [
        {
          price: resolved.priceId,
          quantity: 1,
        },
      ],
      success_url: `${BASE_URL}/portal/setup-account?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/pricing?checkout=cancelled`,
      phone_number_collection: {
        enabled: true,
      },
      metadata: {
        source: "public_pricing",
        product_tier: resolved.productTier,
        product_name: resolved.productName || "",
      },
    };

    if (resolved.mode === "payment") {
      sessionConfig.customer_creation = "always";
    } else {
      sessionConfig.subscription_data = {
        metadata: {
          source: "public_pricing",
          product_tier: resolved.productTier,
          product_name: resolved.productName || "",
        },
      };
    }

    const session = await stripe.checkout.sessions.create({
      ...sessionConfig,
    });

    if (!session.url) {
      return NextResponse.redirect(`${BASE_URL}/pricing?checkout=unavailable`, 303);
    }

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("GET /api/stripe/public-checkout error:", error);
    return NextResponse.redirect(`${BASE_URL}/pricing?checkout=error`, 303);
  }
}
