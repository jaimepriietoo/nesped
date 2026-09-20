import { getSupabaseAdministrativo } from "@/lib/supabase";
import { TABLAS, cifrarFila, modoCifrado } from "@/lib/server/cifrado-datos";
import { logErrorSeguro, logEvent } from "@/lib/server/observability.mjs";

/**
 * Rellena los sobres de las filas que ya existían antes del cifrado.
 *
 * Va tabla por tabla y columna por columna, en lotes, con el cliente crudo
 * (sin envoltorio) porque necesita leer el claro y escribir el sobre a la
 * vez. Sólo actúa a partir de `doble`. Devuelve cuántas filas ha cifrado y
 * si queda trabajo, para que el mantenimiento vuelva a encolarse.
 */
const LOTE = 200;

export async function rellenarCifrado({ presupuestoMs = 15_000, ahora = Date.now, env = process.env } = {}) {
  const modo = modoCifrado(env);
  const resumen = { modo, cifradas: 0, quedaTrabajo: false, errores: 0 };
  if (modo === "apagado") return resumen;
  const supabase = getSupabaseAdministrativo({ crudo: true });
  const hasta = ahora() + presupuestoMs;

  for (const [tabla, def] of Object.entries(TABLAS)) {
    for (const columna of def.cifradas) {
      if (ahora() >= hasta) { resumen.quedaTrabajo = true; return resumen; }
      const { data, error } = await supabase.from(tabla)
        .select(`id,client_id,${columna}`)
        .is(`${columna}_cifrado`, null).not(columna, "is", null)
        .limit(LOTE);
      if (error) { resumen.errores += 1; logErrorSeguro("cifrado.relleno_lectura", error, { tabla, columna }); continue; }
      for (const fila of data || []) {
        if (fila[columna] === "") continue;
        try {
          const cifrada = cifrarFila({ tabla, fila: { client_id: fila.client_id, [columna]: fila[columna] }, modo: "doble", env });
          const patch = { [`${columna}_cifrado`]: cifrada[`${columna}_cifrado`] };
          if (def.buscables.includes(columna)) patch[`${columna}_hash`] = cifrada[`${columna}_hash`];
          const { error: e } = await supabase.from(tabla).update(patch).eq("id", fila.id);
          if (e) throw e;
          resumen.cifradas += 1;
        } catch (err) {
          resumen.errores += 1;
          logErrorSeguro("cifrado.relleno_escritura", err, { tabla, columna });
        }
      }
      if ((data || []).length === LOTE) resumen.quedaTrabajo = true;
    }
  }
  logEvent("info", "cifrado.relleno", resumen);
  return resumen;
}

export const PARA_PRUEBAS = { LOTE };
