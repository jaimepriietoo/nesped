import assert from "node:assert/strict";
import test from "node:test";

import { buscarSecretosEnTexto } from "../../scripts/revisar-secretos.mjs";

test("el detector ignora referencias y valores sintéticos", () => {
  const nombre = ["ELEVENLABS", "API", "KEY"].join("_");
  const texto = [`${nombre}=placeholder`, `${nombre}=\${process.env.SECRET}`, `${nombre}: \${{ secrets.SECRET }}`].join("\n");
  assert.deepEqual(buscarSecretosEnTexto(texto), []);
});

test("el detector encuentra formatos conocidos sin devolver su valor", () => {
  const secreto = ["sk", "-", "A".repeat(28)].join("");
  const hallazgos = buscarSecretosEnTexto(`token=${secreto}`);

  assert.equal(hallazgos.length, 1);
  assert.equal(hallazgos[0].tipo, "clave de OpenAI");
  assert.equal(JSON.stringify(hallazgos).includes(secreto), false);
});

test("el detector encuentra asignaciones sensibles aunque el proveedor cambie de formato", () => {
  const nombre = ["TWILIO", "AUTH", "TOKEN"].join("_");
  const hallazgos = buscarSecretosEnTexto(`${nombre}=${"z".repeat(32)}`);

  assert.equal(hallazgos.length, 1);
  assert.match(hallazgos[0].tipo, /TWILIO/);
});
