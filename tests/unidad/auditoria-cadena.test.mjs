import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  crearCheckpointAuditoria,
  firmarCheckpointAuditoria,
  hashDeAuditoria,
  materialDeAuditoria,
  primeraRotura,
  verificarCadenaAuditoria,
} from "../../lib/server/auditoria-cadena.js";

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
  const verificador = fs.readFileSync(path.join(RAIZ, "scripts/verificar-auditoria.mjs"), "utf8");
  assert.match(verificador, /abrirSobresDeEntorno\(\)/, "el verificador manual abre también secretos KMS");
  const modulo = fs.readFileSync(path.join(RAIZ, "lib/server/auditoria-cadena.js"), "utf8");
  assert.match(modulo, /getSupabaseAdministrativo/, "cruza empresas: pide el cliente administrativo por su nombre");
  assert.doesNotMatch(modulo, /getSupabase\(\)/);
});

test("el checkpoint firma sólo secuencia y hash, sin incluir su secreto", () => {
  const env = { NESPED_AUDIT_CHECKPOINT_SECRET: "c".repeat(64) };
  const datos = {
    secuencia: 91,
    hash: "a".repeat(64),
    emitido_en: "2026-09-22T12:00:00.000Z",
  };
  const firma = firmarCheckpointAuditoria(datos, env);
  assert.match(firma, /^[a-f0-9]{64}$/);
  assert.notEqual(firma, firmarCheckpointAuditoria({ ...datos, secuencia: 92 }, env));

  const checkpoint = crearCheckpointAuditoria(datos, { env, ahora: () => datos.emitido_en });
  assert.equal(checkpoint.estado, "firmado");
  assert.equal(checkpoint.firma, `v1=${firma}`);
  assert.doesNotMatch(JSON.stringify(checkpoint), new RegExp(env.NESPED_AUDIT_CHECKPOINT_SECRET));
  assert.deepEqual(Object.keys(checkpoint).sort(), [
    "emitido_en", "estado", "firma", "hash", "secuencia", "version",
  ]);
});

test("el checkpoint exige un secreto exclusivo y sin él no genera ningún ancla", () => {
  assert.deepEqual(crearCheckpointAuditoria({ secuencia: 1, hash: "a".repeat(64) }, { env: {} }), {
    estado: "no_configurado",
  });
  assert.throws(() => firmarCheckpointAuditoria({
    secuencia: 1, hash: "a".repeat(64), emitido_en: "2026-09-22T12:00:00.000Z",
  }, { NESPED_AUDIT_CHECKPOINT_SECRET: "corta" }), /32 bytes/);
  const reutilizado = "r".repeat(64);
  assert.throws(() => firmarCheckpointAuditoria({
    secuencia: 1, hash: "a".repeat(64), emitido_en: "2026-09-22T12:00:00.000Z",
  }, { NESPED_AUDIT_CHECKPOINT_SECRET: reutilizado, NESPED_SESSION_SECRET: reutilizado }), /exclusivo/);
});

test("la comprobación ancla sólo una cadena intacta y detecta errores de configuración", async () => {
  const filas = cadena(3);
  const supabase = {
    async rpc(nombre) {
      if (nombre === "verificar_cadena_auditoria") return { data: [], error: null };
      return { data: filas.slice().reverse(), error: null };
    },
  };
  let registrada;
  const correcta = await verificarCadenaAuditoria({
    supabase,
    crearCheckpoint: (fila) => ({ estado: "firmado", secuencia: fila.secuencia }),
    registrarCheckpoint: (checkpoint) => { registrada = checkpoint; },
  });
  assert.equal(correcta.operativa, true);
  assert.equal(correcta.checkpoint, "firmado");
  assert.equal(registrada.secuencia, 3);

  const fallo = await verificarCadenaAuditoria({
    supabase,
    crearCheckpoint: () => { throw new Error("configuración inválida"); },
  });
  assert.equal(fallo.intacta, true, "un fallo de firma no inventa una rotura de la cadena");
  assert.equal(fallo.operativa, false);
  assert.equal(fallo.checkpoint, "error");

  let intentos = 0;
  const rota = cadena(3);
  rota[1].hash = "b".repeat(64);
  const resultadoRoto = await verificarCadenaAuditoria({
    supabase: { async rpc(nombre) {
      return nombre === "verificar_cadena_auditoria"
        ? { data: [{ secuencia: 2, motivo: "hash inválido" }], error: null }
        : { data: rota, error: null };
    } },
    crearCheckpoint: () => { intentos += 1; return { estado: "firmado" }; },
  });
  assert.equal(resultadoRoto.intacta, false);
  assert.equal(intentos, 0, "una cadena rota nunca se ancla como válida");
});
