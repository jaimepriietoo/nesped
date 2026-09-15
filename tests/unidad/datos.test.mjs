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
