import { test } from "node:test";
import assert from "node:assert/strict";

import { hashPassword } from "../../lib/server/auth-crypto.js";
import { verificarPasoAdicionalPasskey } from "../../lib/server/passkey-step-up.js";

function contextoConPassword(password) {
  const operaciones = [];
  const consulta = {
    select(columnas) {
      operaciones.push(["select", columnas]);
      return this;
    },
    eq(columna, valor) {
      operaciones.push(["eq", columna, valor]);
      return this;
    },
    async maybeSingle() {
      return { data: { password: hashPassword(password), password_hash: null }, error: null };
    },
  };
  return {
    operaciones,
    ctx: {
      userEmail: "owner@empresa.test",
      clientId: "empresa-a",
      supabase: {
        from(tabla) {
          operaciones.push(["from", tabla]);
          return consulta;
        },
      },
    },
  };
}

test("sin TOTP, crear o quitar una passkey exige la contraseña actual de la empresa", async () => {
  const { ctx, operaciones } = contextoConPassword("contraseña-correcta");
  const dependencias = { estadoTotp: async () => ({ enabled: false }) };

  const correcta = await verificarPasoAdicionalPasskey(
    ctx,
    { password: "contraseña-correcta" },
    dependencias,
  );
  const incorrecta = await verificarPasoAdicionalPasskey(
    ctx,
    { password: "otra" },
    dependencias,
  );

  assert.deepEqual(correcta, { valido: true, tipo: "password" });
  assert.deepEqual(incorrecta, { valido: false, tipo: "password" });
  assert.ok(operaciones.some(
    ([op, columna, valor]) => op === "eq" && columna === "client_id" && valor === "empresa-a",
  ));
  assert.ok(operaciones.some(
    ([op, columna, valor]) => op === "eq" && columna === "email" && valor === "owner@empresa.test",
  ));
});

test("con TOTP, acepta sólo un TOTP o código de recuperación consumible", async () => {
  const llamadas = [];
  const ctx = {
    userEmail: "owner@empresa.test",
    clientId: "empresa-a",
    supabase: { from: () => assert.fail("con TOTP no debe leer el hash de contraseña") },
  };
  const dependencias = {
    estadoTotp: async () => ({ enabled: true }),
    verificarYConsumirTotp: async (entrada) => {
      llamadas.push(["totp", entrada]);
      return entrada.codigo === "123456";
    },
    consumirCodigo: async (entrada) => {
      llamadas.push(["recuperacion", entrada]);
      return entrada.codigo === "ABCDE-FGHIJ";
    },
  };

  assert.deepEqual(
    await verificarPasoAdicionalPasskey(ctx, { code: "123456" }, dependencias),
    { valido: true, tipo: "codigo" },
  );
  assert.deepEqual(
    await verificarPasoAdicionalPasskey(ctx, { code: "ABCDE-FGHIJ" }, dependencias),
    { valido: true, tipo: "codigo" },
  );
  assert.deepEqual(
    await verificarPasoAdicionalPasskey(ctx, {}, dependencias),
    { valido: false, tipo: "codigo" },
  );
  assert.equal(llamadas.filter(([tipo]) => tipo === "totp").length, 1);
  assert.equal(llamadas.filter(([tipo]) => tipo === "recuperacion").length, 1);
});
