import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { twimlDeDesvio, urlDeDesvio } from "@/lib/server/desvio";
import { POST as recibirDesvio } from "../../app/api/voice/desvio/route.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("el TwiML marca al teléfono limpio, y sin teléfono no marca a nadie", () => {
  assert.match(twimlDeDesvio("+34 600 00 00 00"), /<Dial timeout="25">\+34600000000<\/Dial>/);
  assert.doesNotMatch(twimlDeDesvio("<script>+34600"), /<script>/);
  assert.match(twimlDeDesvio(""), /<Say/);
  assert.doesNotMatch(twimlDeDesvio(""), /<Dial/);
});

test("la URL del desvío lleva la empresa y el TwiML sólo lo sirve a Twilio", () => {
  assert.match(urlDeDesvio("acme"), /\/api\/voice\/desvio\?empresa=acme$/);
  const ruta = leer("app/api/voice/desvio/route.js");
  assert.match(ruta, /verificarWebhookTwilio\(/);
  assert.match(ruta, /leerTextoLimitado\(req, \{ maxBytes: 16 \* 1024 \}\)/);
  assert.match(ruta, /validar\(FormularioTwilio/);
  assert.match(ruta, /validar\(EmpresaDesvio/);
  assert.match(ruta, /desvio_activo \? data\.telefono_desvio : ""/, "con el desvío quitado, no se marca aunque quede teléfono");
});

test("el webhook de desvío rechaza cuerpos grandes antes de verificarlos", async () => {
  const respuesta = await recibirDesvio(new Request("https://www.nesped.com/api/voice/desvio?empresa=acme", {
    method: "POST",
    body: "x".repeat(16 * 1024 + 1),
  }));
  assert.equal(respuesta.status, 413);
});

test("el webhook firmado rechaza una empresa con forma inválida antes de consultar la base", async () => {
  const tokenAnterior = process.env.TWILIO_AUTH_TOKEN;
  const token = "token-de-prueba-no-real";
  const url = "https://www.nesped.com/api/voice/desvio?empresa=../otra";
  const campos = { CallSid: "CA123" };
  const cuerpo = new URLSearchParams(campos).toString();
  const cadena = Object.keys(campos).sort().reduce((acc, clave) => acc + clave + campos[clave], url);
  const firma = crypto.createHmac("sha1", token).update(Buffer.from(cadena, "utf8")).digest("base64");
  process.env.TWILIO_AUTH_TOKEN = token;
  try {
    const respuesta = await recibirDesvio(new Request(url, {
      method: "POST",
      headers: { "x-twilio-signature": firma },
      body: cuerpo,
    }));
    assert.equal(respuesta.status, 400);
  } finally {
    if (tokenAnterior === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = tokenAnterior;
  }
});

test("activar guarda a dónde apuntaba el número y quitar lo restaura; todo en auditoría", () => {
  const s = leer("lib/server/desvio.js");
  assert.match(s, /desvio_voice_url_anterior = anterior/);
  assert.match(s, /voiceUrl: empresa\.desvio_voice_url_anterior/);
  assert.match(s, /action: "desvio_activado"/);
  assert.match(s, /action: "desvio_quitado"/);
  const auditoria = s.slice(s.indexOf('action: "desvio_activado"'));
  assert.doesNotMatch(auditoria, /changes: \{ a: destino|changes: \{ restaurado:/, "el audit log no copia teléfono ni URL");
  assert.doesNotMatch(auditoria, /entity_id: empresa\.twilio_number/, "el audit log no usa el número como identificador");
  assert.match(auditoria, /destino_configurado: true/);
  assert.match(auditoria, /url_anterior_restaurada: Boolean/);
  const admin = leer("app/api/admin/desvio/route.js");
  assert.match(admin, /getAdminContext\(\)/);
  assert.match(admin, /requireSameOrigin\(req\)/);
});
