import { headers } from "next/headers";
import { stripe } from "@/lib/server/stripe-utils";
import { guardarEvento } from "@/lib/server/bandeja-webhooks";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerTextoLimitado } from "@/lib/server/security";
 
async function manejarPOST(req) {
  const cuerpo = await leerTextoLimitado(req, { maxBytes: 1024 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const body = cuerpo.datos;
  const sig = (await headers()).get("stripe-signature") || "";
 
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return Response.json({ error: "Firma de webhook inválida" }, { status: 400 });
  }
 
  /* Se guarda y se procesa en la misma petición: activar el plan de quien
     acaba de pagar no puede esperar a la cola. Si falla, queda en la
     bandeja con su error y la cola lo reintenta; a Stripe se le contesta
     200 igual, porque el evento ya está a salvo y reintentarlo desde su
     lado sólo lo repetiría (reclamar_webhook lo ignoraría). */
  try {
    const guardado = await guardarEvento({
      proveedor: "stripe",
      tipo: event.type,
      eventoId: event.id,
      clientId: event.data?.object?.metadata?.client_id || null,
      payload: event,
      enLinea: true,
    });
    return Response.json({ received: true, procesado: Boolean(guardado.procesado), evento: guardado.id });
  } catch (err) {
    logErrorSeguro("stripe.webhook_store_failed", err);
    return Response.json({ error: "No se pudo guardar el evento" }, { status: 500 });
  }
}
 
export const POST = observeRoute("api.stripe.webhook.post", manejarPOST);
