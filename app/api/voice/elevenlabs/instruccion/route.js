import { requireInternalRequest } from "@/lib/server/internal-api";
import { anotarPorVoz, NOMBRE_ACTIVACION } from "@/lib/server/conocimiento";
import { InstruccionPorVoz, validar } from "@/lib/server/esquemas";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { leerJsonLimitado } from "@/lib/server/security";

/**
 * La herramienta `anotar_instruccion` del agente de voz (modo Ruperta).
 *
 * El agente manda la empresa, el número que llama, el PIN que ha oído y la
 * instrucción. Aquí se vuelve a comprobar todo: que el número es de un
 * owner/admin y que el PIN es el de la empresa. Lo que el modelo crea que
 * es cierto no cuenta. La respuesta es una frase para que el agente la
 * diga tal cual.
 */
async function manejarPOST(req) {
  const authError = requireInternalRequest(req);
  if (authError) return authError;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(InstruccionPorVoz, cuerpo.datos, { mensaje: "Instrucción no válida" });
  if (leido.respuesta) return leido.respuesta;
  const b = leido.datos;
  try {
    const vigente = b.vigente_hasta && Number.isFinite(Date.parse(b.vigente_hasta)) ? new Date(b.vigente_hasta).toISOString() : null;
    const r = await anotarPorVoz({
      clientId: b.clientId || b.client_id || "", callerId: b.callerId || b.caller_id || "",
      conversationId: b.conversationId || b.conversation_id || "", pin: b.pin, texto: b.texto, vigenteHasta: vigente,
    });
    if (!r.ok) return Response.json({ success: false, anotado: false, mensaje: `No lo puedo anotar: ${r.motivo}` });
    return Response.json({ success: true, anotado: true, mensaje: `Anotado. A partir de ahora lo tengo en cuenta${vigente ? " hasta la fecha que me has dicho" : ""}.` });
  } catch (error) {
    logErrorSeguro("elevenlabs.instruccion_failed", error);
    return Response.json({ success: false, anotado: false, mensaje: `No he podido anotarlo. Inténtalo desde el portal.` });
  }
}

export const POST = observeRoute(`api.voice.elevenlabs.instruccion.post`, manejarPOST);

