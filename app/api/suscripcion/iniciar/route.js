import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal-auth";
import { resolveCheckoutConfig, stripe } from "@/lib/server/stripe-checkout";
import { urlDeSitio } from "@/lib/server/sitio";

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

const PLANES_PUBLICOS = new Set(["growth", "intelligence"]);

export async function GET(req) {
  const BASE_URL = urlDeSitio(req);

  try {
    const { searchParams } = new URL(req.url);
    const plan = String(searchParams.get("plan") || "growth").toLowerCase();

    if (!PLANES_PUBLICOS.has(plan)) {
      return NextResponse.redirect(`${BASE_URL}/pricing`, 303);
    }

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      /* Sin cuenta no hay pago. Se le lleva al alta con el plan puesto, y
         desde allí puede saltar a acceder si resulta que ya era cliente. */
      return NextResponse.redirect(`${BASE_URL}/registro?plan=${plan}`, 303);
    }

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

    return NextResponse.redirect(sesion.url, 303);
  } catch (error) {
    console.error("GET /api/suscripcion/iniciar error:", error);
    return NextResponse.redirect(`${BASE_URL}/pricing?checkout=error`, 303);
  }
}
