import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Webhooks salientes. Lo que se sujeta: que emitir nunca manda nada dentro
 * de la petición (lo hace la cola), que la cola tiene su oficio, que la URL
 * se comprueba antes de cada envío, que un 4xx no se reintenta y un 5xx sí,
 * y que las dos fuentes de eventos avisan sin poder tumbar lo suyo.
 */
const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("emitir apunta y encola; mandar es cosa de la cola", () => {
  const s = leer("lib/server/webhooks-salientes.js");
  const emitir = s.slice(s.indexOf("export async function emitirWebhook("), s.indexOf("export async function entregarWebhook("));
  assert.doesNotMatch(emitir, /peticionExternaSegura\(/, "emitir no sale a la red");
  assert.match(emitir, /encolar\(\{[\s\S]*tipo: "webhook_saliente"/);
  assert.match(leer("app/api/cola/procesar/route.js"), /webhook_saliente:\s*\(t\)\s*=>\s*entregarWebhook\(/);
});

test("cada envío comprueba la URL, va firmado, y un 4xx no se reintenta", () => {
  const s = leer("lib/server/webhooks-salientes.js");
  const entregar = s.slice(s.indexOf("export async function entregarWebhook("));
  assert.match(entregar, /comprobarUrlExterna\(entrega\.url\)/);
  assert.match(entregar, /signWebhook\(entrega\.client_id, cuerpo\)/);
  assert.match(entregar, /codigo >= 400 && codigo < 500 && codigo !== 408 && codigo !== 429/);
  assert.match(entregar, /throw new SinArreglo/);
});

test("la llamada terminada y el contacto actualizado avisan sin await", () => {
  assert.match(leer("lib/server/elevenlabs.js"), /void emitirWebhook\(\{[\s\S]*EVENTOS\.LLAMADA_TERMINADA/);
  assert.match(leer("app/api/leads/update/route.js"), /void emitirWebhook\(\{[\s\S]*EVENTOS\.CONTACTO_ACTUALIZADO/);
  /* Y la transcripción entera no viaja. */
  const bloque = leer("lib/server/elevenlabs.js").split("EVENTOS.LLAMADA_TERMINADA")[1].split("});")[0];
  assert.doesNotMatch(bloque, /transcript/);
});

test("el portal enseña las entregas acotadas a la empresa y sólo quien puede probar el webhook", () => {
  const s = leer("app/api/portal/webhook/entregas/route.js");
  assert.match(s, /ctx\.datos\.from\("webhook_entregas"\)/);
  assert.match(s, /puede\(ctx\.role, "api\.test", ctx\.permissions\)/);
  assert.match(s, /requireSameOrigin\(req\)/);
});
