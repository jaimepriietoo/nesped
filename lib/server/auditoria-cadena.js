import crypto from "node:crypto";
import { getSupabaseAdministrativo } from "@/lib/supabase";
import { logEvent } from "@/lib/server/observability.mjs";

/**
 * La cadena de auditoría.
 *
 * Cada fila de audit_logs lleva el hash de la anterior (migración
 * 20260920210000). Aquí viven las dos comprobaciones: la de Postgres, que
 * recorre la cadena entera, y una segunda hecha desde Node sobre las últimas
 * filas, para no fiarse sólo de que la base diga que está bien.
 */

/** El material se compone igual que en material_auditoria() de la base. */
export function materialDeAuditoria(fila) {
  return [
    String(fila.secuencia),
    fila.hash_anterior || "",
    fila.client_id, fila.entity_type, fila.entity_id, fila.action,
    fila.actor || "",
    fila.changes_texto ?? "{}",
    fila.created_at_utc,
  ].join("|");
}

export function hashDeAuditoria(material) {
  return crypto.createHash("sha256").update(material, "utf8").digest("hex");
}

/**
 * Recalcula en Node los hashes de una lista de filas ordenadas por secuencia
 * y devuelve la primera rotura, o null. Sirve tanto para las últimas filas
 * de la base como para un volcado exportado.
 */
export function primeraRotura(filas, { anclaHash = null, anclaSecuencia = null } = {}) {
  let anterior = anclaHash;
  let esperada = anclaSecuencia === null ? null : Number(anclaSecuencia) + 1;
  for (const fila of filas) {
    const secuencia = Number(fila.secuencia);
    if (esperada !== null && secuencia !== esperada) {
      return { secuencia, motivo: `falta la secuencia ${esperada}` };
    }
    if (esperada !== null && (fila.hash_anterior || null) !== (anterior || null)) {
      return { secuencia, motivo: "hash_anterior no enlaza" };
    }
    if (fila.hash !== hashDeAuditoria(materialDeAuditoria(fila))) {
      return { secuencia, motivo: "el contenido no coincide con su hash" };
    }
    anterior = fila.hash;
    esperada = secuencia + 1;
  }
  return null;
}

/**
 * Comprueba la cadena entera en Postgres y las últimas `muestra` filas
 * también desde aquí. Si algo no cuadra registra un error (que dispara la
 * alerta operativa) y devuelve el detalle; nunca lanza, para que el
 * mantenimiento siga con lo suyo.
 */
export async function verificarCadenaAuditoria({ muestra = 200 } = {}) {
  const supabase = getSupabaseAdministrativo();
  const resultado = { postgres: "ok", node: "ok", filas: 0 };

  const { data: roturas, error } = await supabase.rpc("verificar_cadena_auditoria", { p_desde: 0 });
  if (error) {
    resultado.postgres = `error: ${error.message}`;
  } else if (Array.isArray(roturas) && roturas.length) {
    resultado.postgres = `rota en ${roturas[0].secuencia}: ${roturas[0].motivo}`;
  }

  const { data: ultimas, error: errorLectura } = await supabase.rpc("ultimas_filas_auditoria", { p_limite: muestra });
  if (errorLectura) {
    resultado.node = `error: ${errorLectura.message}`;
  } else {
    const filas = (ultimas || []).slice().sort((a, b) => Number(a.secuencia) - Number(b.secuencia));
    resultado.filas = filas.length;
    /* La primera fila de la muestra no tiene con qué enlazar: sólo se
       comprueba su hash, y a partir de la segunda, también el enlace. */
    const rotura = filas.length ? primeraRotura(filas, {
      anclaHash: filas[0].hash_anterior, anclaSecuencia: Number(filas[0].secuencia) - 1,
    }) : null;
    if (rotura) resultado.node = `rota en ${rotura.secuencia}: ${rotura.motivo}`;
  }

  const intacta = resultado.postgres === "ok" && resultado.node === "ok";
  logEvent(intacta ? "info" : "error", "auditoria.cadena_verificada", resultado);
  return { intacta, ...resultado };
}
