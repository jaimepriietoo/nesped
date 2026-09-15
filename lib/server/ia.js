/* =========================================================================
   Cada llamada a la IA, apuntada.

   Nesped paga por tokens y no sabía cuántos gastaba, ni quién, ni en qué.
   Los cinco sitios que hablan con OpenAI —el copiloto, las sugerencias, las
   dos autorrespuestas de WhatsApp y la siguiente acción— pasan ahora por
   este envoltorio, que mide, apunta y devuelve lo mismo que devolvería la
   llamada sola. Es la base de dos cosas que vienen después: topes de gasto
   en euros por empresa, y la observabilidad de IA (Langfuse o lo que sea)
   cuando haya volumen que mirar.

   Se apunta SIEMPRE —también cuando falla— y nunca bloquea: si la escritura
   en ia_llamadas se cae, la respuesta al usuario sale igual y el fallo se
   registra. Un contador que tumba lo que cuenta es peor que no contarlo.

   Lo que se guarda: empresa, uso, modelo, versión del prompt, tokens de
   entrada y salida (dato), coste (ESTIMACIÓN: la tarifa de abajo es una
   aproximación por millón de tokens y hay que revisarla cuando cambie el
   proveedor; por eso va con `tarifa_version`), duración y si salió bien.

   Lo que NO se guarda: el prompt ni la respuesta. Llevan datos personales
   —el nombre de quien llama, lo que dijo— y un registro de coste no los
   necesita. Cuando entre Langfuse, eso irá con lista blanca aparte.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { contextoActual } from "@/lib/server/contexto.mjs";

/** Euros por millón de tokens. ESTIMACIÓN; revisar con la factura. */
const TARIFA_VERSION = "2026-09";
const TARIFA = {
  "gpt-5-mini": { entrada: 0.25, salida: 2.0 },
  "gpt-4o-mini": { entrada: 0.15, salida: 0.6 },
};

/** Los tokens, vengan de responses.create o de chat.completions.create. */
export function tokensDe(resultado) {
  const u = resultado?.usage || {};
  const entrada = Number(u.input_tokens ?? u.prompt_tokens ?? 0) || 0;
  const salida = Number(u.output_tokens ?? u.completion_tokens ?? 0) || 0;
  return { entrada, salida };
}

/** El coste estimado en euros, o null si el modelo no está en la tarifa. */
export function costeEstimado(modelo, { entrada, salida }) {
  const t = TARIFA[modelo];
  if (!t) return null;
  return (entrada * t.entrada + salida * t.salida) / 1_000_000;
}

/**
 * Ejecuta una llamada a la IA y la apunta.
 *
 * @param {object} meta   { clientId, uso, modelo, promptVersion }
 * @param {Function} ejecutar   () => Promise<resultado de OpenAI>
 */
export async function conRegistroIA({ clientId = null, uso, modelo, promptVersion = null }, ejecutar) {
  const inicio = Date.now();
  let resultado, fallo = null;
  try {
    resultado = await ejecutar();
    return resultado;
  } catch (err) {
    fallo = err;
    throw err;
  } finally {
    const tokens = fallo ? { entrada: 0, salida: 0 } : tokensDe(resultado);
    const fila = {
      client_id: clientId || null,
      uso: String(uso || "desconocido").slice(0, 60),
      modelo: String(modelo || "desconocido").slice(0, 60),
      prompt_version: promptVersion ? String(promptVersion).slice(0, 40) : null,
      tokens_entrada: tokens.entrada,
      tokens_salida: tokens.salida,
      coste_estimado: fallo ? null : costeEstimado(modelo, tokens),
      tarifa_version: TARIFA_VERSION,
      duracion_ms: Date.now() - inicio,
      ok: !fallo,
      error: fallo ? String(fallo?.message || fallo).slice(0, 300) : null,
      request_id: contextoActual().request_id || null,
    };
    /* Sin await y sin dejar que reviente: apuntar no puede tumbar la respuesta. */
    void getSupabase().from("ia_llamadas").insert(fila).then(({ error }) => {
      if (error) console.error("[ia] no se pudo apuntar la llamada:", error.message);
    }, (e) => console.error("[ia] no se pudo apuntar la llamada:", e?.message || e));
  }
}

/** Lo gastado hoy por una empresa: llamadas, tokens y coste estimado. */
export async function gastoIAHoy(clientId) {
  if (!clientId) return { llamadas: 0, tokens: 0, coste: 0 };
  const { data, error } = await getSupabase().rpc("gasto_ia_del_dia", { p_client_id: clientId });
  if (error) throw new Error(error.message || "No se pudo leer el gasto de IA");
  const fila = Array.isArray(data) ? data[0] : data;
  return { llamadas: Number(fila?.llamadas || 0), tokens: Number(fila?.tokens || 0), coste: Number(fila?.coste || 0) };
}

export const PARA_PRUEBAS = { TARIFA, TARIFA_VERSION };
