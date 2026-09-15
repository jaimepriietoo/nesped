import { test } from "node:test";
import assert from "node:assert/strict";
import { conContexto, contextoActual, ampliarContexto, idDePeticion, CABECERA_PETICION } from "../../lib/server/contexto.mjs";

/**
 * El contexto de una operación sigue a las promesas y llega a los registros.
 *
 * Cualquier registro tiene que poder contestar "¿qué petición?, ¿qué trabajo?,
 * ¿qué empresa?" sin que quien registra pase parámetros. Aquí se comprueba
 * que el contexto atraviesa awaits, que dos operaciones a la vez no se
 * mezclan, y que el id de petición viene del proxy cuando lo hay.
 */

test("el contexto atraviesa awaits y no se mezcla entre operaciones simultáneas", async () => {
  const vistos = await Promise.all([
    conContexto({ request_id: "a" }, async () => { await new Promise((r) => setTimeout(r, 5)); return contextoActual().request_id; }),
    conContexto({ request_id: "b" }, async () => { await new Promise((r) => setTimeout(r, 1)); return contextoActual().request_id; }),
  ]);
  assert.deepEqual(vistos, ["a", "b"]);
  assert.deepEqual(contextoActual(), {}, "fuera de toda operación no hay contexto");
});

test("un contexto interior suma al exterior y se puede ampliar sobre la marcha", async () => {
  await conContexto({ request_id: "r1" }, async () => {
    ampliarContexto({ client_id: "demo" });
    await conContexto({ job_id: 7 }, async () => {
      assert.deepEqual(contextoActual(), { request_id: "r1", client_id: "demo", job_id: 7 });
    });
    assert.equal(contextoActual().job_id, undefined, "lo interior no se escapa hacia fuera");
  });
});

test("el id de petición viene de la cabecera del proxy, o se inventa uno", () => {
  const conCabecera = { headers: new Headers({ [CABECERA_PETICION]: "req_abc" }) };
  assert.equal(idDePeticion(conCabecera), "req_abc");
  assert.match(idDePeticion({ headers: new Headers() }), /^req_[A-Za-z0-9]+$/);
  assert.match(idDePeticion(null), /^req_/);
});

test("logEvent lleva el contexto en cada línea", async () => {
  const { logEvent } = await import("../../lib/server/observability.mjs");
  const lineas = [];
  const original = console.log;
  console.log = (l) => lineas.push(l);
  try {
    await conContexto({ request_id: "req_x", client_id: "demo" }, async () => { logEvent("info", "prueba.evento", { dato: 1 }); });
  } finally { console.log = original; }
  const linea = JSON.parse(lineas.find((l) => String(l).includes("prueba.evento")));
  assert.equal(linea.request_id, "req_x");
  assert.equal(linea.client_id, "demo");
  assert.equal(linea.dato, 1);
});
