import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import assert from "node:assert/strict";

import { preguntarSecreto } from "../../scripts/entrada-secreta.mjs";

function terminalFalsa() {
  const input = new EventEmitter();
  input.isTTY = true;
  input.isRaw = false;
  input.pausada = true;
  input.setRawMode = (valor) => { input.isRaw = valor; input.modos.push(valor); };
  input.isPaused = () => input.pausada;
  input.resume = () => { input.pausada = false; };
  input.pause = () => { input.pausada = true; };
  input.modos = [];
  const escrito = [];
  const output = { write(valor) { escrito.push(String(valor)); } };
  return { input, output, escrito };
}

test("la entrada secreta no refleja lo escrito y restaura el terminal", async () => {
  const { input, output, escrito } = terminalFalsa();
  const pendiente = preguntarSecreto("Secreto: ", { input, output });
  input.emit("keypress", "clave-mala", { name: "a" });
  input.emit("keypress", "", { name: "backspace" });
  input.emit("keypress", "a", { name: "a" });
  input.emit("keypress", "\r", { name: "return" });

  assert.equal(await pendiente, "clave-mala");
  assert.equal(escrito.join(""), "Secreto: \n");
  assert.deepEqual(input.modos, [true, false]);
  assert.equal(input.pausada, true);
  assert.equal(input.listenerCount("keypress"), 0);
});

test("cancelar la entrada secreta también restaura el terminal", async () => {
  const { input, output } = terminalFalsa();
  const pendiente = preguntarSecreto("Secreto: ", { input, output });
  input.emit("keypress", "\u0003", { ctrl: true, name: "c" });

  await assert.rejects(pendiente, (error) => error.code === "NESPED_INPUT_CANCELLED");
  assert.deepEqual(input.modos, [true, false]);
  assert.equal(input.pausada, true);
});

/* Por tubería con la salida en un terminal: así se lanza desde el chat o con
   `pbpaste | npm run cerrar:sobre X`. readline repetía el secreto en pantalla
   y, sin salto de línea final, no devolvía nunca. */
function tuberia(texto) {
  const input = new PassThrough();
  input.isTTY = false;
  const escrito = [];
  const output = { isTTY: true, columns: 80, write(valor) { escrito.push(String(valor)); return true; } };
  queueMicrotask(() => input.end(texto));
  return { input, output, escrito };
}

test("por tubería lee la primera línea sin repetirla en pantalla", async () => {
  const { input, output, escrito } = tuberia("secreto-uno\nsobra\n");
  assert.equal(await preguntarSecreto("Secreto: ", { input, output }), "secreto-uno");
  assert.equal(escrito.join(""), "Secreto: \n");
});

test("por tubería no se cuelga si falta el salto de línea final", async () => {
  const { input, output, escrito } = tuberia("secreto-dos");
  assert.equal(await preguntarSecreto("Secreto: ", { input, output }), "secreto-dos");
  assert.doesNotMatch(escrito.join(""), /secreto-dos/);
});

test("por tubería acepta finales de línea de Windows", async () => {
  const { input, output } = tuberia("secreto-tres\r\n");
  assert.equal(await preguntarSecreto("Secreto: ", { input, output }), "secreto-tres");
});
