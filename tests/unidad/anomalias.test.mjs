import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { REGLAS, fueraDeHorario, PARA_PRUEBAS } from "../../lib/server/anomalias.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const regla = (id) => REGLAS.find((r) => r.id === id);
const en = (hora, minuto = 0) => `2026-09-21T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00+02:00`;

test("el horario se mide en hora de Madrid, no en UTC", () => {
  assert.equal(fueraDeHorario(en(3)), true);
  assert.equal(fueraDeHorario(en(7)), false);
  assert.equal(fueraDeHorario(en(21, 59)), false);
  assert.equal(fueraDeHorario(en(22)), true);
  /* 23:30 UTC del 20 son 01:30 en Madrid: fuera. */
  assert.equal(fueraDeHorario("2026-09-20T23:30:00Z"), true);
});

test("las ráfagas cuentan dentro de una ventana, no en total", () => {
  const filas = [0, 10, 20, 30, 40].map((min) => ({ actor: "a", created_at: en(10, min) }));
  assert.deepEqual(PARA_PRUEBAS.rafagas(filas, (f) => f.actor, 60 * 60_000, 5), [{ clave: "a", veces: 5 }]);
  const dispersas = [0, 1, 2, 3, 4].map((h) => ({ actor: "a", created_at: en(10 + h) }));
  assert.deepEqual(PARA_PRUEBAS.rafagas(dispersas, (f) => f.actor, 60 * 60_000, 5), []);
});

test("exportar de madrugada dispara; exportar a media mañana, no", async () => {
  const r = regla("exportacion_fuera_de_horario");
  const hallazgos = await r.evaluar({ auditoria: [
    { action: "contacts_exported", actor: "ana@x.com", created_at: en(3, 12) },
    { action: "contacts_exported", actor: "ana@x.com", created_at: en(11) },
    { action: "lead_updated", actor: "ana@x.com", created_at: en(3) },
  ], denegados: [] });
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].quien, "ana@x.com");
  assert.match(hallazgos[0].detalle, /3h/);
});

test("cuatro exportaciones en un día y cinco cambios de permisos en una hora disparan", async () => {
  const exportaciones = [0, 1, 2, 3].map((h) => ({ action: "contacts_exported", actor: "b@x.com", created_at: en(9 + h) }));
  assert.equal((await regla("exportaciones_masivas").evaluar({ auditoria: exportaciones, denegados: [] })).length, 1);
  assert.equal((await regla("exportaciones_masivas").evaluar({ auditoria: exportaciones.slice(0, 3), denegados: [] })).length, 0);

  const permisos = [0, 5, 10, 15, 20].map((m) => ({ action: "permissions_updated", actor: "c@x.com", created_at: en(12, m) }));
  assert.equal((await regla("permisos_en_rafaga").evaluar({ auditoria: permisos, denegados: [] })).length, 1);
});

test("cinco «sin permisos» en una hora del mismo usuario disparan y dicen el rol", async () => {
  const denegados = [0, 2, 4, 6, 8].map((m) => ({ email: "v@x.com", role: "viewer", ruta: "api.portal.leads.update", created_at: en(15, m) }));
  const hallazgos = await regla("lectura_probando_escritura").evaluar({ auditoria: [], denegados });
  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].quien, "v@x.com");
  assert.match(hallazgos[0].detalle, /viewer/);
});

test("cada regla tiene id, título, severidad y evaluador; los ids no se repiten", () => {
  const ids = REGLAS.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const r of REGLAS) {
    assert.ok(r.id && r.titulo && ["low", "medium", "high"].includes(r.severidad) && typeof r.evaluar === "function", r.id);
  }
});

test("un país nuevo exige segundo factor en el login y se anota al entrar", () => {
  const login = leer("app/api/login/route.js");
  assert.match(login, /x-vercel-ip-country/);
  assert.match(login, /if \(totp\.enabled \|\| origen\.nuevo \|\|/);
  assert.match(login, /anotarPais\(/);
  const dosFa = leer("app/api/login/2fa/route.js");
  assert.match(dosFa, /anotarPais\(\{ email: challenge\.email, clientId: challenge\.clientId, pais: challenge\.pais/);
  const modulo = leer("lib/server/anomalias.js");
  assert.match(modulo, /getSupabaseAdministrativo/);
  assert.doesNotMatch(modulo, /getSupabase\(\)/);
});

test("los 403 del portal se anotan desde observeRoute sin bloquear la respuesta", () => {
  const obs = leer("lib/server/observability.mjs");
  assert.match(obs, /response\?\.status === 403 && ctx\.client_id && ctx\.user_email/);
  assert.match(obs, /void import\("@\/lib\/server\/anomalias"\)/, "import dinámico: fuera del bundle del proxy");
  const mantenimiento = leer("lib/server/mantenimiento.js");
  assert.match(mantenimiento, /evaluarAnomalias\(\)/);
  assert.match(mantenimiento, /purgar_accesos_denegados/);
});
