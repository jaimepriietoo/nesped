import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireRateLimitAsync } from "@/lib/server/security";
import { resolveCheckoutConfig, stripe } from "@/lib/server/stripe-checkout";
import { urlDeSitio } from "@/lib/server/sitio";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { ConsultaCheckoutPublico, validar } from "@/lib/server/esquemas";

/**
 * Manda a pagar a alguien que YA tiene cuenta.
 *
 * Sustituye a /api/stripe/public-checkout, que cobraba a desconocidos. La
 * diferencia que importa está en el enlace: aquí la sesión de Stripe lleva
 * dentro el client_id, así que cuando vuelve el webhook se sabe a qué cuenta
 * aplicar el plan. Antes había que adivinarlo por el correo tecleado en
 * Stripe, y si no coincidía con el del alta no cuadraba con nadie.
 *
 * Sin sesión no se puede pagar: se manda a acceder y se vuelve aquí después.
 */

async function manejarGET(req) {
  const BASE_URL = urlDeSitio(req);

  try {
    const { searchParams } = new URL(req.url);
    const entrada = validar(ConsultaCheckoutPublico, {
      plan: searchParams.get("plan")?.toLowerCase() || undefined,
    });

    if (entrada.respuesta) {
      return NextResponse.redirect(`${BASE_URL}/pricing`, 303);
    }
    const plan = entrada.datos.plan;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      /* Sin cuenta no hay pago. Se le lleva al alta con el plan puesto, y
         desde allí puede saltar a acceder si resulta que ya era cliente. */
      return NextResponse.redirect(`${BASE_URL}/registro?plan=${plan}`, 303);
    }

    if (!puede(ctx.role, "billing.manage", ctx.permissions)) {
      return NextResponse.redirect(`${BASE_URL}/portal?error=sin-permiso-facturacion`, 303);
    }

    const limited = await requireRateLimitAsync(req, {
      namespace: "billing:subscription-checkout",
      limit: 10,
      windowMs: 15 * 60 * 1000,
      keyParts: [ctx.clientId, ctx.userEmail],
      includeIp: false,
    });
    if (limited) return limited;

    const { data: cliente } = await ctx.supabase
      .from("clients")
      .select("id,name,stripe_customer_id,billing_status")
      .eq("id", ctx.clientId)
      .maybeSingle();

    if (!cliente) {
      return NextResponse.redirect(`${BASE_URL}/portal`, 303);
    }

    /* Ya paga: que gestione lo suyo en el portal de facturación en vez de
       contratar una segunda suscripción encima de la primera. */
    if (cliente.billing_status === "activo" && cliente.stripe_customer_id) {
      return NextResponse.redirect(`${BASE_URL}/portal?vista=ajustes`, 303);
    }

    const resuelto = await resolveCheckoutConfig({ plan });
    if (!resuelto?.priceId) {
      return NextResponse.redirect(`${BASE_URL}/pricing?checkout=unavailable`, 303);
    }

    const metadatos = {
      client_id: cliente.id,
      plan,
      source: "alta_con_cuenta",
      product_tier: resuelto.productTier || plan,
    };

    const configuracion = {
      mode: resuelto.mode,
      line_items: [{ price: resuelto.priceId, quantity: 1 }],
      success_url: `${BASE_URL}/portal?bienvenida=1`,
      cancel_url: `${BASE_URL}/portal?pago=cancelado`,
      /* Aparece en el panel de Stripe junto al pago: sirve para cuadrar un
         cobro con una cuenta sin tener que cruzar correos a mano. */
      client_reference_id: cliente.id,
      metadata: metadatos,
      allow_promotion_codes: true,
    };

    /* Si ya tiene ficha en Stripe se reutiliza; si no, se fija el correo de la
       cuenta para que no pueda pagar con uno distinto y quedar descuadrado. */
    if (cliente.stripe_customer_id) {
      configuracion.customer = cliente.stripe_customer_id;
    } else {
      configuracion.customer_email = ctx.userEmail;
      if (resuelto.mode === "payment") configuracion.customer_creation = "always";
    }

    if (resuelto.mode === "subscription") {
      /* Los metadatos de la sesión no viajan a la suscripción: hay que
         ponerlos también aquí o las renovaciones llegan sin client_id. */
      configuracion.subscription_data = { metadata: metadatos };
    }

    const sesion = await stripe.checkout.sessions.create(configuracion);

    if (!sesion.url) {
      return NextResponse.redirect(`${BASE_URL}/pricing?checkout=unavailable`, 303);
    }

    const respuesta = NextResponse.redirect(sesion.url, 303);
    respuesta.headers.set("Cache-Control", "no-store");
    return respuesta;
  } catch (error) {
    logErrorSeguro("stripe.subscription_checkout_failed", error);
    return NextResponse.redirect(`${BASE_URL}/pricing?checkout=error`, 303);
  }
}

export const GET = observeRoute("api.suscripcion.iniciar.get", manejarGET);
