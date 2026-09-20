import { NextResponse } from "next/server";
import Stripe from "stripe";
import { processStripeWebhookEvent } from "@/lib/server/stripe-webhook-service";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerTextoLimitado } from "@/lib/server/security";

const stripe = new Stripe(
  process.env.STRIPE_SECRET_KEY || "sk_test_placeholder"
);

async function manejarPOST(req) {
  try {
    const cuerpo = await leerTextoLimitado(req, { maxBytes: 1024 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const rawBody = cuerpo.datos;
    const signature = req.headers.get("stripe-signature");
    const secret =
      process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!signature) {
      return NextResponse.json(
        { success: false, message: "Firma inválida" },
        { status: 400 }
      );
    }

    if (!secret) {
      return NextResponse.json(
        { success: false, message: "Webhook no disponible" },
        { status: 503 }
      );
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      return NextResponse.json(
        { success: false, message: "Firma inválida" },
        { status: 400 }
      );
    }

    await processStripeWebhookEvent(event);

    return NextResponse.json({ success: true });
  } catch (err) {
    logErrorSeguro("stripe.subscription_webhook_failed", err);
    return NextResponse.json(
      { success: false, message: "Error procesando webhook de suscripción" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.stripe.subscription-webhook.post", manejarPOST);
