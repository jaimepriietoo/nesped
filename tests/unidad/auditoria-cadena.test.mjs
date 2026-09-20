import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { hashDeAuditoria, materialDeAuditoria, primeraRotura } from "../../lib/server/auditoria-cadena.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/* Vector calculado en Postgres 17 con material_auditoria() y hash_auditoria()
   sobre estos mismos valores. Si Node no da lo mismo, la comprobación desde
   fuera no vale de nada. */
const FILA = {
  secuencia: 7, hash_anterior: "abc", client_id: "fibergreen", entity_type: "lead",
  entity_id: "l-1", action: "lead_updated", actor: "ana@x.com",
  changes_texto: '{"a": "ñ", "b": [1, 2]}', created_at_utc: "2026-09-20T10:11:12.123456Z",
};
const HASH = "62455a8acabd93fcbe1086a03471b4e3b56e715c9d2a57b0618906b115896a22";

test("Node calcula el mismo hash que Postgres para la misma fila", () => {
  assert.equal(
    materialDeAuditoria(FILA),
    '7|abc|fibergreen|lead|l-1|lead_updated|ana@x.com|{"a": "ñ", "b": [1, 2]}|2026-09-20T10:11:12.123456Z',
  );
  assert.equal(hashDeAuditoria(materialDeAuditoria(FILA)), HASH);
});

function cadena(n, { desde = 1, anterior = null } = {}) {
  const filas = [];
  let previo = anterior;
  for (let i = 0; i < n; i += 1) {
    const fila = {
      secuencia: desde + i, hash_anterior: previo, client_id: "c", entity_type: "lead",
      entity_id: String(i), action: "x", actor: null, changes_texto: "{}",
      created_at_utc: "2026-09-20T00:00:00.000000Z",
    };
    fila.hash = hashDeAuditoria(materialDeAuditoria(fila));
    filas.push(fila);
    previo = fila.hash;
  }
  return filas;
}

test("una cadena bien formada no tiene roturas, con o sin ancla", () => {
  assert.equal(primeraRotura(cadena(5)), null);
  const [ancla, ...resto] = cadena(6);
  assert.equal(primeraRotura(resto, { anclaHash: ancla.hash, anclaSecuencia: ancla.secuencia }), null);
});

test("cambiar, borrar o intercalar una fila se detecta y se dice dónde", () => {
  const editada = cadena(5);
  editada[2].actor = "intruso";
  assert.deepEqual(primeraRotura(editada), { secuencia: 3, motivo: "el contenido no coincide con su hash" });

  const borrada = cadena(5).filter((f) => f.secuencia !== 3);
  assert.deepEqual(primeraRotura(borrada), { secuencia: 4, motivo: "falta la secuencia 3" });

  const reenlazada = cadena(5);
  reenlazada[3].hash_anterior = "otra";
  reenlazada[3].hash = hashDeAuditoria(materialDeAuditoria(reenlazada[3]));
  assert.deepEqual(primeraRotura(reenlazada), { secuencia: 4, motivo: "hash_anterior no enlaza" });

  const purgadaPorElPrincipio = cadena(5).slice(2);
  assert.deepEqual(
    primeraRotura(purgadaPorElPrincipio, { anclaHash: "no-es-este", anclaSecuencia: 2 }),
    { secuencia: 3, motivo: "hash_anterior no enlaza" },
  );
});

test("la migración protege la auditoría y el mantenimiento la verifica", () => {
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migrations/20260920210000_auditoria_encadenada.sql"), "utf8");
  assert.match(sql, /before update or delete on public\.audit_logs\b/);
  assert.match(sql, /before update or delete on public\.audit_logs_archivo/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /app\.archivando_auditoria/);
  const mantenimiento = fs.readFileSync(path.join(RAIZ, "lib/server/mantenimiento.js"), "utf8");
  assert.match(mantenimiento, /verificarCadenaAuditoria\(\)/);
  const modulo = fs.readFileSync(path.join(RAIZ, "lib/server/auditoria-cadena.js"), "utf8");
  assert.match(modulo, /getSupabaseAdministrativo/, "cruza empresas: pide el cliente administrativo por su nombre");
  assert.doesNotMatch(modulo, /getSupabase\(\)/);
});
