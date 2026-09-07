import { NextResponse } from "next/server";
import { urlDeSitio } from "@/lib/server/sitio";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";
import {
  resolveClientStripeCustomer,
  stripe,
} from "@/lib/server/stripe-utils";

export async function POST(req) {
  try {
    // La devolución tiene que ser al sitio, no a BASE_URL, que apunta al
    // servidor de voz: quien pagaba acababa en un 404 de Railway.
    const BASE_URL = urlDeSitio(req);

    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para abrir facturación"
    );
    if (sameOriginError) return sameOriginError;

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
