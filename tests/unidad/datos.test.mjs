import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * Los datos de negocio que vivían en Prisma sobre SQLite.
 *
 * Tres cosas que no se ven en una compilación correcta:
 *
 * 1. Que Prisma se ha ido DEL TODO. Bastaba con un fichero que siguiera
 *    importándolo para que una ruta escribiera en un SQLite que en Vercel no
 *    existe. Esta prueba recorre app/ y lib/ y no admite ni un import.
 *
 * 2. Que la traducción de filas respeta la forma que espera el código: los
 *    treinta sitios que leen historiales miran `type`, `message`, `phone` y
 *    `lead_id`, y la tabla lead_events los guarda como `description` y
 *    `meta`. Si la traducción cambia, cambian todos a la vez.
 *
 * 3. Que un identificador que no es un uuid no se cuela en una columna uuid.
 *    Prisma admitía cualquier texto como lead_id; Postgres no, y un insert
 *    que revienta en producción por eso es difícil de rastrear.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");

function ficheros(dir) {
  const salida = [];
  for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entrada.name === "node_modules" || entrada.name === ".next") continue;
    const completa = path.join(dir, entrada.name);
    if (entrada.isDirectory()) salida.push(...ficheros(completa));
    else if (/\.(js|mjs|cjs)$/.test(entrada.name)) salida.push(completa);
  }
  return salida;
}

test("no queda ningún import de Prisma en app/ ni en lib/", () => {
  const culpables = [];
  for (const f of [...ficheros(path.join(RAIZ, "app")), ...ficheros(path.join(RAIZ, "lib"))]) {
    const s = fs.readFileSync(f, "utf8");
    if (/from\s+["']@\/lib\/prisma["']|from\s+["'][^"']*generated\/prisma|@prisma\//.test(s)) {
      culpables.push(path.relative(RAIZ, f));
    }
  }
  assert.deepEqual(culpables, [], `Siguen importando Prisma:\n  ${culpables.join("\n  ")}`);
  assert.equal(fs.existsSync(path.join(RAIZ, "lib/prisma.js")), false, "lib/prisma.js tiene que haber desaparecido");
  assert.equal(fs.existsSync(path.join(RAIZ, "prisma")), false, "la carpeta prisma/ tiene que haber desaparecido");
});

test("package.json no depende de Prisma ni de SQLite", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, "package.json"), "utf8"));
  const todas = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const malas = Object.keys(todas).filter((d) => /prisma|sqlite/i.test(d));
  assert.deepEqual(malas, []);
});

test("una fila de lead_events se traduce a la forma que esperaba el código", async () => {
  const { PARA_PRUEBAS } = await import("../../lib/server/datos.js");
  const fila = {
    id: "e1", lead_id: "5d3c2a1e-0000-4000-8000-000000000001", client_id: "demo",
    type: "payment_completed", title: "payment_completed", description: '{"amount":10}',
    meta: { phone: "+34600111222" }, created_at: "2026-09-15T10:00:00Z",
  };
  const e = PARA_PRUEBAS.eventoDesdeFila(fila);
  assert.equal(e.message, '{"amount":10}');
  assert.equal(e.phone, "+34600111222");
  assert.equal(e.type, "payment_completed");
  assert.equal(e.lead_id, fila.lead_id);
  assert.equal(e.client_id, "demo");

  /* Un lead_id que no era uuid se guardó en meta.lead_ref y vuelve por ahí. */
  const antigua = PARA_PRUEBAS.eventoDesdeFila({ ...fila, lead_id: null, meta: { lead_ref: "lead_abc", phone: null } });
  assert.equal(antigua.lead_id, "lead_abc");
  assert.equal(antigua.phone, null);
});

test("sólo un uuid de verdad pasa como uuid", async () => {
  const { PARA_PRUEBAS } = await import("../../lib/server/datos.js");
  assert.equal(PARA_PRUEBAS.esUuid("5d3c2a1e-0000-4000-8000-000000000001"), true);
  assert.equal(PARA_PRUEBAS.esUuid("lead_abc"), false);
  assert.equal(PARA_PRUEBAS.esUuid(""), false);
  assert.equal(PARA_PRUEBAS.esUuid(null), false);
  assert.equal(PARA_PRUEBAS.esUuid(42), false);
});

function clienteCapturador() {
  const operaciones = [];
  const respuesta = { data: null, error: null };
  const consulta = {
    select(columnas) {
      operaciones.push(["select", columnas]);
      return this;
    },
    update(cambios) {
      operaciones.push(["update", cambios]);
      return this;
    },
    eq(columna, valor) {
      operaciones.push(["eq", columna, valor]);
      return this;
    },
    or(filtro) {
      operaciones.push(["or", filtro]);
      return this;
    },
    order(columna, opciones) {
      operaciones.push(["order", columna, opciones]);
      return this;
    },
    limit(cantidad) {
      operaciones.push(["limit", cantidad]);
      return this;
    },
    async maybeSingle() {
      operaciones.push(["maybeSingle"]);
      return respuesta;
    },
    then(resolver, rechazar) {
      return Promise.resolve(respuesta).then(resolver, rechazar);
    },
  };

  return {
    operaciones,
    from(tabla) {
      operaciones.push(["from", tabla]);
      return consulta;
    },
  };
}

test("leer y actualizar una llamada exige y aplica el client_id", async () => {
  const { ultimaLlamadaDeLead, actualizarLlamada } = await import("../../lib/server/datos.js");
  const { conContexto, fijarClienteDeDatos } = await import("../../lib/server/contexto.mjs");
  const leadId = "5d3c2a1e-0000-4000-8000-000000000001";

  await assert.rejects(
    () => ultimaLlamadaDeLead({ lead_id: leadId, phone: "+34600111222" }),
    /falta la empresa/,
  );
  await assert.rejects(
    () => actualizarLlamada("call-1", { status: "completed" }),
    /falta la empresa/,
  );

  const cliente = clienteCapturador();
  await conContexto({}, async () => {
    fijarClienteDeDatos(cliente);
    await ultimaLlamadaDeLead({
      client_id: "empresa-a",
      lead_id: leadId,
      phone: "+34600111222",
    });
    await actualizarLlamada("call-1", { status: "completed" }, "empresa-a");
  });

  const filtrosEmpresa = cliente.operaciones.filter(
    ([operacion, columna, valor]) =>
      operacion === "eq" && columna === "client_id" && valor === "empresa-a",
  );
  assert.equal(filtrosEmpresa.length, 2, "lectura y escritura deben quedar acotadas a la empresa");
  assert.ok(
    cliente.operaciones.some(
      ([operacion, columna, valor]) => operacion === "eq" && columna === "id" && valor === "call-1",
    ),
    "la actualización también conserva el filtro por id de llamada",
  );
});
