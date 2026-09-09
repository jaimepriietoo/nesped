import { test } from "node:test";
import assert from "node:assert/strict";
import consumoVoz from "@/lib/server/consumo-voz.cjs";

const { caracteresDelAgente, ETIQUETA_AGENTE } = consumoVoz;

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
 *
 * Durante un tiempo esta prueba llevaba dentro su propia copia de la función,
 * porque Node no entendía el alias `@/`. Una prueba sobre una copia no protege
 * al original: puede seguir en verde mientras el código real hace otra cosa,
 * que es exactamente el fallo que vino a cubrir. Ahora importa el módulo que
 * carga el servidor de voz.
 */
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

test("la etiqueta que se cuenta es la misma que se escribe", () => {
  /* El fallo original fue justo este desajuste: el contador buscaba una
     etiqueta y el servidor escribía otra. Las dos salen ya de la misma
     constante, y esta prueba comprueba que el redondeo cuadra. */
  const dicho = "Buenas tardes.";
  assert.equal(caracteresDelAgente([`${ETIQUETA_AGENTE}${dicho}`]), dicho.length);
});
