import { NextResponse } from "next/server";
import Stripe from "stripe";
import { processStripeWebhookEvent } from "@/lib/server/stripe-webhook-service";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

export async function POST(req) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("stripe-signature");
    const secret =
      process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature) {
      return NextResponse.json(
        { success: false, message: "Falta Stripe-Signature" },
        { status: 400 }
      );
    }

    if (!secret) {
      return NextResponse.json(
        { success: false, message: "Falta secret de webhook de Stripe" },
        { status: 500 }
      );
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (err) {
      console.error("Firma Stripe inválida:", err.message);
      return NextResponse.json(
        { success: false, message: "Firma inválida" },
        { status: 400 }
      );
    }

    await processStripeWebhookEvent(event);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Stripe subscription webhook error:", err);
    return NextResponse.json(
      { success: false, message: "Error procesando webhook de suscripción" },
      { status: 500 }
    );
  }
}
