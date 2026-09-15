import { verifyElevenLabsWebhookSignature } from "@/lib/server/elevenlabs";
import { guardarEvento } from "@/lib/server/bandeja-webhooks";
import { observeRoute } from "@/lib/server/observability.mjs";
import { PostCallElevenLabs, validar } from "@/lib/server/esquemas";

/**
 * ElevenLabs avisa de que una llamada ha terminado.
 *
 * La petición hace lo mínimo que ElevenLabs necesita: comprobar la firma,
 * guardar el evento tal cual y contestar 2xx. Guardar la llamada, anotar el
 * consumo y actualizar el contacto lo hace la cola de trabajos, con sus
 * reintentos. Antes iba todo aquí dentro, y un proveedor lento en medio era
 * un timeout que ElevenLabs reintentaba sobre lo mismo.
 *
 * El identificador del evento es el de la conversación: la misma entrega dos
 * veces es una fila, y el procesado reclama la conversación antes de tener
 * efectos, así que no hay forma de contar una llamada dos veces.
 */
async function manejarPOST(req) {
  const rawBody = await req.text();
  const hasValidHmac = verifyElevenLabsWebhookSignature({
    rawBody,
    signatureHeader: req.headers.get("ElevenLabs-Signature") || "",
  });

  if (!hasValidHmac) {
    return Response.json(
      { success: false, message: "Webhook de ElevenLabs no autorizado" },
      { status: 401 }
    );
  }

  let crudo;
  try {
    crudo = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return Response.json({ success: false, message: "Cuerpo no válido" }, { status: 400 });
  }
  /* Se comprueba la forma de lo que se usa; el resto del evento pasa tal cual. */
  const leido = validar(PostCallElevenLabs, crudo, { mensaje: "Evento no válido" });
  if (leido.respuesta) return leido.respuesta;
  const payload = leido.datos;

  /* Sólo interesa la transcripción final; el resto de tipos se contesta bien
     y no se guarda, igual que hacía el procesado. */
  const tipo = String(payload?.type || "").trim();
  if (tipo && tipo !== "post_call_transcription") {
    return Response.json({ success: true, skipped: true, reason: `Evento no soportado: ${tipo}` });
  }

  const conversationId = String(payload?.data?.conversation_id || "").trim() || null;
  const dinamicas = payload?.data?.conversation_initiation_client_data?.dynamic_variables || {};
  const clientId = String(dinamicas.client_id || dinamicas.clientId || "").trim() || null;

  try {
    const guardado = await guardarEvento({
      proveedor: "elevenlabs",
      tipo: tipo || "post_call_transcription",
      eventoId: conversationId,
      clientId,
      payload,
    });
    return Response.json({ success: true, encolado: guardado.encolado, evento: guardado.id });
  } catch (err) {
    console.error("post-call de ElevenLabs:", err);
    return Response.json(
      { success: false, message: "No se pudo guardar la llamada de ElevenLabs" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.voice.elevenlabs.post-call.post", manejarPOST);
