import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getPermissionCatalog } from "@/lib/server/portal-permissions";
import { ACCIONES, SOLO_CON_CASILLA, puede, rolesQuePueden, sinPermiso } from "@/lib/server/permisos";

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
  assert.ok(puede("manager", "crm.export", ["crm.export"]));
  assert.ok(!puede("agent", "crm.export"));
  assert.ok(puede("agent", "crm.edit", ["crm.edit"]));
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
  const fuentes = ["app", "lib"].flatMap(dir =>
    fs.readdirSync(path.join(RAIZ, dir), { recursive: true })
      .filter(file => file.endsWith(".js"))
      .map(file => fs.readFileSync(path.join(RAIZ, dir, file), "utf8"))
  ).join("\n");
  const llamadas = [...fuentes.matchAll(/puede\(ctx\.role, "([^"]+)"([^)]*)\)/g)];
  const usadas = [...new Set(llamadas.map(m => m[1]))];
  assert.ok(usadas.length >= 15, `se esperaban muchas rutas con puede(); hay ${usadas.length}`);
  for (const [, accion, argumentos] of llamadas) {
    assert.ok(accion in ACCIONES, `acción sin definir: ${accion}`);
    assert.equal(argumentos.trim(), ", ctx.permissions", `${accion}: la ruta olvidó los permisos del usuario`);
  }
  assert.doesNotMatch(fuentes, /hasRole\(ctx\.role, \[/, "listas de roles fuera de la tabla");
});

test("cada escritura de negocio del portal pasa por puede()", () => {
  const raizPortal = path.join(RAIZ, "app/api/portal");
  const excepcionesAcotadas = new Set([
    // Endpoint retirado: siempre responde 410 y no escribe.
    "account/setup/route.js",
    // Operaciones de seguridad sobre la propia cuenta, nunca sobre otra.
    "codigos-recuperacion/route.js",
    "sesiones/revocar/route.js",
    "sesiones/route.js",
    "passkeys/route.js",
    "totp/route.js",
    // Las tres rutas llaman al mismo helper, que comprueba users.manage.
    "users/create/route.js",
    "users/reset-password/route.js",
    "users/update/route.js",
  ]);

  const rutas = fs.readdirSync(raizPortal, { recursive: true })
    .filter(file => file.endsWith("route.js"));

  for (const relativa of rutas) {
    const fuente = fs.readFileSync(path.join(raizPortal, relativa), "utf8");
    const escribe = /export (?:async function|const) (?:POST|PUT|PATCH|DELETE)\b/.test(fuente);
    if (!escribe || excepcionesAcotadas.has(relativa)) continue;
    assert.match(fuente, /puede\(ctx\.role, "[^"]+", ctx\.permissions\)/, `${relativa}: escritura sin puede()`);
  }
});

test("cada escritura autenticada fuera del portal pasa también por puede()", () => {
  const raizApi = path.join(RAIZ, "app/api");
  const excepcionesDeCuentaPropia = new Set([
    "portal/codigos-recuperacion/route.js",
    "portal/sesiones/revocar/route.js",
    "portal/sesiones/route.js",
    "portal/passkeys/route.js",
    "portal/totp/route.js",
  ]);
  const rutas = fs.readdirSync(raizApi, { recursive: true })
    .filter(file => file.endsWith("route.js"));

  for (const relativa of rutas) {
    const fuente = fs.readFileSync(path.join(raizApi, relativa), "utf8");
    const escribe = /export (?:async function|const) (?:POST|PUT|PATCH|DELETE)\b/.test(fuente);
    const usaSesionPortal = /getPortalContext\(/.test(fuente);
    if (!escribe || !usaSesionPortal || excepcionesDeCuentaPropia.has(relativa)) continue;
    assert.match(
      fuente,
      /puede\(ctx\.role, "[^"]+", ctx\.permissions\)/,
      `${relativa}: escritura autenticada sin puede()`,
    );
  }
});

test("crear el checkout del plan exige gestionar facturación", () => {
  const fuente = fs.readFileSync(path.join(RAIZ, "app/api/suscripcion/iniciar/route.js"), "utf8");
  assert.match(fuente, /puede\(ctx\.role, "billing\.manage", ctx\.permissions\)/);
  assert.match(fuente, /requireRateLimitAsync\(req/);
  assert.match(fuente, /Cache-Control", "no-store"/);
  assert.doesNotMatch(fuente, /console\.error/);
});

test("la respuesta de sin permiso es un 403 con la forma de siempre", async () => {
  const r = sinPermiso();
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { success: false, message: "Sin permisos" });
  assert.ok(fs.existsSync(path.join(RAIZ, "lib/server/permisos.js")));
});

test("manager y agent fallan cerrados sin una casilla válida", () => {
  for (const rol of ["manager", "agent"]) {
    for (const accion of Object.keys(ACCIONES)) {
      if (!ACCIONES[accion].includes(rol)) continue;
      for (const permisos of [undefined, null, [], ["inexistente"], "crm.edit"]) {
        assert.equal(puede(rol, accion, permisos), false, `${rol}: ${accion}`);
      }
    }
  }
});

test("manager y agent sólo conservan las casillas marcadas, sin ganar privilegios", () => {
  const catalogo = getPermissionCatalog().map(item => item.id);
  for (const rol of ["manager", "agent"]) {
    for (const accion of Object.keys(ACCIONES)) {
      if (SOLO_CON_CASILLA.has(accion)) continue; // se prueban aparte
      const porRol = ACCIONES[accion].includes(rol);
      assert.equal(puede(rol, accion, catalogo), porRol, "marcar todo no amplía el rol");
      if (!catalogo.includes(accion)) {
        assert.equal(puede(rol, accion, ["crm.view"]), porRol, "sin casilla conserva el rol");
        continue;
      }
      assert.equal(puede(rol, accion, [accion]), porRol);
      assert.equal(puede(rol, accion, ["crm.view"]), false, "una casilla distinta no autoriza");
    }
  }
  assert.equal(puede("MANAGER", "crm.edit", ["crm.edit"]), true);
  assert.equal(puede("agent", "crm.edit", ["inexistente", "inbox.reply"]), false);
  assert.equal(puede("agent", "settings.manage", ["security.manage"]), false);
});

test("cada acción de manager o agent tiene una casilla y ninguna queda implícita", () => {
  const catalogo = new Set(getPermissionCatalog().map(item => item.id));
  for (const [accion, roles] of Object.entries(ACCIONES)) {
    if (roles.includes("manager") || roles.includes("agent")) {
      assert.ok(catalogo.has(accion), `${accion}: falta su casilla`);
    }
  }
});

test("owner y admin nunca quedan restringidos por las casillas", () => {
  for (const rol of ["owner", "admin", "ADMIN"]) {
    for (const accion of Object.keys(ACCIONES)) {
      assert.equal(puede(rol, accion, ["crm.view"]), true, rol + ": " + accion);
    }
  }
});

test("las casillas nunca conceden operaciones a viewer ni a roles desconocidos", () => {
  const todas = getPermissionCatalog().map(item => item.id);
  for (const rol of ["viewer", "super_admin", "", null]) {
    for (const accion of Object.keys(ACCIONES)) assert.equal(puede(rol, accion, todas), false);
  }
});

test("cambiar o vaciar las casillas se aplica a la siguiente comprobación", () => {
  assert.equal(puede("agent", "crm.edit", ["crm.edit"]), true);
  assert.equal(puede("agent", "crm.edit", ["inbox.reply"]), false);
  assert.equal(puede("agent", "crm.edit", []), false);
});

test("el perfil carga permisos desde la misma consulta autenticada y acotada", () => {
  const auth = fs.readFileSync(path.join(RAIZ, "lib/server/auth.js"), "utf8");
  const consulta = auth.slice(auth.indexOf('const { data: profile,'), auth.indexOf('if (profileError'));
  assert.match(consulta, /select\("[^"]*permissions[^"]*"\)/);
  assert.match(consulta, /\.eq\("client_id", session.clientId\)\.eq\("email", email\)/);
  assert.match(auth, /const \{ permissions, \.\.\.portalUser \} = ctx.profile/);
});

test("decidir a quién llegan los contactos: manager sólo con su casilla, tenga o no otras", () => {
  assert.equal(puede("manager", "routing.manage"), false, "sin casilla, no; el rol no lo hereda");
  assert.equal(puede("manager", "routing.manage", ["crm.edit", "inbox.reply"]), false, "otras casillas no valen");
  assert.equal(puede("manager", "routing.manage", ["routing.manage"]), true);
  assert.equal(puede("agent", "routing.manage", ["routing.manage"]), false, "agent no está en el rol");
  assert.equal(puede("owner", "routing.manage"), true);
  assert.equal(puede("admin", "routing.manage", ["crm.view"]), true, "owner/admin nunca se restringen");
  assert.equal(puede("agent", "routing.view", ["routing.view"]), true, "ver sí lo puede el equipo con su casilla");
  assert.equal(puede("manager", "ai.configure", ["routing.manage"]), false, "la IA la configura la empresa");
});
