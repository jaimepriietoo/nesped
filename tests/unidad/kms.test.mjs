import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { abrirSobre, abrirSobresDeEntorno, cerrarSobre, clienteKms, esSobre, SECRETOS_EN_SOBRE, PARA_PRUEBAS } from "../../lib/server/kms.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");

/* Un KMS de mentira: cifra con base64 y exige el mismo contexto al abrir,
   que es lo que hace el de verdad. */
function kmsFalso() {
  const llamadas = [];
  return {
    llamadas,
    async send(cmd) {
      const { input } = cmd;
      llamadas.push(cmd.constructor.name);
      if (cmd.constructor.name === "EncryptCommand") {
        const ctx = JSON.stringify(input.EncryptionContext || {});
        return { CiphertextBlob: Buffer.from(`${ctx}|${Buffer.from(input.Plaintext).toString("utf8")}`) };
      }
      const [ctx, ...resto] = Buffer.from(input.CiphertextBlob).toString("utf8").split("|");
      if (ctx !== JSON.stringify(input.EncryptionContext || {})) {
        const e = new Error("contexto distinto"); e.name = "InvalidCiphertextException"; throw e;
      }
      return { Plaintext: Buffer.from(resto.join("|"), "utf8") };
    },
  };
}

test("un sobre se cierra con el nombre de la variable y sólo se abre con el mismo", async () => {
  const kms = kmsFalso();
  const sobre = await cerrarSobre("secreto-123", { kms, keyId: "arn:prueba", nombre: "OPENAI_API_KEY" });
  assert.ok(esSobre(sobre));
  assert.equal(await abrirSobre(sobre, { kms, nombre: "OPENAI_API_KEY" }), "secreto-123");
  await assert.rejects(abrirSobre(sobre, { kms, nombre: "TWILIO_AUTH_TOKEN" }), /InvalidCiphertext|contexto/);
});

test("lo que no es sobre se devuelve tal cual, sin llamar a KMS", async () => {
  const kms = kmsFalso();
  assert.equal(await abrirSobre("valor-en-claro", { kms, nombre: "X" }), "valor-en-claro");
  assert.equal(await abrirSobre("", { kms }), "");
  assert.equal(kms.llamadas.length, 0);
});

test("al arrancar se abren sólo las variables en sobre y se cachea el resultado", async () => {
  const kms = kmsFalso();
  const env = {
    NESPED_TOTP_ENCRYPTION_KEY: await cerrarSobre("clave-totp", { kms, keyId: "k", nombre: "NESPED_TOTP_ENCRYPTION_KEY" }),
    STRIPE_SECRET_KEY: "sk_test_en_claro",
    OTRA: "no-esta-en-la-lista",
  };
  const r = await abrirSobresDeEntorno({ env, kms });
  assert.deepEqual(r, { abiertos: 1, variables: ["NESPED_TOTP_ENCRYPTION_KEY"] });
  assert.equal(env.NESPED_TOTP_ENCRYPTION_KEY, "clave-totp");
  assert.equal(env.STRIPE_SECRET_KEY, "sk_test_en_claro");
  const antes = kms.llamadas.length;
  await abrirSobresDeEntorno({ env: { NESPED_TOTP_ENCRYPTION_KEY: env.NESPED_TOTP_ENCRYPTION_KEY }, kms });
  assert.equal(kms.llamadas.length, antes, "en claro ya: no vuelve a KMS");
  PARA_PRUEBAS.abiertos.clear();
});

test("un sobre que no se abre tumba el arranque, no deja un secreto a medias", async () => {
  const kms = { send: async () => { throw new Error("KMS caído"); } };
  await assert.rejects(abrirSobresDeEntorno({ env: { OPENAI_API_KEY: `${PARA_PRUEBAS.PREFIJO}AAAA` }, kms }), /KMS caído/);
});

test("la lista de sobres cubre los secretos de proveedor y deja fuera lo que lee Edge", () => {
  for (const nombre of ["SUPABASE_SERVICE_ROLE_KEY", "STRIPE_SECRET_KEY", "TWILIO_AUTH_TOKEN", "ELEVENLABS_API_KEY", "OPENAI_API_KEY", "RESEND_API_KEY", "SUPABASE_JWT_SECRET", "NESPED_TOTP_ENCRYPTION_KEY"]) {
    assert.ok(SECRETOS_EN_SOBRE.includes(nombre), nombre);
  }
  assert.ok(!SECRETOS_EN_SOBRE.includes("NESPED_SESSION_SECRET"), "el proxy en Edge lo necesita en claro");
  const inst = fs.readFileSync(path.join(RAIZ, "instrumentation.js"), "utf8");
  assert.match(inst, /if \(runtime !== "edge"\) \{[\s\S]{0,400}abrirSobresDeEntorno\(\)/);
});

test("KMS usa la cadena estándar de credenciales y no exige claves IAM estáticas", () => {
  PARA_PRUEBAS.reiniciarCliente();
  let configuracion;
  const falso = { send() {} };
  const cliente = clienteKms(
    { AWS_REGION: "eu-west-1", AWS_WEB_IDENTITY_TOKEN_FILE: "/token-temporal" },
    { crearCliente(config) { configuracion = config; return falso; } },
  );
  assert.equal(cliente, falso);
  assert.deepEqual(configuracion, { region: "eu-west-1" });
  assert.ok(!Object.hasOwn(configuracion, "credentials"));
  PARA_PRUEBAS.reiniciarCliente();
});

test("KMS sólo exige la región antes de resolver credenciales en el runtime", () => {
  PARA_PRUEBAS.reiniciarCliente();
  assert.throws(
    () => clienteKms({}, { crearCliente() { throw new Error("no debería construir"); } }),
    /Falta AWS_REGION/,
  );
  PARA_PRUEBAS.reiniciarCliente();
});
