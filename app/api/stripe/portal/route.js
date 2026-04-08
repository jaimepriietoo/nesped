import { createClient } from "@supabase/supabase-js";
import { getStripe } from "@/lib/stripe";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const stripe = getStripe();
    const body = await req.json();
    const { clientId } = body;

    if (!clientId) {
      return Response.json(
        { success: false, message: "Falta clientId" },
        { status: 400 }
      );
    }

    const supabase = getSupabase();

    const { data: clientRow, error } = await supabase
      .from("clients")
      .select("stripe_customer_id")
      .eq("id", clientId)
      .single();

    if (error || !clientRow?.stripe_customer_id) {
      return Response.json(
        {
          success: false,
          message: "Cliente sin stripe_customer_id en Supabase",
        },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: clientRow.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/portal`,
    });

    return Response.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error("Stripe portal error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error creando portal de facturación",
      },
      { status: 500 }
    );
  }
}