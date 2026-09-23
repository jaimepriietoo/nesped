import { getSupabaseAdministrativo } from "@/lib/supabase";
import {
  TABLAS,
  cifrarFila,
  descifrar,
  hashDeBusquedaEmpresa,
  modoCifrado,
  modoHashBusqueda,
} from "@/lib/server/cifrado-datos";
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
  const modoHash = modoHashBusqueda(env);
  const resumen = {
    modo, modoHash, cifradas: 0, hashesEmpresa: 0,
    hashesGlobalesRetirados: 0, quedaTrabajo: false, errores: 0,
  };
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
          if (def.buscables.includes(columna)) {
            for (const sufijo of ["hash", "hash_empresa"]) {
              const clave = `${columna}_${sufijo}`;
              if (Object.hasOwn(cifrada, clave)) patch[clave] = cifrada[clave];
            }
          }
          const { error: e } = await supabase.from(tabla).update(patch)
            .eq("id", fila.id).eq("client_id", fila.client_id);
          if (e) throw e;
          resumen.cifradas += 1;
        } catch (err) {
          resumen.errores += 1;
          logErrorSeguro("cifrado.relleno_escritura", err, { tabla, columna });
        }
      }
      if ((data || []).length === LOTE) resumen.quedaTrabajo = true;
    }

    /* Las filas que ya tenían sobre antes de esta migración necesitan sólo
       el hash por empresa. Se descifra por lotes; en modo final se elimina
       además el hash global, sin borrar la columna para conservar rollback. */
    for (const columna of def.buscables) {
      if (ahora() >= hasta) { resumen.quedaTrabajo = true; return resumen; }
      const { data, error } = await supabase.from(tabla)
        .select(`id,client_id,${columna}_cifrado`)
        .is(`${columna}_hash_empresa`, null)
        .not(`${columna}_cifrado`, "is", null)
        .limit(LOTE);
      if (error) {
        resumen.errores += 1;
        logErrorSeguro("cifrado.hash_empresa_lectura", error, { tabla, columna });
        continue;
      }
      for (const fila of data || []) {
        try {
          const claro = descifrar({
            tabla, columna, clientId: fila.client_id,
            sobre: fila[`${columna}_cifrado`], env,
          });
          const patch = {
            [`${columna}_hash_empresa`]: hashDeBusquedaEmpresa(columna, claro, fila.client_id, env),
          };
          if (modoHash === "empresa") patch[`${columna}_hash`] = null;
          const { error: e } = await supabase.from(tabla).update(patch)
            .eq("id", fila.id).eq("client_id", fila.client_id);
          if (e) throw e;
          resumen.hashesEmpresa += 1;
        } catch (err) {
          resumen.errores += 1;
          logErrorSeguro("cifrado.hash_empresa_escritura", err, { tabla, columna });
        }
      }
      if ((data || []).length === LOTE) resumen.quedaTrabajo = true;

      if (modoHash === "empresa") {
        const { data: antiguas, error: errorAntiguas } = await supabase.from(tabla)
          .select("id,client_id")
          .not(`${columna}_hash`, "is", null)
          .not(`${columna}_hash_empresa`, "is", null)
          .limit(LOTE);
        if (errorAntiguas) {
          resumen.errores += 1;
          logErrorSeguro("cifrado.hash_global_lectura", errorAntiguas, { tabla, columna });
        } else {
          for (const fila of antiguas || []) {
            const { error: e } = await supabase.from(tabla)
              .update({ [`${columna}_hash`]: null })
              .eq("id", fila.id).eq("client_id", fila.client_id);
            if (e) {
              resumen.errores += 1;
              logErrorSeguro("cifrado.hash_global_escritura", e, { tabla, columna });
            } else resumen.hashesGlobalesRetirados += 1;
          }
          if ((antiguas || []).length === LOTE) resumen.quedaTrabajo = true;
        }
      }
    }
  }
  logEvent("info", "cifrado.relleno", resumen);
  return resumen;
}

export const PARA_PRUEBAS = { LOTE };
