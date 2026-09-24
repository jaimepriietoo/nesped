import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDEN_PLANES, PLANES, funcionesDe, planDe, planQueIncluye, planSiguiente,
  tieneFuncion, VALOR_BLOQUEADO, FUNCIONES, planGuardado,
} from "../../lib/planes.js";

/**
 * La definición de los planes se conserva (herencia, textos, orden) por si
 * vuelven, pero el acceso ya no depende de ellos.
 */

test("cada plan hereda entero el anterior: al subir no se pierde nada", () => {
  const growth = funcionesDe("growth");
  const intelligence = funcionesDe("intelligence");
  const enterprise = funcionesDe("enterprise");

  for (const f of growth) assert.ok(intelligence.includes(f), `Intelligence pierde ${f}`);
  for (const f of intelligence) assert.ok(enterprise.includes(f), `Enterprise pierde ${f}`);
});

/**
 * Desde el 24-09-2026 no hay planes a la venta: cualquier cliente, tenga lo
 * que tenga guardado en su fila, tiene todas las funciones.
 */
test("cualquier cliente tiene todas las funciones", () => {
  const todas = Object.keys(FUNCIONES);
  for (const valor of [null, undefined, "", "growth", "starter", "pro", "intelligence", "enterprise", "inventado"]) {
    const plan = planDe({ plan: valor });
    for (const f of todas) {
      assert.ok(tieneFuncion(plan, f), `${valor} debería incluir ${f}`);
      assert.ok(tieneFuncion(valor, f), `${valor} (directo) debería incluir ${f}`);
    }
  }
});

test("lo guardado en la base se sigue pudiendo leer, sólo como dato", () => {
  assert.equal(planGuardado({ plan: "starter" }), "growth");
  assert.equal(planGuardado({ plan: "pro" }), "intelligence");
  assert.equal(planGuardado({ plan: "enterprise" }), "enterprise");
  assert.equal(planGuardado({ plan: "" }), "growth");
});

test("planQueIncluye señala el plan más barato que da cada función", () => {
  assert.equal(planQueIncluye("crm"), "growth");
  assert.equal(planQueIncluye("inteligencia"), "intelligence");
  assert.equal(planQueIncluye("agentes"), "enterprise");
});

test("planSiguiente lleva hacia arriba y se para en el último", () => {
  assert.equal(planSiguiente("growth"), "intelligence");
  assert.equal(planSiguiente("intelligence"), "enterprise");
  assert.equal(planSiguiente("enterprise"), null);
});

/**
 * Un candado sin explicación sólo produce fastidio: quien lo ve no sabe qué
 * se está perdiendo, por eso no lo tiene contratado.
 */
test("toda función de pago tiene escrito qué se gana con ella", () => {
  const deGrowth = new Set(PLANES.growth.funciones);
  const sinTexto = Object.keys(FUNCIONES)
    .filter((f) => !deGrowth.has(f))
    .filter((f) => !VALOR_BLOQUEADO[f]);

  assert.deepEqual(sinTexto, [], `sin texto de valor: ${sinTexto.join(", ")}`);
});

test("los precios suben con el plan", () => {
  const precios = ORDEN_PLANES.map((p) => PLANES[p].precio);
  for (let i = 1; i < precios.length; i += 1) {
    assert.ok(precios[i] > precios[i - 1], "cada plan cuesta más que el anterior");
  }
});

test("solo Enterprise se vende hablando", () => {
  assert.ok(!PLANES.growth.hablarConVentas);
  assert.ok(!PLANES.intelligence.hablarConVentas);
  assert.ok(PLANES.enterprise.hablarConVentas);
});
