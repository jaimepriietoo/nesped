import { test } from "node:test";
import assert from "node:assert/strict";
import { Login, SegundoFactor, PostCallElevenLabs, MensajeTwilio, validar } from "@/lib/server/esquemas";

/**
 * Lo que se acepta en la puerta. Lo que importa: que lo bueno pase con la
 * forma de siempre, que lo malo sea un 400 con un mensaje que se entienda,
 * y que los webhooks no pierdan campos que no conocemos.
 */

test("el login normaliza el correo y rechaza lo que no tiene forma", async () => {
  const ok = validar(Login, { email: "  Ana@Empresa.ES ", password: "x", next: "/portal" });
  assert.deepEqual(ok.datos, { email: "ana@empresa.es", password: "x", next: "/portal" });
  assert.equal(validar(Login, { email: "ana@empresa.es", password: "x" }).datos.next, "");

  for (const malo of [{}, { email: "ana", password: "x" }, { email: "a@b.es" }, { email: 5, password: "x" }]) {
    const r = validar(Login, malo, { mensaje: "Faltan email o contraseña" });
    assert.equal(r.respuesta?.status, 400, JSON.stringify(malo));
    assert.match((await r.respuesta.json()).message, /^Faltan email o contraseña/);
  }
});

test("el segundo factor acepta seis dígitos o un código de recuperación, y nada más", () => {
  assert.equal(validar(SegundoFactor, { code: " 123456 " }).datos.code, "123456");
  assert.equal(validar(SegundoFactor, { code: "abcde-fghij" }).datos.code, "abcde-fghij");
  assert.equal(validar(SegundoFactor, { code: "abcdefghij" }).datos.code, "abcdefghij");
  for (const malo of ["12345", "1234567", "' or 1=1", "", "a".repeat(40)]) {
    assert.equal(validar(SegundoFactor, { code: malo }).respuesta?.status, 400, malo);
  }
});

test("los webhooks comprueban la forma de lo que usan y dejan pasar el resto", () => {
  const evento = {
    type: "post_call_transcription",
    data: { conversation_id: "conv_1", transcript: [{ role: "agent", message: "hola" }], analysis: { x: 1 },
      conversation_initiation_client_data: { dynamic_variables: { client_id: "acme" }, otra_cosa: true } },
    campo_nuevo_del_proveedor: { a: 1 },
  };
  const r = validar(PostCallElevenLabs, evento);
  assert.equal(r.respuesta, undefined);
  assert.deepEqual(r.datos, evento, "no se pierde nada");
  assert.equal(validar(PostCallElevenLabs, { data: { conversation_id: 42 } }).respuesta?.status, 400);
  assert.equal(validar(PostCallElevenLabs, {}).respuesta, undefined, "un evento vacío es un evento, no un error");

  const sms = { MessageSid: "SM1", From: "whatsapp:+34600", To: "whatsapp:+34900", Body: "Hola", NumMedia: "0", ProfileName: "Ana" };
  assert.deepEqual(validar(MensajeTwilio, sms).datos, sms);
  assert.equal(validar(MensajeTwilio, { Body: "x".repeat(5000) }).respuesta?.status, 400);
});
