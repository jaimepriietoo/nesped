import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cifrarSecretoTotp,
  codigoTotp,
  descifrarSecretoTotp,
  encontrarPasoTotp,
  generarSecretoTotp,
  uriTotp,
} from "@/lib/server/totp";

test("TOTP sigue el vector RFC y admite sólo un intervalo de desfase", () => {
  const secreto = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
  assert.equal(codigoTotp(secreto, 59_000), "287082");
  assert.equal(encontrarPasoTotp(secreto, "287082", 59_000), 1);
  assert.equal(encontrarPasoTotp(secreto, "287082", 119_000), null);
  assert.equal(encontrarPasoTotp(secreto, "abc082", 59_000), null);
});

test("el secreto TOTP se cifra con AES-GCM y una alteración no descifra", () => {
  const anterior = process.env.NESPED_TOTP_ENCRYPTION_KEY;
  process.env.NESPED_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  try {
    const secreto = generarSecretoTotp();
    assert.match(secreto, /^[A-Z2-7]{32}$/);
    const cifrado = cifrarSecretoTotp(secreto);
    assert.doesNotMatch(cifrado, new RegExp(secreto));
    assert.equal(descifrarSecretoTotp(cifrado), secreto);
    assert.throws(() => descifrarSecretoTotp(`${cifrado}x`), /descifrar/);
  } finally {
    if (anterior === undefined) delete process.env.NESPED_TOTP_ENCRYPTION_KEY;
    else process.env.NESPED_TOTP_ENCRYPTION_KEY = anterior;
  }
});

test("la URI TOTP identifica la cuenta sin meter secretos en la ruta", () => {
  const uri = uriTotp({ secreto: "ABC234", email: " Persona@Empresa.ES " });
  assert.match(uri, /^otpauth:\/\/totp\/Nesped%3Apersona%40empresa\.es\?/);
  assert.match(uri, /secret=ABC234/);
  assert.match(uri, /issuer=Nesped/);
  assert.doesNotMatch(uri.split("?")[0], /ABC234/);
});
