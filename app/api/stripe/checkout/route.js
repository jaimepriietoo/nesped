import { getStripe } from "@/lib/stripe";

const PRICE_MAP = {
  basic: process.env.STRIPE_PRICE_BASIC,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

export async function POST(req) {
  try {
    const stripe = getStripe();
    const body = await req.json();
    const { clientId, plan = "pro", email = "" } = body;

    const price = PRICE_MAP[plan];

    if (!clientId || !price) {
      return Response.json(
        { success: false, message: "Faltan clientId o plan válido" },
        { status: 400 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/pricing`,
      client_reference_id: clientId,
      customer_email: email || undefined,
      metadata: {
        clientId,
        plan,
      },
      subscription_data: {
        metadata: {
          clientId,
          plan,
        },
      },
    });

    return Response.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return Response.json(
      { success: false, message: error.message || "Error creando checkout" },
      { status: 500 }
    );
  }
}