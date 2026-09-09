import { test } from "node:test";
import assert from "node:assert/strict";
import { PARA_PRUEBAS } from "@/lib/server/grabaciones";

const { rutaDe, FIRMA_SEGUNDOS } = PARA_PRUEBAS;

/**
 * Dónde se guarda cada grabación.
 *
 * El identificador de la llamada lo pone el proveedor y entra por un webhook:
 * no es nuestro. Una ruta mal construida con eso dentro guarda el audio de una
 * empresa en la carpeta de otra, y la carpeta es lo único que separa a una
 * empresa de otra dentro del depósito.
 *
 * El resto —que el depósito es privado de verdad— se comprobó contra Supabase:
 * con firma 200, sin firma 400, con una firma inventada 400.
 */

test("cada empresa tiene su carpeta", () => {
  assert.equal(rutaDe("fibergreen", "abc123"), "fibergreen/abc123.mp3");
});

test("no se puede salir de la carpeta con barras", () => {
  assert.equal(rutaDe("demo", "../../otra/x"), "demo/otrax.mp3");
});

test("ni con puntos seguidos, que es lo que sobrevive a quitar las barras", () => {
  /* Quitar sólo las barras deja `..` intacto. Una llamada que se llamara así
     daría "demo/...mp3", y una empresa llamada ".." daría "../x.mp3". */
  assert.throws(() => rutaDe("demo", ".."), /ruta/i);
  assert.throws(() => rutaDe("..", "abc"), /ruta/i);

  /* Y los puntos seguidos en medio se aplastan a uno. */
  assert.ok(!rutaDe("demo", "a..b").includes(".."));
  assert.equal(rutaDe("demo", "..x"), "demo/x.mp3");
});

test("un identificador que se queda en nada rompe en vez de inventar una ruta", () => {
  /* Guardar en "/abc.mp3" o en "demo//.mp3" sería peor que fallar: el audio
     acabaría en un sitio que nadie encuentra y nadie borra. */
  assert.throws(() => rutaDe("", "abc"), /ruta/i);
  assert.throws(() => rutaDe("demo", "///"), /ruta/i);
  assert.throws(() => rutaDe("demo", null), /ruta/i);
});

test("los caracteres raros se caen, no se codifican", () => {
  assert.equal(rutaDe("demo", "a b<c>d?e"), "demo/abcde.mp3");
});

test("la firma dura minutos, no horas", () => {
  /* Es el tiempo que una dirección copiada por error sigue sirviendo para
     escuchar la conversación de un cliente. */
  assert.ok(FIRMA_SEGUNDOS > 0 && FIRMA_SEGUNDOS <= 1800);
});
