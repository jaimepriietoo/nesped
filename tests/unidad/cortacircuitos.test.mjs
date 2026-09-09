import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_PRUEBAS, noEsDelProveedor, ProveedorCaido } from "@/lib/server/cortacircuitos";

const { estaAbierto, UMBRAL, CACHE_MS } = PARA_PRUEBAS;

/**
 * El cortacircuitos existe para que la caída de otro no se convierta en la
 * factura de uno. Lo que se prueba aquí son las dos decisiones que, mal
 * puestas, lo convierten en un problema peor que el que resuelve.
 *
 * La escalada de espera y el conteo atómico son de Postgres, y se comprobaron
 * contra la base de datos: cinco fallos abren, y la espera va 60, 120, 240,
 * 480, 960, 1920, 3600, 3600.
 */

test("un plazo vencido es un circuito cerrado", () => {
  /* Si un plazo pasado siguiera contando como abierto, un proveedor que se
     cayó una vez quedaría apagado para siempre. */
  assert.equal(estaAbierto({ abierto_hasta: new Date(Date.now() - 1000).toISOString() }), false);
});

test("un plazo por vencer es un circuito abierto", () => {
  assert.equal(estaAbierto({ abierto_hasta: new Date(Date.now() + 60_000).toISOString() }), true);
});

test("sin fila, cerrado: un proveedor del que no se sabe nada se intenta", () => {
  /* La primera llamada a un proveedor nuevo no tiene fila. Tratar eso como
     "abierto" dejaría el sistema sin mandar nada hasta que alguien insertara
     filas a mano. */
  assert.equal(estaAbierto(null), false);
  assert.equal(estaAbierto({ abierto_hasta: null }), false);
});

test("un error de datos no cuenta como caída del proveedor", () => {
  /* Un número mal escrito hace que Telnyx conteste 400. Contarlo como caída
     abriría el circuito por un solo contacto con el teléfono mal metido y
     dejaría a toda la plataforma sin mandar mensajes. */
  const err = noEsDelProveedor(new Error("número inválido"));
  assert.equal(err.noEsDelProveedor, true);
});

test("marcar un error devuelve el mismo error, no una copia", () => {
  /* Se usa como `throw noEsDelProveedor(error)`. Si devolviera otra cosa, el
     mensaje y el estado se perderían por el camino. */
  const original = new Error("x");
  original.estado = 422;
  assert.equal(noEsDelProveedor(original), original);
  assert.equal(original.estado, 422);
});

test("ProveedorCaido dice quién y hasta cuándo", () => {
  /* Este error acaba en el campo `error` de la cola, y es lo único que va a
     leer quien mire por qué un trabajo lleva media hora sin salir. */
  const err = new ProveedorCaido("resend", "2026-09-09T18:00:00Z");
  assert.equal(err.proveedor, "resend");
  assert.match(err.message, /resend/);
  assert.match(err.message, /2026-09-09/);
});

test("el umbral deja pasar fallos sueltos", () => {
  /* Abrir al primer fallo convertiría cualquier hipo de red en una parada.
     Abrir al vigésimo llegaría tarde. */
  assert.ok(UMBRAL >= 3 && UMBRAL <= 10);
});

test("la cache dura segundos, no minutos", () => {
  /* Es el tiempo que se sigue llamando a un proveedor recién caído. Con
     minutos, el cortacircuitos llegaría tarde a su propio trabajo. */
  assert.ok(CACHE_MS > 0 && CACHE_MS <= 15_000);
});
