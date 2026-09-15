import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { twimlDeDesvio, urlDeDesvio } from "@/lib/server/desvio";

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
  assert.match(ruta, /desvio_activo \? data\.telefono_desvio : ""/, "con el desvío quitado, no se marca aunque quede teléfono");
});

test("activar guarda a dónde apuntaba el número y quitar lo restaura; todo en auditoría", () => {
  const s = leer("lib/server/desvio.js");
  assert.match(s, /desvio_voice_url_anterior = anterior/);
  assert.match(s, /voiceUrl: empresa\.desvio_voice_url_anterior/);
  assert.match(s, /action: "desvio_activado"/);
  assert.match(s, /action: "desvio_quitado"/);
  const admin = leer("app/api/admin/desvio/route.js");
  assert.match(admin, /getAdminContext\(\)/);
  assert.match(admin, /requireSameOrigin\(req\)/);
});
