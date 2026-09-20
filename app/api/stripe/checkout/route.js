import { NextResponse } from "next/server";
import { urlDeSitio } from "@/lib/server/sitio";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { validar } from "@/lib/server/esquemas";
import { CheckoutStripe } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { exigirContactoPropio } from "@/lib/server/pertenencia";
import {
  getClientBillingState,
  normalizePhone,
  resolveClientStripeCustomer,
  resolveCheckoutConfig,
  stripe,
} from "@/lib/server/stripe-utils";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  try {
    // La devolución tiene que ser al sitio, no a BASE_URL, que apunta al
    // servidor de voz: quien pagaba acababa en un 404 de Railway.
    const BASE_URL = urlDeSitio(req);

    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para abrir el checkout"
    );
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();

    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "billing.checkout", ctx.permissions)) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para crear un checkout" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "stripe-checkout", limit: 20, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(CheckoutStripe, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const body = entrada.datos;
    const {
      leadId,
      plan = "pro",
      productId = null,
      phone = "",
      email = "",
      name = "",
    } = body || {};

    if (leadId) {
      const denied = await exigirContactoPropio({ supabase: ctx.supabase, clientId: ctx.clientId, leadId });
      if (denied) return denied;
    }
    const config = await resolveCheckoutConfig({ plan, productId });

    if (!config?.priceId) {
      return NextResponse.json(
        { success: false, message: "No se encontro un precio valido en Stripe" },
        { status: 400 }
      );
    }

    const isClientPlanCheckout = !leadId;
    if (isClientPlanCheckout && !puede(ctx.role, "billing.manage", ctx.permissions)) {
      return NextResponse.json({ success: false, message: "Sin permisos de facturación" }, { status: 403 });
    }

    const metadata = {
      client_id: ctx.clientId,
      lead_id: leadId || "",
      phone: normalizePhone(phone),
      product_tier: config.productTier,
      product_name: config.productName || "",
      lead_name: name || "",
      created_by: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      client_plan_checkout: isClientPlanCheckout ? "true" : "false",
    };

    let customerId = "";

    if (isClientPlanCheckout) {
      const { hasManagedSubscription } = await getClientBillingState(ctx.clientId);

      if (hasManagedSubscription) {
        const existingCustomer = await resolveClientStripeCustomer({
          clientId: ctx.clientId,
          email: email || ctx.userEmail || "",
          name: name || ctx.currentUser?.full_name || "",
          phone: phone || ctx.currentUser?.phone || "",
          createIfMissing: false,
        });

        if (existingCustomer.customerId) {
          const billingSession = await stripe.billingPortal.sessions.create({
            customer: existingCustomer.customerId,
            return_url: `${BASE_URL}/portal`,
          });

          return NextResponse.json({
            success: true,
            url: billingSession.url,
            destination: "billing_portal",
            message:
              "Este cliente ya tiene un plan activo. Te llevamos a facturacion para gestionarlo o ampliarlo sin duplicar suscripciones.",
          });
        }
      }

      const customer = await resolveClientStripeCustomer({
        clientId: ctx.clientId,
        email: email || ctx.userEmail || "",
        name:
          name ||
          ctx.currentUser?.full_name ||
          ctx.currentUser?.email ||
          ctx.userEmail ||
          "",
        phone: phone || ctx.currentUser?.phone || "",
        createIfMissing: true,
      });

      customerId = customer.customerId || "";
    }

    const sessionConfig = {
      mode: config.mode,
      line_items: [
        {
          price: config.priceId,
          quantity: 1,
        },
      ],
      success_url: `${BASE_URL}/portal?checkout=success`,
      cancel_url: `${BASE_URL}/portal?checkout=cancelled`,
      client_reference_id: leadId || null,
      phone_number_collection: {
        enabled: true,
      },
      metadata,
    };

    if (customerId) {
      sessionConfig.customer = customerId;
    } else if (email) {
      sessionConfig.customer_email = email;
    }

    if (config.mode === "payment") {
      if (!customerId) {
        sessionConfig.customer_creation = "always";
      }
    } else {
      sessionConfig.subscription_data = {
        metadata,
      };
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);

    return NextResponse.json({
      success: true,
      url: session.url,
      sessionId: session.id,
      productTier: config.productTier,
      productName: config.productName,
    });
  } catch (error) {
    logErrorSeguro("stripe.checkout_failed", error);
    return NextResponse.json(
      { success: false, message: "No se pudo abrir el checkout" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.stripe.checkout.post", manejarPOST);
