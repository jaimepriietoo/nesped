import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ORDEN_PLANES, PLANES, funcionesDe, planDe, planQueIncluye, planSiguiente,
  tieneFuncion, VALOR_BLOQUEADO, FUNCIONES,
} from "../../lib/planes.js";

/**
 * Lo que protege esto: si Growth pudiera usar Intelligence, el plan de 999 €
 * deja de existir y nadie se entera hasta que mira la facturación. Y al revés,
 * si Enterprise se encontrara un candado, un cliente de 1.999 € descubre que
 * le falta lo que ha pagado.
 */

test("cada plan hereda entero el anterior: al subir no se pierde nada", () => {
  const growth = funcionesDe("growth");
  const intelligence = funcionesDe("intelligence");
  const enterprise = funcionesDe("enterprise");

  for (const f of growth) assert.ok(intelligence.includes(f), `Intelligence pierde ${f}`);
  for (const f of intelligence) assert.ok(enterprise.includes(f), `Enterprise pierde ${f}`);
});

test("Growth organiza, pero no entiende ni actúa", () => {
  assert.ok(tieneFuncion("growth", "crm"));
  assert.ok(tieneFuncion("growth", "llamadas"));
  assert.ok(!tieneFuncion("growth", "inteligencia"));
  assert.ok(!tieneFuncion("growth", "agentes"));
  assert.ok(!tieneFuncion("growth", "copiloto"));
});

test("Intelligence entiende, pero no actúa", () => {
  assert.ok(tieneFuncion("intelligence", "inteligencia"));
  assert.ok(tieneFuncion("intelligence", "fugaIngresos"));
  assert.ok(!tieneFuncion("intelligence", "agentes"));
  assert.ok(!tieneFuncion("intelligence", "copiloto"));
});

test("Enterprise lo tiene todo", () => {
  const todas = Object.keys(FUNCIONES);
  for (const f of todas) {
    assert.ok(tieneFuncion("enterprise", f), `Enterprise debería incluir ${f}`);
  }
});

/**
 * Las cuentas existentes tienen "starter" o "pro" escrito en su fila. Migrar
 * esos valores a mano y confiar en que no queda ninguno es lo que falla seis
 * meses después con un cliente delante.
 */
test("los nombres antiguos siguen resolviendo", () => {
  assert.equal(planDe({ plan: "starter" }), "growth");
  assert.equal(planDe({ plan: "basic" }), "growth");
  assert.equal(planDe({ plan: "pro" }), "intelligence");
  assert.equal(planDe({ plan: "premium" }), "intelligence");
});

test("un plan desconocido o vacío cae en el más bajo, nunca en el más alto", () => {
  for (const valor of [null, undefined, "", "inventado", "ENTERPRISE_FALSO"]) {
    assert.equal(planDe({ plan: valor }), "growth", `${valor} debería caer en growth`);
  }
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
