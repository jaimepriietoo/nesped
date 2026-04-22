import { headers } from "next/headers";
import { stripe } from "@/lib/server/stripe-utils";
import { processStripeWebhookEvent } from "@/lib/server/stripe-webhook";
 
export async function POST(req) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature") || "";
 
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return Response.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }
 
  try {
    await processStripeWebhookEvent(event);
    return Response.json({ received: true });
  } catch (err) {
    console.error("Webhook processing error:", err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
 
export const config = { api: { bodyParser: false } };