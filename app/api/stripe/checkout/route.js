import { NextResponse } from "next/server";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import {
  BASE_URL,
  getClientBillingState,
  normalizePhone,
  resolveClientStripeCustomer,
  resolveCheckoutConfig,
  stripe,
} from "@/lib/server/stripe-utils";

export async function POST(req) {
  try {
    const ctx = await getPortalContext();

    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para crear un checkout" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      leadId,
      plan = "pro",
      productId = null,
      phone = "",
      email = "",
      name = "",
      successUrl,
      cancelUrl,
    } = body || {};

    const config = await resolveCheckoutConfig({ plan, productId });

    if (!config?.priceId) {
      return NextResponse.json(
        { success: false, message: "No se encontro un precio valido en Stripe" },
        { status: 400 }
      );
    }

    const isClientPlanCheckout = !leadId;

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
      success_url: successUrl || `${BASE_URL}/portal?checkout=success`,
      cancel_url: cancelUrl || `${BASE_URL}/portal?checkout=cancelled`,
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
    console.error("POST /api/stripe/checkout error:", error);
    return NextResponse.json(
      { success: false, message: "No se pudo abrir el checkout" },
      { status: 500 }
    );
  }
}
