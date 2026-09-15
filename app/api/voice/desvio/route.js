import { getSupabase } from "@/lib/supabase";
import { verificarWebhookTwilio } from "@/lib/server/twilio";
import { twimlDeDesvio } from "@/lib/server/desvio";
import { observeRoute } from "@/lib/server/observability.mjs";

/**
 * A dónde apunta un número desviado. Twilio llama aquí cuando entra una
 * llamada y se le contesta con un <Dial> al teléfono del cliente. Sólo
 * Twilio: se comprueba su firma sobre la URL pública y los campos.
 */
async function manejarPOST(req) {
  const rawPayload = await req.text();
  const campos = Object.fromEntries(new URLSearchParams(rawPayload));
  const url = new URL(req.url);
  const host = req.headers.get("x-forwarded-host") || url.host;
  const esquema = req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const urlPublica = `${esquema}://${host}${url.pathname}${url.search}`;
  const firmado = verificarWebhookTwilio({ url: urlPublica, params: campos, signature: req.headers.get("x-twilio-signature") || "" });
  if (!firmado) return new Response("No autorizado", { status: 401 });

  const empresa = String(url.searchParams.get("empresa") || "").trim();
  const { data } = await getSupabase().from("clients")
    .select("telefono_desvio, desvio_activo").eq("id", empresa).maybeSingle();
  const telefono = data?.desvio_activo ? data.telefono_desvio : "";
  return new Response(twimlDeDesvio(telefono), { headers: { "Content-Type": "text/xml; charset=utf-8", "Cache-Control": "no-store" } });
}

export const POST = observeRoute("api.voice.desvio.post", manejarPOST);
