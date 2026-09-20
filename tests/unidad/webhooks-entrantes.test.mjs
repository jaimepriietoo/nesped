import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { verifyElevenLabsWebhookSignature } from "../../lib/server/elevenlabs.js";

/**
 * Las tres barreras de cada webhook que entra: firma, ventana temporal y
 * replay. Stripe, ElevenLabs y Twilio las cumplen de formas distintas, y
 * este fichero deja escrito cómo, para que nadie las afloje sin verlo.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const SECRETO = "whsec_" + "a".repeat(40);

function firmaElevenLabs(cuerpo, segundos, secreto = SECRETO) {
  const mac = crypto.createHmac("sha256", secreto).update(`${segundos}.${cuerpo}`).digest("hex");
  return `t=${segundos},v0=${mac}`;
}

test("ElevenLabs: una firma correcta pasa; con más de cinco minutos de desfase, no", () => {
  const cuerpo = JSON.stringify({ type: "post_call_transcription", data: { conversation_id: "c1" } });
  const ahora = Math.floor(Date.now() / 1000);

  assert.equal(verifyElevenLabsWebhookSignature({
    rawBody: cuerpo, signatureHeader: firmaElevenLabs(cuerpo, ahora - 60), secret: SECRETO,
  }), true);
  assert.equal(verifyElevenLabsWebhookSignature({
    rawBody: cuerpo, signatureHeader: firmaElevenLabs(cuerpo, ahora - 6 * 60), secret: SECRETO,
  }), false, "seis minutos es demasiado");
  assert.equal(verifyElevenLabsWebhookSignature({
    rawBody: cuerpo, signatureHeader: firmaElevenLabs(cuerpo, ahora + 6 * 60), secret: SECRETO,
  }), false, "del futuro tampoco");
});

test("ElevenLabs: cuerpo cambiado, otro secreto o cabecera vacía no pasan", () => {
  const cuerpo = "{}";
  const ahora = Math.floor(Date.now() / 1000);
  const firma = firmaElevenLabs(cuerpo, ahora);

  assert.equal(verifyElevenLabsWebhookSignature({ rawBody: "{ }", signatureHeader: firma, secret: SECRETO }), false);
  assert.equal(verifyElevenLabsWebhookSignature({ rawBody: cuerpo, signatureHeader: firma, secret: "otro" }), false);
  assert.equal(verifyElevenLabsWebhookSignature({ rawBody: cuerpo, signatureHeader: "", secret: SECRETO }), false);
  assert.equal(verifyElevenLabsWebhookSignature({ rawBody: cuerpo, signatureHeader: firma, secret: "" }), false);
});

test("ElevenLabs: sin conversation_id no se guarda nada; con él, el replay lo para la bandeja", () => {
  const s = leer("app/api/voice/elevenlabs/post-call/route.js");
  const verificacion = s.indexOf("verifyElevenLabsWebhookSignature(");
  const guardado = s.indexOf("guardarEvento(");
  assert.ok(verificacion > 0 && guardado > verificacion, "la firma se comprueba antes de guardar");
  assert.match(s, /if \(!conversationId\)[\s\S]{0,200}status: 400/);
  assert.match(s, /eventoId: conversationId/);
});

test("Stripe: constructEvent con la tolerancia por defecto (300 s) y replay por event.id", () => {
  for (const ruta of ["app/api/stripe/webhook/route.js", "app/api/stripe/subscription-webhook/route.js"]) {
    const s = leer(ruta);
    const llamada = /stripe\.webhooks\.constructEvent\(([^)]*)\)/.exec(s);
    assert.ok(llamada, `${ruta}: falta constructEvent`);
    const argumentos = llamada[1].split(",").map((a) => a.trim()).filter(Boolean);
    assert.equal(argumentos.length, 3, `${ruta}: no se debe sobrescribir la tolerancia de Stripe`);
    assert.match(s, /leerTextoLimitado\(req/, `${ruta}: la firma se comprueba sobre el cuerpo crudo y acotado`);
  }
  const principal = leer("app/api/stripe/webhook/route.js");
  assert.match(principal, /eventoId: event\.id/, "el replay se corta por event.id en la bandeja");
});

test("Twilio: firma sobre la URL pública y replay por MessageSid antes de cualquier efecto", () => {
  const s = leer("app/api/whatsapp/webhook/route.js");
  assert.match(s, /verificarWebhookTwilio\(\{ url: urlPublica/);
  const proceso = s.slice(s.indexOf("export async function procesarMensajeEntrante("));
  const reclamo = proceso.indexOf("reclamar_webhook");
  const primerEfecto = Math.min(
    ...["enviarWhatsApp(", "enviarSms(", "getOpenAI(", "lead_events"]
      .map((marca) => proceso.indexOf(marca)).filter((i) => i > 0),
  );
  assert.ok(reclamo > 0 && reclamo < primerEfecto, "el MessageSid se reclama antes de contestar o escribir");
});

test("Twilio: la firma no lleva marca de tiempo, así que la ventana la pone el MessageSid único", () => {
  /* Twilio firma HMAC-SHA1(url + params) sin timestamp. No hay forma de
     exigir "cinco minutos" en la firma; la protección equivalente es que un
     mismo MessageSid sólo se procesa una vez, y eso lo garantiza
     reclamar_webhook() con su índice único (proveedor, evento_id). */
  const migraciones = fs.readdirSync(path.join(RAIZ, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => leer(path.join("supabase/migrations", f)))
    .join("\n");
  assert.match(migraciones, /reclamar_webhook/);
});
