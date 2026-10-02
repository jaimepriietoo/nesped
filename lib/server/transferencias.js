/* =========================================================================
   Pasar la llamada a una persona.

   La asistente puede ofrecer «¿quiere que le pase con el servicio técnico?».
   Si el cliente dice que sí, ElevenLabs llama al teléfono del departamento,
   le cuenta al trabajador en una frase quién llama y para qué, conecta a los
   dos y se sale de la llamada.

   El agente de ElevenLabs es el mismo para todas las empresas y cada una
   tiene sus departamentos, así que el agente no conoce departamentos sino
   HUECOS: «pasar al 1», «al 2», «al 3». En cada llamada, el webhook de inicio
   le dice qué departamento y qué teléfono hay detrás de cada hueco. Un hueco
   vacío no se ofrece.

   Sólo se ofrece en horario: fuera de él no hay nadie que coja, y la
   asistente toma nota como siempre.
   ========================================================================= */

import { esTelefonoValido, toE164 } from "@/lib/server/phone";

/** Cuántos departamentos puede ofrecer el agente. Tiene una regla por hueco. */
export const HUECOS_DE_TRANSFERENCIA = 3;

/** Los departamentos activos con teléfono, en su orden, como mucho tres. */
export function huecosDeTransferencia(departamentos = [], { enHorario = true } = {}) {
  if (!enHorario) return [];
  return departamentos
    .filter((d) => d && d.activo !== false && esTelefonoValido(d.telefono_transferencia))
    .slice(0, HUECOS_DE_TRANSFERENCIA)
    .map((d, i) => ({ hueco: i + 1, clave: d.clave, nombre: d.nombre, telefono: toE164(d.telefono_transferencia) }));
}

/**
 * Las variables que el agente usa en sus reglas de transferencia. Van
 * siempre todas, vacías si el hueco no tiene departamento: ElevenLabs se
 * niega a empezar si una herramienta usa una variable que no existe.
 */
export function variablesDeTransferencia(huecos = []) {
  const variables = {};
  for (let n = 1; n <= HUECOS_DE_TRANSFERENCIA; n += 1) {
    const h = huecos.find((x) => x.hueco === n);
    variables[`transferir_${n}_nombre`] = h?.nombre || "";
    variables[`transferir_${n}_telefono`] = h?.telefono || "";
  }
  return variables;
}

/** Lo que se le explica a la asistente, dentro de contexto_empresa. */
export function reglasDeTransferencia(huecos = []) {
  if (!huecos.length) {
    return "PASAR LA LLAMADA: ahora no se puede pasar la llamada a ninguna persona. No lo ofrezcas ni uses la herramienta de transferencia; toma nota y di que le llamarán.";
  }
  return [
    "PASAR LA LLAMADA A UNA PERSONA. Puedes pasar la llamada a estos departamentos:",
    ...huecos.map((h) => `- Departamento ${h.hueco}: ${h.nombre}.`),
    "- Ofrécelo sólo cuando el asunto sea de ese departamento y lo resuelva mejor una persona (una avería, una contratación, un trámite). Pregunta siempre antes: «¿Quiere que le pase ahora con " + huecos[0].nombre + "?», con el departamento que toque.",
    "- Pasa la llamada sólo si la persona dice claramente que sí. Si duda o dice que no, sigue atendiendo y toma nota.",
    "- Antes de pasarla, asegúrate de tener su nombre y en una frase qué necesita: es lo que oirá el trabajador antes de conectar.",
    "- Para pasarla usa la herramienta de transferencia con el número de departamento de esta lista. Al cliente dile sólo «Le paso, un momento». Al trabajador, en una frase, quién llama y qué necesita.",
    "- Nunca digas en voz alta el teléfono interno del departamento.",
    "- Si piden un departamento que no está en la lista, no lo pases: toma nota y di que le llamarán.",
  ].join("\n");
}

/**
 * ¿Se pasó esta conversación a alguien? Lo dice el transcript que manda
 * ElevenLabs al colgar: una llamada a la herramienta transfer_to_number. El
 * departamento sale de comparar el número marcado con los huecos que se
 * dieron al empezar (vienen en las variables dinámicas).
 */
export function transferenciaDeLaConversacion(transcript = [], variables = {}) {
  /* Cuenta sólo si la transferencia SALIÓ BIEN. Intentarla no basta: el
     02-10-2026 Twilio la rechazó (país sin permiso) y la llamada quedó en el
     portal como «pasada» cuando el cliente se había quedado colgado. */
  for (const linea of Array.isArray(transcript) ? transcript : []) {
    for (const resultado of Array.isArray(linea?.tool_results) ? linea.tool_results : []) {
      if (resultado?.tool_name !== "transfer_to_number" || resultado?.is_error) continue;
      let valor = resultado.result_value ?? resultado.result ?? {};
      if (typeof valor === "string") { try { valor = JSON.parse(valor); } catch { valor = {}; } }
      if (valor?.status && valor.status !== "success") continue;
      const marcados = [valor?.transfer_number].map((v) => toE164(typeof v === "string" ? v : "")).filter(Boolean);
      for (let n = 1; n <= HUECOS_DE_TRANSFERENCIA; n += 1) {
        const telefono = toE164(variables[`transferir_${n}_telefono`] || "");
        if (telefono && marcados.includes(telefono)) {
          return { departamento: variables[`transferir_${n}_nombre`] || `departamento ${n}`, hueco: n };
        }
      }
      return { departamento: "un departamento", hueco: null };
    }
  }
  return null;
}
