import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const supabase = getSupabase();

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      const clientId =
        session.client_reference_id || session.metadata?.clientId || null;
      const plan = session.metadata?.plan || null;

      if (clientId) {
        await supabase
          .from("clients")
          .update({
            stripe_customer_id: session.customer || null,
            stripe_subscription_id: session.subscription || null,
            stripe_price_id: plan,
            plan: plan || "pro",
            billing_status: "active",
          })
          .eq("id", clientId);
      }
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object;

      await supabase
        .from("clients")
        .update({
          billing_status: "canceled",
        })
        .eq("stripe_subscription_id", subscription.id);
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object;

      await supabase
        .from("clients")
        .update({
          billing_status: subscription.status || "active",
        })
        .eq("stripe_subscription_id", subscription.id);
    }

    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    return Response.json(
      { success: false, message: "Webhook processing error" },
      { status: 500 }
    );
  }
}