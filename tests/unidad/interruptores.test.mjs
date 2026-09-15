import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { Pausado, respuestaSiPausado } from "../../lib/server/interruptores.js";

/**
 * Los interruptores de emergencia.
 *
 * Lo que se comprueba aquí no es que la base de datos guarde un booleano,
 * sino lo que importa: que cada sitio que gasta dinero pregunta antes, y
 * que una pausa se contesta como una decisión (503, con motivo) y no como
 * un fallo (500 sin explicación).
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("toda generación con IA pasa por el interruptor", () => {
  /* reservarGeneracionIA es el único embudo de copiloto, sugerencias y
     autorrespuestas de WhatsApp. Si alguien lo quita de ahí, esto lo dice. */
  assert.match(leer("lib/server/ai-budget.js"), /exigirIAPermitida\(clientId\)/);
  for (const f of ["app/api/portal/copiloto/route.js", "app/api/portal/conversations/suggest/route.js", "app/api/whatsapp/webhook/route.js"]) {
    assert.match(leer(f), /reservarGeneracionIA\(/, `${f} tiene que reservar antes de generar`);
  }
});

test("las llamadas salientes y la cola preguntan antes de gastar", () => {
  assert.match(leer("app/api/demo-call/route.js"), /exigirLlamadasPermitidas\(clientId\)/);
  assert.match(leer("app/api/cola/procesar/route.js"), /colaEnPausa\(\)/);
});

test("una pausa se contesta como decisión: 503 con motivo y Retry-After", async () => {
  const r = respuestaSiPausado(new Pausado("La IA está en pausa", "incidente 42"));
  assert.equal(r.status, 503);
  assert.equal(r.headers.get("Retry-After"), "60");
  const cuerpo = await r.json();
  assert.equal(cuerpo.pausado, true);
  assert.match(cuerpo.message, /incidente 42/);
});

test("un error cualquiera no se disfraza de pausa", () => {
  assert.equal(respuestaSiPausado(new Error("otra cosa")), null);
  assert.equal(respuestaSiPausado(null), null);
});
