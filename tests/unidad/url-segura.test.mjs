import { test } from "node:test";
import assert from "node:assert/strict";
import { comprobarUrlExterna } from "../../lib/server/url-segura.js";

/**
 * Lo que protege esto: la prueba de webhooks del portal hacía `fetch` a la
 * dirección que le mandaras y devolvía 1.200 caracteres de la respuesta. La
 * petición sale desde nuestro servidor, así que llega a sitios donde el
 * atacante no llega: los endpoints internos del propio sitio, el servicio de
 * metadatos del proveedor, lo que hubiera en la red privada.
 */

const INTERNAS = [
  ["https://127.0.0.1/x", "bucle local"],
  ["https://localhost/x", "el nombre localhost"],
  ["https://169.254.169.254/latest/meta-data/", "metadatos del proveedor"],
  ["https://10.0.0.5/x", "red privada 10/8"],
  ["https://192.168.1.1/x", "red privada 192.168/16"],
  ["https://172.16.0.1/x", "red privada 172.16/12"],
  ["https://100.64.0.1/x", "NAT del operador"],
  ["https://[::1]/x", "bucle local en IPv6"],
  ["https://[::ffff:127.0.0.1]/x", "IPv4 envuelta en IPv6"],
  ["https://algo.internal/x", "dominio interno"],
];

for (const [url, motivo] of INTERNAS) {
  test(`rechaza ${motivo}`, async () => {
    const r = await comprobarUrlExterna(url);
    assert.equal(r.ok, false, `${url} no debería pasar`);
    assert.ok(r.motivo, "y tiene que decir por qué");
  });
}

test("rechaza http: un webhook en claro también habla con servicios internos", async () => {
  const r = await comprobarUrlExterna("http://ejemplo.com/webhook");
  assert.equal(r.ok, false);
  assert.match(r.motivo, /https/i);
});

test("rechaza lo que no es una dirección", async () => {
  for (const basura of ["", null, "no soy una url", "javascript:alert(1)"]) {
    const r = await comprobarUrlExterna(basura);
    assert.equal(r.ok, false, `${basura} no debería pasar`);
  }
});

test("un webhook normal sí pasa", async () => {
  const r = await comprobarUrlExterna("https://www.nesped.com/api/precios");
  assert.equal(r.ok, true, r.motivo);
});

/**
 * El caso que hace que esto no sea un filtro de texto: un dominio público que
 * resuelve a una dirección interna. Comprobar sólo el nombre del host no
 * sirve de nada, porque cualquiera puede registrar un dominio que apunte a
 * 127.0.0.1. Hay que mirar las direcciones que devuelve el DNS.
 */
test("un dominio que resuelve a una dirección interna también se corta", async () => {
  /* localtest.me y sus subdominios resuelven a 127.0.0.1 por diseño. Si el
     DNS no lo resuelve en esta máquina, la comprobación falla igualmente,
     que es el lado seguro. */
  const r = await comprobarUrlExterna("https://cualquiercosa.localtest.me/x");
  assert.equal(r.ok, false, "un nombre público que apunta dentro no puede pasar");
});
