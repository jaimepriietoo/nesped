import { EventEmitter } from "node:events";
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
