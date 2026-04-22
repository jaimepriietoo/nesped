import { NextResponse } from "next/server";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { BASE_URL, stripe } from "@/lib/server/stripe-utils";

export async function POST() {
  try {
    const ctx = await getPortalContext();

    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para abrir billing" },
        { status: 403 }
      );
    }

    const { data: client, error } = await ctx.supabase
      .from("clients")
      .select("stripe_customer_id")
      .eq("id", ctx.clientId)
      .single();

    if (error || !client?.stripe_customer_id) {
      return NextResponse.json(
        {
          success: false,
          message: error?.message || "Cliente sin stripe_customer_id",
        },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${BASE_URL}/portal`,
    });

    return NextResponse.json({
      success: true,
      url: session.url,
    });
  } catch (error) {
    console.error("POST /api/stripe/portal error:", error);
    return NextResponse.json(
      { success: false, message: "No se pudo abrir el portal de facturacion" },
      { status: 500 }
    );
  }
}
