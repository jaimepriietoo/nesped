import { requireInternalRequest } from "@/lib/server/internal-api";
import { buildElevenLabsContext } from "@/lib/server/elevenlabs";
import { configIA, promptDeEmpresa, dentroDeHorario } from "@/lib/server/ia-config";
import { departamentosDeEmpresa } from "@/lib/server/departamentos";
import { bloqueDeConocimiento, bloqueRuperta, conocimientoVigente, estadoRuperta } from "@/lib/server/conocimiento";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { ContextoElevenLabs, validar } from "@/lib/server/esquemas";
import { leerJsonLimitado } from "@/lib/server/security";

/**
 * Lo que ElevenLabs pide ANTES de descolgar.
 *
 * Con el número conectado, cada llamada entrante hace que ElevenLabs llame
 * aquí (webhook de "conversation initiation client data") con caller_id,
 * called_number, agent_id y call_sid, y espera de vuelta las variables
 * dinámicas del agente: quién es la empresa, si el que llama ya es un
 * contacto conocido, y —esto es lo nuevo— lo que la empresa configuró en
 * "Tu IA": tono, límites, derivaciones, horario y sus instrucciones. Así el
 * mismo agente atiende a Fibergreen y a una clínica de forma distinta.
 *
 * Sigue aceptando la forma antigua (clientId/callerId/calledNumber en
 * camelCase) y devolviendo los campos de siempre, para no romper nada.
 *
 * Sólo con el token interno: ElevenLabs lo manda en la cabecera configurada
 * en el webhook. Si algo falla, se devuelve igualmente una respuesta válida
 * con la empresa en blanco: mejor una llamada atendida a secas que un
 * agente que no descuelga porque el CRM no contestó.
 */
/**
 * Cómo se atiende a quien ya ha llamado otras veces.
 *
 * Lo que pidió la empresa: entre llamadas el agente sólo puede reutilizar el
 * nombre. Teléfono, correo, localidad, dirección y necesidad se preguntan o
 * confirman de nuevo en cada conversación. La ficha histórica sigue intacta,
 * pero no se entrega al agente ni se mezcla en el resumen, la clasificación o
 * el correo de la llamada actual.
 */
function reglaDeContacto({ nombre }) {
  if (!nombre) {
    return "QUIEN LLAMA ES NUEVO: pide nombre, teléfono de contacto, localidad, qué necesita y, si hace falta para su petición, la dirección.";
  }
  return [
    `QUIEN LLAMA TIENE ESTE NOMBRE EN LA FICHA: ${nombre}.`,
    "Puedes usar su nombre con naturalidad, pero no digas que ya le conoces ni menciones llamadas anteriores.",
    "Vuelve a pedir o confirmar en ESTA llamada el teléfono de contacto, el correo si hace falta, la localidad, la dirección del servicio y qué necesita. No des por válido ningún dato antiguo salvo el nombre.",
    "El resumen, la clasificación, las notas y el correo deben contener únicamente información dicha o confirmada en ESTA conversación.",
  ].join(" ");
}

async function manejarPOST(req) {
  const authError = requireInternalRequest(req);
  if (authError) return authError;

  const cuerpo = await leerJsonLimitado(req, { maxBytes: 32 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(ContextoElevenLabs, cuerpo.datos, { mensaje: "Contexto no válido" });
  if (leido.respuesta) return leido.respuesta;
  const body = leido.datos;
  const callerId = body?.caller_id || body?.callerId || "";
  const calledNumber = body?.called_number || body?.calledNumber || "";
  const conversationId = body?.conversation_id || body?.conversationId || "";

  try {
    const { response: ctx } = await buildElevenLabsContext({
      clientId: body?.clientId || body?.client_id,
      callerId,
      calledNumber,
      conversationId,
    });

    const [config, { lista: departamentos }, conocimiento, ruperta] = await Promise.all([
      configIA(ctx.clientId),
      departamentosDeEmpresa(ctx.clientId),
      conocimientoVigente(ctx.clientId).catch(() => []),
      estadoRuperta({ clientId: ctx.clientId, callerId }).catch(() => ({ permitido: false })),
    ]);
    const enHorario = dentroDeHorario(config);
    const contexto = promptDeEmpresa(config, { empresa: ctx.brandName, sector: ctx.industry, departamentos });

    const dynamic_variables = {
      nombre_empresa: ctx.brandName || ctx.companyName || "",
      client_id: ctx.clientId,
      sector: ctx.industry || "",
      lead_id: ctx.leadId || "",
      /* De la ficha sólo se entrega el nombre. El teléfono, la dirección y
         cualquier otro dato histórico no entran en el contexto del modelo;
         el lead_id sí se conserva para enlazar la nueva llamada con su ficha. */
      lead_nombre: ctx.leadName || "",
      lead_necesidad: "",
      resumen_contacto: "",
      objetivo_llamada: `Atiende esta llamada como ${ctx.brandName || ctx.companyName || "la empresa"} y resuelve lo que plantea ahora.`,
      en_horario: enHorario ? "sí" : "no",
      mensaje_fuera_horario: config.mensaje_fuera_horario || "",
      contexto_empresa: [
        ctx.companyPrompt, contexto, bloqueDeConocimiento(conocimiento),
        reglaDeContacto({ nombre: ctx.leadName }),
        bloqueRuperta(ruperta),
      ]
        .filter(Boolean).join("\n\n").slice(0, 8000),
      /* El agente los reenvía tal cual a anotar_instruccion; el servidor no se fía de ellos. */
      ruperta_permitido: ruperta.permitido ? "sí" : "no",
      caller_id: callerId,
    };

    return Response.json({
      type: "conversation_initiation_client_data",
      dynamic_variables,
      /* Compatibilidad con quien leía la forma antigua. */
      success: true,
      ...ctx,
      leadNeed: "",
      leadStatus: "",
      leadOwner: "",
      leadSummary: "",
      callObjective: "",
    });
  } catch (error) {
    logErrorSeguro("elevenlabs.context_failed", error);
    return Response.json({
      type: "conversation_initiation_client_data",
      dynamic_variables: {
        nombre_empresa: "", client_id: "", sector: "", lead_id: "", lead_nombre: "", lead_necesidad: "",
        resumen_contacto: "", objetivo_llamada: "", en_horario: "sí", mensaje_fuera_horario: "", contexto_empresa: "",
      },
      success: false,
      message: "No se pudo cargar el contexto para ElevenLabs",
    });
  }
}

export const POST = observeRoute("api.voice.elevenlabs.context.post", manejarPOST);
