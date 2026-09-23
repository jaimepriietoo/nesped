import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  huellaCoincide,
  huellaDe,
  nombreDeNavegador,
  prefijoDeIp,
  rolEstricto,
} from "../../lib/server/sesiones.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

const SAFARI_IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

test("el prefijo de IP agrupa la red, no el dispositivo, y no revienta con basura", () => {
  assert.equal(prefijoDeIp("83.45.120.7"), "83.45.120.0/24");
  assert.equal(prefijoDeIp("83.45.120.200"), "83.45.120.0/24");
  assert.equal(prefijoDeIp("2a02:26f0:1:2:3:4:5:6"), "2a02:26f0:1::/48");
  assert.equal(prefijoDeIp("unknown"), "");
  assert.equal(prefijoDeIp(""), "");
});

test("el nombre del navegador es reconocible y no guarda el User-Agent entero", () => {
  assert.equal(nombreDeNavegador(SAFARI_IPHONE), "Safari en iOS");
  assert.equal(nombreDeNavegador(CHROME_MAC), "Chrome en macOS");
  assert.equal(nombreDeNavegador(""), "Desconocido");
  const huella = huellaDe({ userAgent: CHROME_MAC, ip: "83.45.120.7" });
  assert.equal(huella.ua.length, 32);
  assert.notEqual(huella.ua, CHROME_MAC);
  assert.equal(huella.ipPrefijo, "83.45.120.0/24");
});

test("otro navegador nunca vale; otra red sólo se tolera fuera de owner y admin", () => {
  const casa = huellaDe({ userAgent: CHROME_MAC, ip: "83.45.120.7" });
  const oficina = huellaDe({ userAgent: CHROME_MAC, ip: "91.10.5.2" });
  const movil = huellaDe({ userAgent: SAFARI_IPHONE, ip: "83.45.120.7" });

  assert.equal(huellaCoincide({ token: casa, actual: casa, role: "owner" }), true);
  assert.equal(huellaCoincide({ token: casa, actual: movil, role: "agent" }), false, "otro navegador");
  assert.equal(huellaCoincide({ token: casa, actual: oficina, role: "agent" }), true, "agente cambia de red");
  assert.equal(huellaCoincide({ token: casa, actual: oficina, role: "owner" }), false, "owner cambia de red");
  assert.equal(huellaCoincide({ token: casa, actual: oficina, role: "admin" }), false);
  assert.equal(huellaCoincide({ token: undefined, actual: casa, role: "agent" }), false, "token antiguo sin huella");
  assert.ok(rolEstricto("Owner") && rolEstricto("admin") && rolEstricto("super_admin") && !rolEstricto("manager"));
});

test("si la base falla, los roles estrictos fallan cerrado", async () => {
  const { comprobarSesion } = await import("../../lib/server/sesiones.js");
  const consulta = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: null, error: new Error("base no disponible") }; },
  };
  const supabase = { from: () => consulta };
  const entrada = {
    sid: "sesion-1",
    email: "owner@empresa.test",
    clientId: "empresa-a",
  };

  assert.match(await comprobarSesion({ ...entrada, role: "owner" }, { supabase }), /Vuelve a entrar/);
  assert.match(await comprobarSesion({ ...entrada, role: "super_admin" }, { supabase }), /Vuelve a entrar/);
  assert.equal(await comprobarSesion({ ...entrada, role: "agent" }, { supabase }), null);
});

test("el token lleva sid y huella, y cada petición comprueba huella, fila e inactividad", () => {
  const auth = leer("lib/server/auth.js");
  assert.match(auth, /const sid = await abrirSesion\(/);
  assert.match(auth, /huella: \{ ua: huella\.ua, ip: huella\.ip \}/);
  const contexto = auth.slice(auth.indexOf("export async function getAuthenticatedUserContext"));
  const epoch = contexto.indexOf("session_epoch || 0)");
  const huella = contexto.indexOf("huellaCoincide(");
  const fila = contexto.indexOf("comprobarSesion(");
  assert.ok(epoch > 0 && huella > epoch && fila > huella, "epoch, luego huella, luego fila");
  assert.match(auth, /cerrarTodasLasSesiones\(/, "cerrar todas también cierra las filas");
});

test("la ruta de sesiones valida, limita, sólo toca las propias y audita", () => {
  const s = leer("app/api/portal/sesiones/route.js");
  assert.match(s, /leerJsonLimitado\(req, \{ maxBytes: 1024 \}\)/);
  assert.match(s, /requireRateLimitAsync\(req/);
  assert.match(s, /validar\(CerrarSesion, cuerpo\.datos\)/);
  assert.match(s, /cerrarSesion\(\{ sid: entrada\.datos\.id, email: ctx\.userEmail, clientId: ctx\.clientId \}\)/);
  assert.match(s, /action: "session_revoked"/);
  const modulo = leer("lib/server/sesiones.js");
  assert.match(modulo, /getSupabaseAdministrativo/);
  assert.doesNotMatch(modulo, /getSupabase\(\)/);
  assert.match(modulo, /INACTIVIDAD_ADMIN_MS = 15 \* 60 \* 1000/);
});
