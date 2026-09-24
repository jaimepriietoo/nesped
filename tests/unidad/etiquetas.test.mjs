import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ESTADO_LLAMADA, NIVEL_SALUD, RESULTADO_LLAMADA, TODAS, etiqueta,
} from "../../lib/etiquetas.js";

test("los valores internos en inglés se enseñan en español", () => {
  assert.equal(etiqueta(ESTADO_LLAMADA, "completed"), "Completada");
  assert.equal(etiqueta(ESTADO_LLAMADA, "no-answer"), "Sin respuesta");
  assert.equal(etiqueta(RESULTADO_LLAMADA, "lead_captured"), "Contacto recogido");
  assert.equal(etiqueta(NIVEL_SALUD, "healthy"), "Correcto");
  assert.equal(etiqueta(TODAS, "Warning"), "Aviso");
});

test("sin valor sale un guion, y lo desconocido no se inventa", () => {
  assert.equal(etiqueta(ESTADO_LLAMADA, null), "—");
  assert.equal(etiqueta(ESTADO_LLAMADA, "", ""), "");
  assert.equal(etiqueta(ESTADO_LLAMADA, "algo-raro"), "algo-raro");
});

test("el correo de cada llamada ya no enseña el estado en inglés", async () => {
  const { correoDeLlamada } = await import("../../lib/server/destinatarios.js");
  const { html } = correoDeLlamada({
    empresa: "Demo", llamada: { status: "completed", duration_seconds: 30, from_number: "+34600000000" },
    dicho: {}, destinatario: { email: "a@b.c", nombre: "Ana" }, urlPortal: "",
  });
  assert.match(html, /Completada/);
  assert.doesNotMatch(html, />completed</);
});
