import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * La bandeja de webhooks.
 *
 * Lo que se sujeta aquí no es la tabla: es la forma. Que el endpoint de
 * ElevenLabs no procese nada dentro de la petición, que el de WhatsApp
 * tampoco, que la cola sepa qué hacer con un evento guardado, que lo que
 * falla se pueda ver y reintentar, y que reprocesar no repita efectos porque
 * cada proveedor reclama su identificador antes de tenerlos.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("el post-call de ElevenLabs sólo verifica, guarda y contesta", () => {
  const s = leer("app/api/voice/elevenlabs/post-call/route.js");
  assert.match(s, /verifyElevenLabsWebhookSignature/);
  assert.match(s, /guardarEvento\(/);
  assert.doesNotMatch(s, /persistElevenLabsCall\(/, "el procesado no puede ir dentro de la petición");
});

test("el webhook de WhatsApp sólo verifica, guarda y contesta; el proceso es una función aparte", () => {
  const s = leer("app/api/whatsapp/webhook/route.js");
  assert.match(s, /export async function procesarMensajeEntrante\(/);
  assert.match(s, /guardarEvento\(/);
  /* Y el proceso reclama el MessageSid antes de contestar: un reintento de
     Twilio o un reproceso desde administración no manda el mensaje dos veces. */
  assert.match(s, /reclamar_webhook[\s\S]{0,200}twilio-whatsapp/);
  /* El POST no llama al proceso: lo hace la cola. */
  const post = s.slice(s.indexOf("async function manejarPOST("));
  assert.doesNotMatch(post, /procesarMensajeEntrante\(/);
  assert.doesNotMatch(post, /getOpenAI\(|reservarGeneracionIA\(/, "la petición no habla con OpenAI");
});

test("la cola tiene un ejecutor para los webhooks y administración puede reintentarlos", () => {
  assert.match(leer("app/api/cola/procesar/route.js"), /webhook:\s*\(t\)\s*=>\s*procesarEvento\(/);
  const admin = leer("app/api/admin/cola/route.js");
  assert.match(admin, /reintentarEvento\(/);
  assert.match(admin, /eq\("estado", "fallido"\)/);
  assert.match(admin, /getAdminContext\(\)/, "sólo administración");
  assert.match(admin, /requireSameOrigin\(/, "el reintento es una escritura: origen comprobado");
});

test("Stripe se guarda en la bandeja y se procesa en la misma petición; si lo esencial falla, suelta la reclamación", () => {
  const ruta = leer("app/api/stripe/webhook/route.js");
  assert.match(ruta, /guardarEvento\(\{[\s\S]*proveedor: "stripe"[\s\S]*enLinea: true/);
  assert.doesNotMatch(ruta, /processStripeWebhookEvent\(/, "la ruta no procesa por su cuenta: lo hace la bandeja");
  const bandeja = leer("lib/server/bandeja-webhooks.js");
  assert.match(bandeja, /stripe: async/);
  assert.match(bandeja, /WEBHOOKS_EN_LINEA/, "hay palanca de vuelta atrás");
  const servicio = leer("lib/server/stripe-webhook-service.js");
  assert.match(servicio, /webhooks_procesados"\)\.delete\(\)/, "si activar el plan falla, el reintento tiene que poder volver a intentarlo");
});

test("cada proveedor reclama su identificador antes de tener efectos", () => {
  assert.match(leer("lib/server/stripe-webhook-service.js"), /reclamar_webhook/);
  assert.match(leer("lib/server/elevenlabs.js"), /p_proveedor: "elevenlabs"/);
  assert.match(leer("app/api/whatsapp/webhook/route.js"), /p_proveedor: "twilio-whatsapp"/);
});
