import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createReminderDirect,
  updateLeadDirect,
} from "../../lib/server/automation-service.js";

function clienteCapturador() {
  const operaciones = [];
  const respuesta = { data: null, error: null };
  const consulta = {
    update(cambios) {
      operaciones.push(["update", cambios]);
      return this;
    },
    insert(fila) {
      operaciones.push(["insert", fila]);
      return Promise.resolve(respuesta);
    },
    eq(columna, valor) {
      operaciones.push(["eq", columna, valor]);
      return this;
    },
    then(resolver, rechazar) {
      return Promise.resolve(respuesta).then(resolver, rechazar);
    },
  };

  return {
    operaciones,
    from(tabla) {
      operaciones.push(["from", tabla]);
      return consulta;
    },
  };
}

test("las escrituras directas del automatismo exigen y aplican la empresa", async () => {
  await assert.rejects(
    () => updateLeadDirect("lead-1", { status: "won" }),
    /falta la empresa/,
  );
  await assert.rejects(
    () => createReminderDirect("lead-1", "Revisar", new Date(0).toISOString()),
    /falta la empresa/,
  );

  const cliente = clienteCapturador();
  await updateLeadDirect("lead-1", { status: "won" }, "empresa-a", cliente);
  await createReminderDirect(
    "lead-1",
    "Revisar",
    new Date(0).toISOString(),
    "agente-1",
    "empresa-a",
    cliente,
  );

  assert.ok(
    cliente.operaciones.some(
      ([operacion, columna, valor]) => operacion === "eq" && columna === "id" && valor === "lead-1",
    ),
  );
  assert.ok(
    cliente.operaciones.some(
      ([operacion, columna, valor]) =>
        operacion === "eq" && columna === "client_id" && valor === "empresa-a",
    ),
    "la actualización del contacto debe acotarse por empresa",
  );
  assert.ok(
    cliente.operaciones.some(
      ([operacion, fila]) =>
        operacion === "insert" && fila.client_id === "empresa-a" && fila.lead_id === "lead-1",
    ),
    "el recordatorio debe guardar explícitamente la empresa",
  );
});
