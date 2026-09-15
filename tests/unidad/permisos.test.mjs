import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { ACCIONES, puede, rolesQuePueden, sinPermiso } from "@/lib/server/permisos";

/**
 * Qué puede hacer cada rol.
 *
 * La tabla es la política. Lo que se sujeta aquí: que los tres escalones
 * son los que se describen, que viewer no hace nada y owner todo, que una
 * acción que no existe es un no, y que ninguna ruta pregunta por una acción
 * que la tabla no conoce.
 */

const RAIZ = path.resolve(import.meta.dirname, "../..");

test("tres escalones: empresa, gestión, trabajo; viewer sólo mira", () => {
  for (const [accion, roles] of Object.entries(ACCIONES)) {
    assert.ok(roles.includes("owner") && roles.includes("admin"), `${accion}: owner y admin siempre pueden`);
    assert.ok(!roles.includes("viewer"), `${accion}: viewer no escribe`);
    if (roles.includes("agent")) assert.ok(roles.includes("manager"), `${accion}: si agent puede, manager también`);
  }
  assert.ok(puede("owner", "users.manage"));
  assert.ok(puede("ADMIN", "brand.manage"), "el rol no distingue mayúsculas");
  assert.ok(!puede("manager", "settings.manage"));
  assert.ok(puede("manager", "crm.export"));
  assert.ok(!puede("agent", "crm.export"));
  assert.ok(puede("agent", "crm.edit"));
  assert.ok(!puede("viewer", "crm.edit"));
  assert.ok(!puede(null, "crm.edit"));
});

test("una acción que no existe es que no, y se avisa", () => {
  const avisos = [];
  const original = console.error;
  console.error = (...a) => avisos.push(a.join(" "));
  try {
    assert.equal(puede("owner", "cohetes.lanzar"), false);
  } finally {
    console.error = original;
  }
  assert.match(avisos.join("\n"), /acción desconocida/);
  assert.deepEqual(rolesQuePueden("cohetes.lanzar"), []);
});

test("ninguna ruta pregunta por una acción que la tabla no conoce", () => {
  const salida = execSync(`grep -rhoE 'puede\\(ctx\\.role, "[^"]+"\\)' app lib --include='*.js'`, { cwd: RAIZ, encoding: "utf8" });
  const usadas = [...new Set([...salida.matchAll(/"([^"]+)"/g)].map((m) => m[1]))];
  assert.ok(usadas.length >= 15, `se esperaban muchas rutas con puede(); hay ${usadas.length}`);
  for (const accion of usadas) assert.ok(accion in ACCIONES, `acción sin definir: ${accion}`);
  /* Y ya no queda ninguna lista de roles suelta en las rutas. */
  const sueltas = execSync(`grep -rl 'hasRole(ctx.role, \\[' app --include='*.js' || true`, { cwd: RAIZ, encoding: "utf8" }).trim();
  assert.equal(sueltas, "", `listas de roles fuera de la tabla:\n${sueltas}`);
});

test("la respuesta de sin permiso es un 403 con la forma de siempre", async () => {
  const r = sinPermiso();
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { success: false, message: "Sin permisos" });
  assert.ok(fs.existsSync(path.join(RAIZ, "lib/server/permisos.js")));
});
