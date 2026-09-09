import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarConsumo, estadoDeCuota } from "@/lib/server/cuotas";
import { LIMITES } from "@/lib/planes";

/**
 * Las cuotas deciden a quién se le escribe para decirle que está gastando más
 * de lo previsto. Equivocarse hacia arriba es incomodar a un cliente que paga
 * y no ha hecho nada raro; hacia abajo es enterarse por la factura.
 *
 * Se importa el módulo de verdad, no una copia. Ver tests/alias-hooks.mjs.
 */

const growth = LIMITES.growth;

test("dentro del plan no avisa de nada", () => {
  const r = evaluarConsumo({ consumo: { llamadas: 100, minutos: 200 }, plan: "growth" });
  assert.equal(r.medido, true);
  assert.equal(r.dentro, true);
  assert.equal(r.cerca, false);
});

test("avisa al 80%, que es cuando todavía se puede hacer algo", () => {
  const r = evaluarConsumo({
    consumo: { llamadas: growth.llamadasMes * 0.85, minutos: 0 },
    plan: "growth",
  });
  assert.equal(r.cerca, true);
  assert.equal(r.dentro, true);
});

test("pasado el límite deja de estar dentro, pero no corta nada", () => {
  const r = evaluarConsumo({
    consumo: { llamadas: growth.llamadasMes * 2, minutos: 0 },
    plan: "growth",
  });
  assert.equal(r.dentro, false);
  /* `cerca` es "va justo", no "se pasó". Quien ya se pasó no está cerca. */
  assert.equal(r.cerca, false);
});

test("manda el más adelantado de los dos, no solo las llamadas", () => {
  /* Una empresa con llamadas largas revienta los minutos sin acercarse al
     número de llamadas. Mirar solo una de las dos dejaría fuera ese caso. */
  const r = evaluarConsumo({
    consumo: { llamadas: 1, minutos: growth.minutosMes * 1.5 },
    plan: "growth",
  });
  assert.equal(r.dentro, false);
});

test("sin dato se da por dentro: no se acusa a nadie por una consulta fallida", () => {
  const r = evaluarConsumo({ consumo: null, plan: "growth" });
  assert.equal(r.medido, false);
  assert.equal(r.dentro, true);
  assert.equal(r.cerca, false);
});

test("un plan que no existe cae en el de entrada en vez de quedarse sin límite", () => {
  /* Hay filas antiguas con "starter" y "pro" escritos. Si un nombre
     desconocido devolviera límites vacíos, la división daría infinito o cero
     y el aviso no saltaría nunca. */
  const r = evaluarConsumo({ consumo: { llamadas: 10, minutos: 10 }, plan: "loquesea" });
  assert.deepEqual(r.limites, LIMITES.growth);
});

test("los nombres antiguos siguen dando el límite correcto", () => {
  assert.deepEqual(
    evaluarConsumo({ consumo: { llamadas: 0, minutos: 0 }, plan: "pro" }).limites,
    LIMITES.intelligence
  );
});

test("si la base de datos da error, se ignora el dato en vez de tomarlo por bueno", async () => {
  const supabase = {
    rpc: async () => ({ data: { llamadas: 999999, minutos: 0 }, error: new Error("caída") }),
  };
  const r = await estadoDeCuota({ supabase, clientId: "una-empresa", plan: "growth" });
  assert.equal(r.medido, false);
  assert.equal(r.dentro, true);
});

test("estadoDeCuota pregunta por la empresa que se le pasa", async () => {
  let recibido = null;
  const supabase = {
    rpc: async (nombre, args) => {
      recibido = { nombre, args };
      return { data: { llamadas: 0, minutos: 0 }, error: null };
    },
  };
  await estadoDeCuota({ supabase, clientId: "empresa-a", plan: "growth" });
  assert.deepEqual(recibido, {
    nombre: "consumo_del_mes",
    args: { p_client_id: "empresa-a" },
  });
});
