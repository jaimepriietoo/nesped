import { NextResponse } from "next/server";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import {
  BASE_URL,
  resolveClientStripeCustomer,
  stripe,
} from "@/lib/server/stripe-utils";

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

    const { client, customerId } = await resolveClientStripeCustomer({
      clientId: ctx.clientId,
      email: ctx.userEmail || "",
      name: ctx.currentUser?.full_name || "",
      phone: ctx.currentUser?.phone || "",
      createIfMissing: false,
    });

    if (!client || !customerId) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Este cliente todavia no tiene una cuenta de facturacion activa en Stripe. Activa primero un plan para poder gestionarlo aqui.",
        },
        { status: 400 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
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
