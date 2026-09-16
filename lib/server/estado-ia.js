/* =========================================================================
   ¿Está la IA encendida? Y si no, por qué.

   Hasta ahora había cuatro sitios que podían apagar OpenAI sin decirlo:
   la variable OPENAI_API_KEY ausente, la pausa global, la pausa de IA de la
   plataforma y la pausa de IA de la empresa. Cada ruta comprobaba uno o dos
   y las demás fallaban en silencio o devolvían un texto de relleno como si
   fuera de la IA. Esto junta las cuatro en una respuesta que dice, por cada
   función, si va a actuar la IA, qué va a pasar si no, y por qué.

   Es lo que enseña el portal y lo que consultan las rutas antes de llamar
   a OpenAI. Nunca lanza: si no se puede leer, se dice "desconocido" y se
   trata como apagada para no prometer lo que no se puede dar.
   ========================================================================= */

import { interruptoresDePlataforma, interruptoresDeEmpresa } from "@/lib/server/interruptores";

/** Las funciones que dependen de la IA y qué pasa con cada una si no está. */
export const FUNCIONES_IA = Object.freeze({
  whatsapp: {
    nombre: "Respuestas de WhatsApp",
    sinIA: "Los mensajes se guardan y quedan para que los conteste una persona. No sale ninguna respuesta automática.",
  },
  sugerencias: {
    nombre: "Respuestas sugeridas",
    sinIA: "El botón de sugerir queda desactivado; se contesta a mano.",
  },
  clasificacion: {
    nombre: "Clasificación por departamento",
    sinIA: "Se clasifica por palabras clave de cada departamento; si ninguna encaja, queda en 'Otro'.",
  },
  automatismos: {
    nombre: "Automatismos con IA",
    sinIA: "Los automatismos que necesitan entender el texto (urgencia, enfado, oportunidad) no actúan; los de reglas fijas siguen.",
  },
  tareas: {
    nombre: "Copiloto y siguiente acción",
    sinIA: "El copiloto no contesta y no se proponen siguientes acciones.",
  },
});

export function openaiConfigurado(env = process.env) {
  return Boolean(String(env.OPENAI_API_KEY || "").trim());
}

/**
 * El estado de la IA para una empresa.
 *
 * @returns {{ activa: boolean, motivo: string|null, causas: string[],
 *   plataforma: object, empresa: object, funciones: Record<string, {nombre, activa, sinIA}> }}
 */
export async function estadoDeLaIA(clientId, { env = process.env } = {}) {
  const causas = [];
  let plataforma = { pausa_global: false, pausa_ia: false };
  let empresa = { ia_pausada: false };

  if (!openaiConfigurado(env)) causas.push("No hay clave de OpenAI configurada (OPENAI_API_KEY).");

  try {
    plataforma = await interruptoresDePlataforma();
    if (plataforma.pausa_global) causas.push(`Nesped está en pausa global${plataforma.motivo ? `: ${plataforma.motivo}` : "."}`);
    else if (plataforma.pausa_ia) causas.push(`La IA está en pausa en toda la plataforma${plataforma.motivo ? `: ${plataforma.motivo}` : "."}`);
  } catch (err) {
    causas.push("No se pudo leer el estado de la plataforma.");
    console.error("[estado-ia] plataforma:", err?.message || err);
  }

  if (clientId) {
    try {
      empresa = await interruptoresDeEmpresa(clientId);
      if (empresa.ia_pausada) causas.push("La IA está en pausa para esta empresa.");
    } catch (err) {
      causas.push("No se pudo leer el estado de la empresa.");
      console.error("[estado-ia] empresa:", err?.message || err);
    }
  }

  const activa = causas.length === 0;
  const funciones = Object.fromEntries(
    Object.entries(FUNCIONES_IA).map(([clave, f]) => [clave, { nombre: f.nombre, activa, sinIA: f.sinIA }]),
  );

  return { activa, motivo: activa ? null : causas[0], causas, plataforma, empresa, funciones };
}

/**
 * Para las rutas: true si se puede llamar a OpenAI ahora para esta empresa.
 * No lanza; una IA que no está es un `false` y un motivo, no un 500.
 */
export async function iaDisponible(clientId) {
  const estado = await estadoDeLaIA(clientId);
  return { ok: estado.activa, motivo: estado.motivo };
}
