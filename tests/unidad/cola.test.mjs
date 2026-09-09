import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_PRUEBAS } from "@/lib/server/cola";

const { INTENTOS_MAXIMOS, ESPERA_TRAS_FALLO } = PARA_PRUEBAS;

/**
 * La cola es lo que separa "pedir" de "hacer". Lo que se prueba aquí es su
 * política de reintentos, que es donde se decide si un proveedor caído se
 * convierte en un problema pasajero o en una tormenta de peticiones.
 *
 * El reparto sin carreras no se prueba aquí: lo garantiza el `for update skip
 * locked` de tomar_trabajos(), y eso es Postgres, no JavaScript.
 */

test("la espera entre reintentos crece", () => {
  /* Reintentar cada minuto contra un proveedor caído lo tumba más y gasta el
     presupuesto. Cada fallo tiene que esperar más que el anterior. */
  for (let i = 1; i < ESPERA_TRAS_FALLO.length; i += 1) {
    assert.ok(
      ESPERA_TRAS_FALLO[i] > ESPERA_TRAS_FALLO[i - 1],
      `el intento ${i + 1} espera ${ESPERA_TRAS_FALLO[i]}, menos que el anterior`
    );
  }
});

test("hay una espera definida para cada intento", () => {
  /* Si hubiera menos esperas que intentos, el último miraría fuera del array
     y la fecha saldría inválida. */
  assert.ok(ESPERA_TRAS_FALLO.length >= INTENTOS_MAXIMOS - 1);
});

test("se acaba rindiendo", () => {
  /* Un trabajo que falla siempre —una dirección que no existe— reintentado
     para siempre ocupa la cola y esconde a los que sí saldrían. */
  assert.ok(INTENTOS_MAXIMOS > 1 && INTENTOS_MAXIMOS <= 10);
});

test("el último reintento llega horas después, no minutos", () => {
  /* Un fallo que dura toda la noche tiene que seguir teniendo un intento por
     la mañana, no haberlos gastado todos en cinco minutos. */
  assert.ok(ESPERA_TRAS_FALLO[ESPERA_TRAS_FALLO.length - 1] >= 60);
});
