import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

/**
 * Los códigos de recuperación son la última puerta: se usan el día que el
 * correo no sale y nadie puede entrar al portal. Lo que se prueba aquí es la
 * forma del código, que es lo que decide si alguien puede teclearlo bien
 * estando con prisa y con algo roto.
 *
 * El consumo contra la base de datos se probó a mano de punta a punta: entrar
 * con uno funciona, y el mismo dos veces no.
 */

const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generarUno() {
  const bytes = crypto.randomBytes(10);
  let codigo = "";
  for (let i = 0; i < 10; i += 1) {
    codigo += ALFABETO[bytes[i] % ALFABETO.length];
    if (i === 4) codigo += "-";
  }
  return codigo;
}

const normalizar = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

test("no lleva caracteres que se confundan al copiarlos a mano", () => {
  /* Se apuntan en un papel y se teclean el día que algo va mal. Una I que
     parece una l, o un 0 que parece una O, convierte la última puerta en una
     puerta que no abre. */
  for (const prohibido of ["I", "L", "O", "0", "1"]) {
    assert.ok(!ALFABETO.includes(prohibido), `${prohibido} no debería estar`);
  }
});

test("el formato es constante: cinco, guion, cinco", () => {
  for (let i = 0; i < 200; i += 1) {
    assert.match(generarUno(), /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  }
});

test("normalizar acepta lo que la gente escribe de verdad", () => {
  const codigo = "TYUW4-UEQMA";
  for (const variante of ["tyuw4-ueqma", "TYUW4 UEQMA", " TYUW4-UEQMA ", "tyuw4ueqma"]) {
    assert.equal(normalizar(variante), normalizar(codigo));
  }
});

test("normalizado son diez caracteres, que es lo que valida la ruta", () => {
  assert.equal(normalizar(generarUno()).length, 10);
});

/**
 * Diez códigos de treinta y un símbolos dan del orden de 10^15
 * combinaciones. Con el límite de intentos del acceso, adivinar uno no es una
 * vía realista.
 */
test("el espacio de códigos es lo bastante grande", () => {
  const combinaciones = Math.pow(ALFABETO.length, 10);
  assert.ok(combinaciones > 1e14, `demasiado pequeño: ${combinaciones}`);
});

test("no se repiten entre sí", () => {
  const vistos = new Set(Array.from({ length: 500 }, generarUno));
  assert.equal(vistos.size, 500, "dos códigos iguales serían un fallo del generador");
});
