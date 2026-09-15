import { NextResponse } from "next/server";
import { urlDeSitio } from "@/lib/server/sitio";
import { observeRoute } from "@/lib/server/observability.mjs";

/**
 * Cobro sin cuenta: retirado.
 *
 * Esta ruta abría una sesión de pago a cualquiera, sin identificar. Ya no se
 * enlaza desde ninguna parte, pero borrarla del todo dejaría un 404 a quien
 * la tuviera guardada, y sobre todo dejaría el agujero abierto mientras
 * quedara desplegada: bastaba con escribir la URL para pagar sin cuenta, que
 * es justo lo que este cambio viene a impedir.
 *
 * Se conserva como redirección al alta, conservando el plan que se pedía.
 */

const PLANES_PUBLICOS = new Set(["growth", "intelligence"]);

async function manejarGET(req) {
  const BASE_URL = urlDeSitio(req);
  const { searchParams } = new URL(req.url);
  const plan = String(searchParams.get("plan") || "growth").toLowerCase();
  const destino = PLANES_PUBLICOS.has(plan) ? `/registro?plan=${plan}` : "/pricing";

  return NextResponse.redirect(`${BASE_URL}${destino}`, 308);
}

export const GET = observeRoute("api.stripe.public-checkout.get", manejarGET);
