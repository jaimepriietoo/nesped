import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * El contador de caracteres de voz sintética.
 *
 * Existe esta prueba porque la primera versión filtraba por `"Agente:"` y el
 * prefijo real que pone el servidor de voz es `"[AI] "`. Habría anotado cero
 * caracteres en todas las llamadas, para siempre, sin dar ningún error: el
 * panel de costes habría dicho que la voz no cuesta nada mientras llegaba la
 * factura de ElevenLabs.
 *
 * Es la misma clase de fallo que un módulo sin compuerta de datos: no rompe
 * nada visible, solo miente.
 */
function caracteresDelAgente(partes) {
  return partes.reduce((total, linea) => {
    const texto = String(linea || "");
    return texto.startsWith("[AI] ") ? total + texto.length - 5 : total;
  }, 0);
}

test("cuenta solo lo que dice el agente", () => {
  const transcripcion = [
    "[SYSTEM] Inicio de llamada",
    "[AI] Instalaciones Vega, hola.",
    "[USER] Quería pedir un presupuesto de aerotermia",
    "[AI] Perfecto, ¿cómo te llamas?",
  ];

  assert.equal(
    caracteresDelAgente(transcripcion),
    "Instalaciones Vega, hola.".length + "Perfecto, ¿cómo te llamas?".length
  );
});

test("no cuenta al usuario ni al sistema", () => {
  assert.equal(caracteresDelAgente(["[USER] hola", "[SYSTEM] fin"]), 0);
});

test("el prefijo no se factura: no se sintetiza", () => {
  assert.equal(caracteresDelAgente(["[AI] abc"]), 3);
});

test("una llamada muda cuenta cero, no falla", () => {
  assert.equal(caracteresDelAgente([]), 0);
  assert.equal(caracteresDelAgente([null, undefined, ""]), 0);
});
