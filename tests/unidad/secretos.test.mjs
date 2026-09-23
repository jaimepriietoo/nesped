import assert from "node:assert/strict";
import test from "node:test";

import { buscarSecretosEnTexto } from "../../scripts/revisar-secretos.mjs";

test("el detector ignora referencias y valores sintéticos", () => {
  const nombre = ["ELEVENLABS", "API", "KEY"].join("_");
  const nombreTotp = ["NESPED", "TOTP", "ENCRYPTION", "KEY"].join("_");
  const texto = [
    `${nombre}=placeholder`,
    `${nombre}=\${process.env.SECRET}`,
    `${nombre}: \${{ secrets.SECRET }}`,
    `${nombreTotp}: env.${nombreTotp}`,
    `${nombreTotp} = Buffer.alloc(32, 7).toString('base64')`,
  ].join("\n");
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

test("el detector cubre los secretos internos, de cifrado y de despliegue", () => {
  const nombres = [
    "SUPABASE_JWT_SECRET",
    "NESPED_TOTP_ENCRYPTION_KEY",
    "NESPED_DATA_ENCRYPTION_KEY",
    "NESPED_DATA_ENCRYPTION_KEY_ANTERIOR",
    "NESPED_AUDIT_CHECKPOINT_SECRET",
    "CRON_SECRET",
    "ELEVENLABS_WEBHOOK_SECRET",
    "VERCEL_TOKEN",
    "UPSTASH_REDIS_REST_TOKEN",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
  ];

  for (const nombre of nombres) {
    const valor = "z".repeat(48);
    const hallazgos = buscarSecretosEnTexto(`${nombre}=${valor}`);
    assert.equal(hallazgos.length, 1, nombre);
    assert.match(hallazgos[0].tipo, new RegExp(nombre));
    assert.equal(JSON.stringify(hallazgos).includes(valor), false, nombre);
  }
});
