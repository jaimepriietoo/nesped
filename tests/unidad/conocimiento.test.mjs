import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { bloqueDeConocimiento, bloqueRuperta, NOMBRE_ACTIVACION } from "../../lib/server/conocimiento.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

test("el bloque de conocimiento va al prompt con fecha de fin y sin pasarse de doce", () => {
  assert.equal(bloqueDeConocimiento([]), "");
  const b = bloqueDeConocimiento([
    { texto: "Valdestillas   está sin servicio", vigente_hasta: "2026-09-21T16:00:00Z" },
    { texto: "La oferta de fibra acaba el viernes", vigente_hasta: null },
  ]);
  assert.match(b, /^LO QUE LA EMPRESA QUIERE QUE SEPAS AHORA/);
  assert.match(b, /- Valdestillas está sin servicio \(hasta /);
  assert.match(b, /- La oferta de fibra acaba el viernes$/m);
  const muchos = bloqueDeConocimiento(Array.from({ length: 30 }, (_, i) => ({ texto: `aviso ${i}` })));
  assert.equal((muchos.match(/^- /gm) || []).length, 12);
});

test("Ruperta sólo se ofrece a quien está autorizado; al resto se le dice que no", () => {
  const no = bloqueRuperta({ permitido: false });
  assert.match(no, new RegExp(`"${NOMBRE_ACTIVACION}"`));
  assert.match(no, /no puedes hacer eso/);
  assert.doesNotMatch(no, /anotar_instruccion/);
  const si = bloqueRuperta({ permitido: true });
  assert.match(si, /MODO RUPERTA/);
  assert.match(si, /pídele el PIN/);
  assert.match(si, /anotar_instruccion/);
  assert.match(si, /Si el PIN es incorrecto, dilo y no anotes nada/);
});

test("el servidor no se fía de la voz: número autorizado y PIN se comprueban al anotar", () => {
  const m = leer("lib/server/conocimiento.js");
  const anotar = m.slice(m.indexOf("export async function anotarPorVoz"));
  assert.match(anotar, /estadoRuperta\(/, "vuelve a comprobar el número");
  assert.match(anotar, /verifyPassword\(String\(pin \|\| ""\), ajustes\?\.ruperta_pin_hash/, "vuelve a comprobar el PIN");
  assert.match(anotar, /ruperta_pin_incorrecto/, "un PIN malo queda en la auditoría");
  assert.match(anotar, /avisarInstruccion\(/, "los owners se enteran por correo");
  assert.match(m, /hashPassword\(String\(pin\)\)/, "el PIN nunca se guarda en claro");
  const ruta = leer("app/api/voice/elevenlabs/instruccion/route.js");
  assert.match(ruta, /requireInternalRequest\(req\)/);
  assert.match(ruta, /validar\(InstruccionPorVoz/);
});

test("el conocimiento entra en la voz, en WhatsApp y en el copiloto; la voz recibe el estado de Ruperta", () => {
  assert.match(leer("app/api/voice/elevenlabs/context/route.js"), /bloqueDeConocimiento\(conocimiento\), REPREGUNTAR, bloqueRuperta\(ruperta\)/);
  assert.match(leer("app/api/voice/elevenlabs/context/route.js"), /ruperta_permitido: ruperta\.permitido/);
  assert.match(leer("app/api/whatsapp/webhook/route.js"), /conocimiento: bloqueDeConocimiento\(conocimiento\)/);
  assert.match(leer("app/api/portal/conversations/suggest/route.js"), /conocimiento: bloqueDeConocimiento\(conocimiento\)/);
  const portal = leer("app/api/portal/conocimiento/route.js");
  assert.match(portal, /puede\(ctx\.role, "ai\.configure", ctx\.permissions\)/);
  assert.match(portal, /validar\(GestionConocimiento, cuerpo\.datos\)/);
  assert.match(portal, /requireRateLimitAsync\(req/);
});
