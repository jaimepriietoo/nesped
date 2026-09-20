import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  TABLAS, cifrar, descifrar, cifrarFila, descifrarFila, selectConSobres, filtroCifrado,
  hashDeBusqueda, normalizarParaBusqueda, envolverConCifrado, condicionOr, claveDeEmpresa, modoCifrado,
} from "../../lib/server/cifrado-datos.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const ENV = { NESPED_DATA_ENCRYPTION_KEY: "a".repeat(64) };
const OTRA = { NESPED_DATA_ENCRYPTION_KEY: "b".repeat(64) };

test("cifra y descifra por empresa; otra empresa, otra columna u otra clave no abren", () => {
  const sobre = cifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", valor: "+34 600 111 222", env: ENV });
  assert.match(sobre, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(descifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", sobre, env: ENV }), "+34 600 111 222");
  assert.throws(() => descifrar({ tabla: "leads", columna: "telefono", clientId: "demo", sobre, env: ENV }));
  assert.throws(() => descifrar({ tabla: "leads", columna: "email", clientId: "fibergreen", sobre, env: ENV }));
  assert.throws(() => descifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", sobre, env: OTRA }));
  assert.notEqual(claveDeEmpresa("fibergreen", ENV).toString("hex"), claveDeEmpresa("demo", ENV).toString("hex"));
  assert.throws(() => cifrar({ tabla: "leads", columna: "telefono", clientId: "x", valor: "1", env: { NESPED_DATA_ENCRYPTION_KEY: "corta" } }), /32 bytes/);
});

test("el hash de búsqueda normaliza teléfonos y correos y no depende de la empresa", () => {
  assert.equal(normalizarParaBusqueda("telefono", "+34 600-111 222"), "+34600111222");
  assert.equal(normalizarParaBusqueda("telefono", "0034600111222"), "+34600111222");
  assert.equal(normalizarParaBusqueda("email", "  Ana@X.com "), "ana@x.com");
  assert.equal(hashDeBusqueda("telefono", "+34 600 111 222", ENV), hashDeBusqueda("phone", "+34600111222", ENV) === null ? null : hashDeBusqueda("telefono", "+34600111222", ENV));
  assert.notEqual(hashDeBusqueda("telefono", "600111222", ENV), hashDeBusqueda("email", "600111222", ENV));
  assert.equal(hashDeBusqueda("email", "", ENV), null);
});

test("cifrarFila según el modo: apagado no toca, doble añade, solo vacía el claro", () => {
  const fila = { client_id: "fibergreen", nombre: "Ana", telefono: "600111222", email: "ana@x.com", ciudad: "Valladolid" };
  assert.deepEqual(cifrarFila({ tabla: "leads", fila, modo: "apagado", env: ENV }), fila);
  const doble = cifrarFila({ tabla: "leads", fila, modo: "doble", env: ENV });
  assert.equal(doble.telefono, "600111222");
  assert.match(doble.telefono_cifrado, /^v1\./);
  assert.equal(doble.telefono_hash, hashDeBusqueda("telefono", "600111222", ENV));
  assert.equal(doble.nombre, "Ana", "nombre queda en claro");
  const solo = cifrarFila({ tabla: "leads", fila, modo: "solo", env: ENV });
  assert.equal(solo.telefono, null);
  assert.equal(solo.email, null);
  assert.equal(descifrar({ tabla: "leads", columna: "email", clientId: "fibergreen", sobre: solo.email_cifrado, env: ENV }), "ana@x.com");
  /* Un patch que no toca columnas sensibles pasa tal cual. */
  assert.deepEqual(cifrarFila({ tabla: "leads", fila: { status: "won" }, modo: "solo", env: ENV }), { status: "won" });
  /* Sin empresa no se puede cifrar. */
  assert.throws(() => cifrarFila({ tabla: "leads", fila: { telefono: "1" }, modo: "solo", env: ENV }), /client_id/);
});

test("descifrarFila prefiere el sobre en cifrado/solo, cae al claro si no lo hay y limpia lo auxiliar", () => {
  const sobre = cifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", valor: "600", env: ENV });
  const conSobre = { id: 1, client_id: "fibergreen", telefono: "viejo", telefono_cifrado: sobre, telefono_hash: "h" };
  assert.deepEqual(descifrarFila({ tabla: "leads", fila: conSobre, modo: "cifrado", env: ENV }), { id: 1, client_id: "fibergreen", telefono: "600" });
  assert.deepEqual(descifrarFila({ tabla: "leads", fila: conSobre, modo: "doble", env: ENV }), { id: 1, client_id: "fibergreen", telefono: "viejo" });
  const sinSobre = { id: 2, client_id: "fibergreen", telefono: "claro", telefono_cifrado: null };
  assert.equal(descifrarFila({ tabla: "leads", fila: sinSobre, modo: "cifrado", env: ENV }).telefono, "claro");
  assert.deepEqual(descifrarFila({ tabla: "leads", fila: { ...conSobre }, modo: "cifrado", env: ENV, quitar: ["client_id"] }), { id: 1, telefono: "600" });
});

test("el select pide los sobres y client_id sólo cuando hace falta, y los filtros van por hash", () => {
  assert.deepEqual(selectConSobres("leads", "id,nombre,telefono", "cifrado"), { seleccion: "id,nombre,telefono,telefono_cifrado,client_id", quitar: ["client_id"] });
  assert.deepEqual(selectConSobres("leads", "id,client_id,telefono", "cifrado"), { seleccion: "id,client_id,telefono,telefono_cifrado", quitar: [] });
  assert.deepEqual(selectConSobres("leads", "*", "cifrado"), { seleccion: "*", quitar: [] });
  assert.deepEqual(selectConSobres("leads", "id,nombre", "cifrado"), { seleccion: "id,nombre", quitar: [] });
  assert.deepEqual(selectConSobres("leads", "id,telefono", "doble"), { seleccion: "id,telefono", quitar: [] });
  assert.deepEqual(filtroCifrado("leads", "telefono", "600 111 222", "cifrado", ENV), { columna: "telefono_hash", valor: hashDeBusqueda("telefono", "600111222", ENV) });
  assert.deepEqual(filtroCifrado("leads", "telefono", "600", "doble", ENV), { columna: "telefono", valor: "600" });
  assert.deepEqual(filtroCifrado("leads", "status", "won", "solo", ENV), { columna: "status", valor: "won" });
  assert.equal(condicionOr("calls", ["from_number", "phone"], "600", "solo", ENV), `from_number_hash.eq.${hashDeBusqueda("from_number", "600", ENV)},phone_hash.eq.${hashDeBusqueda("phone", "600", ENV)}`);
  assert.equal(condicionOr("calls", ["from_number", "phone"], "600", "doble", ENV), "from_number.eq.600,phone.eq.600");
});

/** Un cliente de Supabase de mentira que apunta lo que se le pide y devuelve filas. */
function clienteFalso(filas = []) {
  const registro = [];
  return {
    from: (tabla) => new Proxy({}, { get: (_, op) => (...args) => {
      const cadena = [[op, args]];
      const proxy = new Proxy({}, {
        get: (_o, p) => {
          if (p === "then") return (ok) => { registro.push({ tabla, cadena }); return Promise.resolve(ok({ data: filas, error: null })); };
          if (typeof p === "symbol") return undefined;
          return (...a) => { cadena.push([p, a]); return proxy; };
        },
      });
      return proxy;
    } }),
    rpc: () => "rpc",
    registro,
  };
}

test("el envoltorio cifra al insertar, reescribe filtros, pide sobres y descifra al leer", async () => {
  const env = { ...ENV, NESPED_CIFRADO_DATOS: "cifrado" };
  const sobre = cifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", valor: "600111222", env });
  const crudo = clienteFalso([{ id: 1, nombre: "Ana", telefono: null, telefono_cifrado: sobre, client_id: "fibergreen" }]);
  const s = envolverConCifrado(crudo, { env });

  const { data } = await s.from("leads").select("id,nombre,telefono").eq("client_id", "fibergreen").eq("telefono", "600 111 222").order("id").limit(1);
  assert.deepEqual(data, [{ id: 1, nombre: "Ana", telefono: "600111222" }]);
  const lectura = crudo.registro[0];
  assert.equal(lectura.tabla, "leads");
  assert.deepEqual(lectura.cadena[0], ["select", ["id,nombre,telefono,telefono_cifrado,client_id"]]);
  assert.deepEqual(lectura.cadena[2], ["eq", ["telefono_hash", hashDeBusqueda("telefono", "600111222", env)]]);
  assert.deepEqual(lectura.cadena[3], ["order", ["id"]]);

  await s.from("leads").insert({ client_id: "fibergreen", nombre: "Bea", telefono: "611" });
  const escritura = crudo.registro[1].cadena[0];
  assert.equal(escritura[0], "insert");
  assert.equal(escritura[1][0].telefono, "611", "en cifrado el claro se conserva");
  assert.match(escritura[1][0].telefono_cifrado, /^v1\./);
  assert.equal(escritura[1][0].telefono_hash, hashDeBusqueda("telefono", "611", env));

  /* El update sabe la empresa por el .eq("client_id") que viene después. */
  await s.from("leads").update({ telefono: "622" }).eq("id", 1).eq("client_id", "fibergreen");
  const update = crudo.registro[2].cadena[0];
  assert.equal(update[0], "update");
  assert.equal(descifrar({ tabla: "leads", columna: "telefono", clientId: "fibergreen", sobre: update[1][0].telefono_cifrado, env }), "622");

  /* Tablas fuera del catálogo y rpc pasan tal cual. */
  await s.from("audit_logs").insert({ action: "x" });
  assert.equal(crudo.registro[3].cadena[0][1][0].action, "x");
  assert.equal(s.rpc(), "rpc");
});

test("apagado devuelve el mismo cliente; el modo se valida", () => {
  const crudo = clienteFalso();
  assert.equal(envolverConCifrado(crudo, { env: { NESPED_CIFRADO_DATOS: "apagado" } }), crudo);
  assert.equal(modoCifrado({}), "apagado");
  assert.throws(() => modoCifrado({ NESPED_CIFRADO_DATOS: "quizas" }), /debe ser/);
});

test("catálogo, migración y enganches: columnas gemelas para cada cifrada y hash para cada buscable", () => {
  const sql = fs.readFileSync(path.join(RAIZ, "supabase/migrations/20260921010000_columnas_cifradas.sql"), "utf8");
  for (const [tabla, def] of Object.entries(TABLAS)) {
    for (const c of def.cifradas) assert.match(sql, new RegExp(`${c}_cifrado text`), `${tabla}.${c}_cifrado`);
    for (const c of def.buscables) {
      assert.ok(def.cifradas.includes(c), `${tabla}.${c} buscable pero no cifrada`);
      assert.match(sql, new RegExp(`${c}_hash text`), `${tabla}.${c}_hash`);
    }
  }
  assert.doesNotMatch(sql, /drop |set null|update public/i, "la migración es aditiva");
  assert.match(fs.readFileSync(path.join(RAIZ, "lib/supabase.js"), "utf8"), /envolverConCifrado\(cachedCrudo\)/);
  assert.match(fs.readFileSync(path.join(RAIZ, "lib/server/supabase-empresa.js"), "utf8"), /envolverConCifrado\(createClient/);
  assert.match(fs.readFileSync(path.join(RAIZ, "lib/server/contacto.js"), "utf8"), /condicionOr\("calls"/);
  assert.match(fs.readFileSync(path.join(RAIZ, "lib/server/mantenimiento.js"), "utf8"), /rellenarCifrado\(/);
  assert.ok(fs.readFileSync(path.join(RAIZ, "lib/server/kms.js"), "utf8").includes('"NESPED_DATA_ENCRYPTION_KEY"'), "la clave de datos puede ir en sobre KMS");
});
