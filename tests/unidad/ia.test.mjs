import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tokensDe, costeEstimado, PARA_PRUEBAS } from "../../lib/server/ia.js";

/**
 * Cada llamada a la IA, apuntada.
 *
 * Nesped paga por tokens y no sabía cuántos gastaba ni quién. Lo que se
 * sujeta aquí: que los tokens se leen bien de las dos formas de respuesta de
 * OpenAI, que el coste es una estimación etiquetada como tal y no un número
 * inventado para un modelo desconocido, y que ninguna llamada a OpenAI se
 * hace fuera del envoltorio.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");

test("los tokens se leen igual de responses.create y de chat.completions", () => {
  assert.deepEqual(tokensDe({ usage: { input_tokens: 120, output_tokens: 30 } }), { entrada: 120, salida: 30 });
  assert.deepEqual(tokensDe({ usage: { prompt_tokens: 80, completion_tokens: 15 } }), { entrada: 80, salida: 15 });
  assert.deepEqual(tokensDe({}), { entrada: 0, salida: 0 });
  assert.deepEqual(tokensDe(null), { entrada: 0, salida: 0 });
});

test("el coste es una estimación con tarifa versionada, y null si el modelo no está en la tarifa", () => {
  const { TARIFA, TARIFA_VERSION } = PARA_PRUEBAS;
  assert.match(TARIFA_VERSION, /^\d{4}-\d{2}$/);
  const c = costeEstimado("gpt-4o-mini", { entrada: 1_000_000, salida: 1_000_000 });
  assert.equal(c, TARIFA["gpt-4o-mini"].entrada + TARIFA["gpt-4o-mini"].salida);
  assert.equal(costeEstimado("un-modelo-que-no-existe", { entrada: 10, salida: 10 }), null);
});

test("ninguna llamada a OpenAI se hace fuera de conRegistroIA", () => {
  const culpables = [];
  const recorrer = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) { recorrer(f); continue; }
      if (!/\.(js|mjs)$/.test(e.name)) continue;
      const s = fs.readFileSync(f, "utf8");
      for (const m of s.matchAll(/\.(responses\.create|chat\.completions\.create)\(/g)) {
        /* La llamada tiene que estar dentro de un conRegistroIA(...) abierto
           en las 400 letras anteriores. */
        const antes = s.slice(Math.max(0, m.index - 400), m.index);
        if (!/conRegistroIA\(/.test(antes)) culpables.push(path.relative(RAIZ, f) + ":" + s.slice(0, m.index).split("\n").length);
      }
    }
  };
  recorrer(path.join(RAIZ, "app")); recorrer(path.join(RAIZ, "lib"));
  assert.deepEqual(culpables, [], "Llamadas a OpenAI sin registrar:\n  " + culpables.join("\n  "));
});
