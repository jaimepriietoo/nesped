import { headers } from "next/headers";
import { stripe } from "@/lib/server/stripe-utils";
import { guardarEvento } from "@/lib/server/bandeja-webhooks";
import { observeRoute } from "@/lib/server/observability.mjs";
 
async function manejarPOST(req) {
  const body = await req.text();
  const sig = (await headers()).get("stripe-signature") || "";
 
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return Response.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
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
    console.error("Webhook processing error:", err);
    return Response.json({ error: "No se pudo guardar el evento" }, { status: 500 });
  }
}
 
export const config = { api: { bodyParser: false } };

export const POST = observeRoute("api.stripe.webhook.post", manejarPOST);
