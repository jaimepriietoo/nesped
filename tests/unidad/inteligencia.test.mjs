import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluarInteligencia } from "../../lib/server/inteligencia.js";

/**
 * Lo que protege esto: la promesa entera de la pantalla de Inteligencia es que
 * no enseña ni una cifra que no pueda sostener.
 *
 * Es lo más fácil de romper sin darse cuenta. Cualquiera que añada un módulo
 * nuevo y se olvide de la compuerta de datos hará que el panel enseñe un cero
 * o un porcentaje inventado a alguien que acaba de entrar, y eso no da un
 * error en ninguna parte: simplemente miente. Y una cifra de un panel de
 * dirección acaba dentro de una decisión.
 */

/**
 * Un Supabase de mentira que devuelve lo que se le diga por tabla.
 *
 * Se imita la cadena de llamadas en vez de usar la base de datos real: así la
 * prueba corre sin red, sin credenciales y sin ensuciar datos de nadie.
 */
function supabaseFalso(porTabla = {}) {
  const cadena = (filas) => {
    const eslabon = {
      select: () => eslabon,
      eq: () => eslabon,
      order: () => eslabon,
      limit: () => Promise.resolve({ data: filas, error: null }),
      maybeSingle: () => Promise.resolve({ data: filas?.[0] ?? null, error: null }),
      then: (resolver) => Promise.resolve({ data: filas, error: null }).then(resolver),
    };
    return eslabon;
  };

  return { from: (tabla) => cadena(porTabla[tabla] ?? []) };
}

const cuentaVacia = () =>
  evaluarInteligencia({ supabase: supabaseFalso(), clientId: "prueba" });

test("una cuenta sin datos no enseña ni una cifra", async () => {
  const r = await cuentaVacia();

  const conCifra = r.modulos.filter((m) => m.disponible);
  assert.deepEqual(conCifra, [], "ningún módulo puede dar un número sin datos");
  assert.equal(r.cobertura.modulosActivos, 0);
  assert.deepEqual(r.titulares, [], "y no puede haber titulares que resumir");
});

test("cada módulo apagado dice qué le falta y por qué ese mínimo", async () => {
  const r = await cuentaVacia();

  for (const m of r.modulos) {
    assert.ok(m.titulo, "todo módulo tiene nombre");
    assert.ok(m.falta, `${m.titulo} tiene que decir qué le falta`);
    assert.ok(m.porQue, `${m.titulo} tiene que explicar por qué ese mínimo`);
  }
});

/**
 * El caso que se coló una vez: una cartera vacía leía "nadie lleva más de 24 h
 * esperando, al día". Suena a que todo va bien cuando lo que pasa es que no ha
 * entrado nada. Decirle a alguien que va bien cuando no tiene datos es la forma
 * más rápida de que deje de creerse el resto del panel.
 */
test("una cartera vacía no se declara al día", async () => {
  const r = await cuentaVacia();
  const seguimiento = r.modulos.find((m) => m.titulo === "Esperando respuesta");

  assert.equal(seguimiento.disponible, false);
  assert.match(seguimiento.falta, /ning[úu]n contacto/i);
});

test("con un contacto esperando, sí cuenta, y dice cómo lo ha calculado", async () => {
  const haceTresDias = new Date(Date.now() - 3 * 864e5).toISOString();
  const supabase = supabaseFalso({
    leads: [
      { id: "1", nombre: "Ana", telefono: "+34600111222", status: "new", created_at: haceTresDias },
    ],
  });

  const r = await evaluarInteligencia({ supabase, clientId: "prueba" });
  const seguimiento = r.modulos.find((m) => m.titulo === "Esperando respuesta");

  assert.equal(seguimiento.disponible, true);
  assert.equal(seguimiento.valor, 1);
  assert.ok(seguimiento.metodo, "una cifra sin método no se puede discutir");
});

test("con pocas llamadas no se calcula ningún porcentaje", async () => {
  const supabase = supabaseFalso({
    calls: Array.from({ length: 4 }, () => ({
      created_at: new Date().toISOString(),
      duration_seconds: 60,
      lead_captured: false,
    })),
  });

  const r = await evaluarInteligencia({ supabase, clientId: "prueba" });
  const captura = r.modulos.find((m) => m.titulo === "Llamadas sin captar");

  assert.equal(captura.disponible, false, "cuatro llamadas no dan un porcentaje");
  assert.match(captura.falta, /10 llamadas/);
});

test("las fuentes se declaran por filas reales, no por variables de entorno", async () => {
  const r = await cuentaVacia();

  for (const f of r.fuentes) {
    assert.equal(f.estado, "sin-conectar", `${f.nombre} no puede darse por conectada sin datos`);
    assert.ok(f.comoActivar, `${f.nombre} tiene que decir cómo se activa`);
  }
});

test("los titulares sólo salen de módulos con datos", async () => {
  const haceTresDias = new Date(Date.now() - 3 * 864e5).toISOString();
  const supabase = supabaseFalso({
    leads: Array.from({ length: 8 }, (_, i) => ({
      id: String(i), nombre: `Contacto ${i}`, status: "new", created_at: haceTresDias,
    })),
  });

  const r = await evaluarInteligencia({ supabase, clientId: "prueba" });

  assert.ok(r.titulares.length > 0);
  for (const t of r.titulares) {
    assert.ok(t.metodo, "un titular sin método es una afirmación sin respaldo");
  }
});
