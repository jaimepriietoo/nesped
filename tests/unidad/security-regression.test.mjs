import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { hashPassword, verifyPassword, verifyPasswordWithoutAccountLeak, sessionSecret, hashOtpCode, challengeKey, generateTwoFactorCode } from "../../lib/server/auth-crypto.js";
import { allowedOrigins, isSameOriginRequest, getRequestIp } from "../../lib/server/request-policy.js";
import { comprobarUrlExterna, peticionExternaSegura } from "../../lib/server/url-segura.js";
import { redactData, redactText } from "../../lib/server/redaction.mjs";
import { GET as oldSetupGet, POST as oldSetupPost } from "../../app/api/portal/account/setup/route.js";
import { POST as logout } from "../../app/api/logout/route.js";
import { leerJsonLimitado, leerTextoLimitado } from "../../lib/server/security.js";
import { logErrorSeguro } from "../../lib/server/observability.mjs";
import { isAuthorizedElevenLabsWebhook } from "../../lib/server/elevenlabs.js";
import { destinoSmsPermitido } from "../../app/api/followup/sms/route.js";

test("las contraseñas sólo admiten scrypt y usan una sal distinta", () => {
  const password = "Una-clave-larga-de-pruebas!";
  const hash = hashPassword(password);
  assert.notEqual(hashPassword(password), hash);
  assert.equal(verifyPassword(password, hash), true);
  for (const stored of [password, "", "scrypt$malformado", "!activation-required"]) assert.equal(verifyPassword(password, stored), false);
  assert.equal(verifyPassword("otra", hash), false);
  assert.equal(verifyPassword("x".repeat(201), hash), false);
});

test("un correo inexistente recorre scrypt pero nunca autentica", () => {
  const password = "Una-clave-larga-de-pruebas!";
  const hash = hashPassword(password);
  assert.equal(verifyPasswordWithoutAccountLeak(password, hash), true);
  assert.equal(verifyPasswordWithoutAccountLeak(password, ""), false);
  assert.equal(verifyPasswordWithoutAccountLeak(password, "valor-malformado"), false);
});

test("cerrar sesión rechaza una petición de otro origen", async () => {
  const response = await logout(new Request("http://localhost:3000/api/logout", {
    method: "POST",
    headers: { origin: "https://attacker.example" },
  }));
  assert.equal(response.status, 403);
});

test("el secreto de sesión es obligatorio y no reutiliza credenciales internas", () => {
  const old = process.env.NESPED_SESSION_SECRET;
  const internal = process.env.INTERNAL_API_TOKEN;
  try {
    delete process.env.NESPED_SESSION_SECRET;
    assert.throws(sessionSecret);
    process.env.NESPED_SESSION_SECRET = "corto";
    assert.throws(sessionSecret);
    process.env.NESPED_SESSION_SECRET = "clave-exclusiva-para-pruebas-123456789";
    process.env.INTERNAL_API_TOKEN = process.env.NESPED_SESSION_SECRET;
    assert.throws(sessionSecret);
    delete process.env.INTERNAL_API_TOKEN;
    assert.equal(sessionSecret(), process.env.NESPED_SESSION_SECRET);
    assert.notEqual(hashOtpCode("123456", "challenge-A"), hashOtpCode("123456", "challenge-B"));
    assert.equal(hashOtpCode("123456", "challenge-A"), hashOtpCode("123456", "challenge-A"));
    assert.notEqual(challengeKey("opaque-cookie"), "opaque-cookie");
    for (let i = 0; i < 50; i++) assert.match(generateTwoFactorCode(), /^[1-9][0-9]{5}$/);
  } finally {
    if (old === undefined) delete process.env.NESPED_SESSION_SECRET; else process.env.NESPED_SESSION_SECRET = old;
    if (internal === undefined) delete process.env.INTERNAL_API_TOKEN; else process.env.INTERNAL_API_TOKEN = internal;
  }
});

const production = { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://nesped.example" };
const request = headers => new Request("https://nesped.example/api/action", { headers });
test("CSRF rechaza cabeceras Host y forwarded falsificadas", () => {
  assert.equal(isSameOriginRequest(request({ origin: "https://attacker.example", host: "attacker.example", "x-forwarded-host": "attacker.example" }), production), false);
  assert.equal(isSameOriginRequest(request({ origin: "http://nesped.example" }), production), false);
  assert.equal(isSameOriginRequest(request({}), production), false);
  assert.equal(isSameOriginRequest(request({ origin: "null" }), production), false);
  assert.equal(isSameOriginRequest(request({ origin: "https://nesped.example" }), production), true);
  assert.equal(isSameOriginRequest(request({ origin: "https://nesped.example", referer: "https://attacker.example/form" }), production), false);
  assert.equal(allowedOrigins(production).has("http://localhost:3000"), false);
});

test("los SMS sólo pueden salir al teléfono del contacto", () => {
  assert.equal(destinoSmsPermitido("600 111 222", "+34 600 111 222"), "+34600111222");
  assert.equal(destinoSmsPermitido("+34600999888", "+34 600 111 222"), "");
  assert.equal(destinoSmsPermitido("no-es-un-telefono", "+34 600 111 222"), "");
});

test("las operaciones externas sensibles conservan sus cuatro barreras", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of ["app/api/followup/sms/route.js", "app/api/admin/domains/route.js"]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /requireSameOrigin\(req\)/, `${relativa}: falta CSRF`);
    assert.match(fuente, /requireRateLimitAsync\(req/, `${relativa}: falta rate limit`);
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(/, `${relativa}: falta validación de esquema`);
  }
});

test("las exportaciones sensibles quedan auditadas y no se cachean", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const contactos = fs.readFileSync(path.join(raiz, "app/api/leads/export/route.js"), "utf8");
  const auditoria = fs.readFileSync(path.join(raiz, "app/api/portal/audit/export/route.js"), "utf8");

  assert.match(contactos, /action: "contacts_exported"/);
  assert.match(auditoria, /action: "audit_exported"/);
  for (const fuente of [contactos, auditoria]) {
    assert.match(fuente, /actor: ctx\.userEmail/);
    assert.match(fuente, /if \(auditError\) throw/);
    assert.match(fuente, /"Cache-Control": "no-store"/);
  }
});
test("la IP no confía en cabeceras de Cloudflare ni en proxies sin configurar", () => {
  const req = request({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "8.8.8.8" });
  assert.equal(getRequestIp(req, {}), "unknown");
  assert.equal(getRequestIp(req, { VERCEL: "1" }), "8.8.8.8");
  assert.equal(getRequestIp(request({ "x-forwarded-for": "1.1.1.1, 8.8.8.8" }), { VERCEL: "1" }), "unknown");
});

test("los cuerpos públicos tienen límite aunque lleguen por fragmentos", async () => {
  const porCabecera = await leerTextoLimitado(new Request("https://nesped.example/api/publica", {
    method: "POST", headers: { "content-length": "100" }, body: "x",
  }), { maxBytes: 8 });
  assert.equal(porCabecera.respuesta.status, 413);

  const porContenido = await leerTextoLimitado(new Request("https://nesped.example/api/publica", {
    method: "POST", body: "123456789",
  }), { maxBytes: 8 });
  assert.equal(porContenido.respuesta.status, 413);

  const jsonMalo = await leerJsonLimitado(new Request("https://nesped.example/api/publica", {
    method: "POST", body: "{",
  }), { maxBytes: 8 });
  assert.equal(jsonMalo.respuesta.status, 400);
});

test("ninguna ruta lee un cuerpo sin límite y todo JSON limitado pasa por Zod", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const rutas = fs.readdirSync(path.join(raiz, "app/api"), { recursive: true })
    .filter(archivo => archivo.endsWith("route.js"));
  for (const relativa of rutas) {
    const fuente = fs.readFileSync(path.join(raiz, "app/api", relativa), "utf8");
    assert.doesNotMatch(
      fuente,
      /await\s+(?:req|request)\.(?:json|text|formData)\(/,
      `${relativa}: lectura de cuerpo sin límite`,
    );
    if (/leerJsonLimitado\(/.test(fuente)) {
      assert.match(fuente, /validar\(/, `${relativa}: JSON sin esquema Zod`);
    }
  }
});

test("las entradas públicas de dominio y plan pasan por Zod", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const casos = [
    ["app/api/public-client/route.js", "HostPublico"],
    ["app/api/stripe/public-checkout/route.js", "ConsultaCheckoutPublico"],
    ["app/api/suscripcion/iniciar/route.js", "ConsultaCheckoutPublico"],
  ];
  for (const [relativa, esquema] of casos) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, new RegExp(`validar\\(${esquema}`), `${relativa}: entrada pública sin Zod`);
  }
});

const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
function fakeHttps({ status = 200, headers = {}, chunks = ["ok"], finish = true, inspect = () => {} } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    transport(url, options, callback) {
      calls++;
      inspect(url, options);
      const req = new EventEmitter();
      req.destroy = error => { if (error) queueMicrotask(() => req.emit("error", error)); };
      req.end = () => queueMicrotask(() => {
        const res = new EventEmitter();
        res.statusCode = status;
        res.headers = headers;
        res.destroy = () => { res.destroyed = true; };
        callback(res);
        for (const chunk of chunks) if (!res.destroyed) res.emit("data", Buffer.from(chunk));
        if (finish && !res.destroyed) res.emit("end");
      });
      return req;
    },
  };
}
test("SSRF conecta con la IP validada sin segunda resolución DNS", async () => {
  let lookups = 0;
  const fake = fakeHttps({ inspect(url, options) {
    assert.equal(url.hostname, "hook.example");
    assert.equal(options.agent, false);
    options.lookup("hook.example", {}, (error, address) => {
      assert.ifError(error);
      assert.equal(address, "93.184.216.34");
    });
  } });
  const response = await peticionExternaSegura("https://hook.example", {}, {
    resolver: async () => { lookups++; return lookups === 1 ? publicDns() : [{ address: "127.0.0.1", family: 4 }]; },
    transport: fake.transport,
  });
  assert.equal(await response.text(), "ok");
  assert.equal(lookups, 1);
});
test("SSRF no sigue redirecciones hacia redes privadas", async () => {
  const fake = fakeHttps({ status: 302, headers: { location: "https://127.0.0.1" } });
  await assert.rejects(peticionExternaSegura("https://hook.example", {}, { resolver: publicDns, transport: fake.transport }), /redirecciones/);
  assert.equal(fake.calls, 1);
});
test("SSRF rechaza respuestas grandes, incluso sin content-length", async () => {
  for (const options of [{ headers: { "content-length": "9000" } }, { chunks: ["abc", "def"] }]) {
    const fake = fakeHttps(options);
    await assert.rejects(peticionExternaSegura("https://hook.example", { maxBytes: 4 }, { resolver: publicDns, transport: fake.transport }), /demasiado grande/);
  }
});
test("SSRF limita el tiempo de DNS y del cuerpo", async () => {
  const fake = fakeHttps({ finish: false });
  await assert.rejects(peticionExternaSegura("https://hook.example", { timeoutMs: 10 }, { resolver: publicDns, transport: fake.transport }), /espera/);
  await assert.rejects(peticionExternaSegura("https://hook.example", { timeoutMs: 10 }, { resolver: () => new Promise(() => {}), transport: fake.transport }), /espera/);
});
test("SSRF rechaza DNS mixto, puertos, credenciales e IPv6 privado", async () => {
  for (const url of ["https://user:password@hook.example", "https://hook.example:8443", "https://[fd00::1]", "https://[::ffff:7f00:1]", "https://198.18.0.1"]) {
    assert.equal((await comprobarUrlExterna(url, publicDns)).ok, false, url);
  }
  const result = await comprobarUrlExterna("https://hook.example", async () => [
    { address: "93.184.216.34", family: 4 }, { address: "10.0.0.1", family: 4 },
  ]);
  assert.equal(result.ok, false);
});
test("Stripe checkout antiguo nunca permite reescribir credenciales", async () => {
  for (const handler of [oldSetupGet, oldSetupPost]) {
    const response = handler(new Request("https://nesped.example/api/portal/account/setup?session_id=cs_valid"));
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});
test("los registros eliminan secretos, datos personales, ciclos y consultas URL", () => {
  const cycle = {}; cycle.next = cycle;
  const safe = redactData({ password: "private", nested: { email: "a@example.org", transcript: "private" }, cycle });
  const rendered = JSON.stringify(safe);
  assert.ok(!rendered.includes("private"));
  assert.ok(!rendered.includes("a@example.org"));
  assert.match(rendered, /redacted:depth/);
  assert.equal(redactText("https://user:pass@example.org/path?token=123#secret"), "https://example.org/path");
  assert.equal(redactText("Contact a@example.org +34600111222"), "Contact [email] [phone]");
});

test("los errores públicos se registran sin datos personales ni secretos", () => {
  const lineas = [];
  const original = console.error;
  const oldWebhook = process.env.OPS_ALERT_WEBHOOK_URL;
  delete process.env.OPS_ALERT_WEBHOOK_URL;
  console.error = linea => lineas.push(String(linea));
  try {
    logErrorSeguro("public.test", new Error("Falló a@example.org +34600111222 https://example.org/a?token=privado"), {
      token: "privado",
    });
  } finally {
    console.error = original;
    if (oldWebhook === undefined) delete process.env.OPS_ALERT_WEBHOOK_URL;
    else process.env.OPS_ALERT_WEBHOOK_URL = oldWebhook;
  }
  const salida = lineas.join("\n");
  assert.doesNotMatch(salida, /a@example\.org|34600111222|token=privado|"token":"privado"/);
  assert.match(salida, /\[email\]|\[phone\]|\[redacted\]/);
});

test("las rutas con datos sensibles no vuelcan errores crudos", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const rutas = [
    "app/api/calls/route.js",
    "app/api/lead-events/route.js",
    "app/api/analytics/billing/route.js",
    "app/api/analytics/product-performance/route.js",
    "app/api/portal/auditoria/route.js",
    "app/api/portal/llamadas/route.js",
    "app/api/portal/contactos/route.js",
    "app/api/portal/eventos/route.js",
    "app/api/portal/contacto/route.js",
    "app/api/portal/inteligencia/route.js",
    "app/api/portal/access-center/route.js",
    "app/api/portal/enterprise/route.js",
    "app/api/stripe/checkout/route.js",
    "app/api/stripe/portal/route.js",
    "app/api/suscripcion/iniciar/route.js",
  ];
  for (const relativa of rutas) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /logErrorSeguro\(/, `${relativa}: falta redacción`);
    assert.doesNotMatch(fuente, /console\.error\(/, `${relativa}: error crudo`);
  }
});

test("Access Center y Enterprise son sólo de administración y no propagan hashes", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const access = fs.readFileSync(path.join(raiz, "app/api/portal/access-center/route.js"), "utf8");
  const enterprise = fs.readFileSync(path.join(raiz, "app/api/portal/enterprise/route.js"), "utf8");
  const builder = fs.readFileSync(path.join(raiz, "lib/server/portal-phase-three.js"), "utf8");

  assert.match(access, /puede\(ctx\.role, "users\.manage", ctx\.permissions\)/);
  assert.match(enterprise, /puede\(ctx\.role, "settings\.manage", ctx\.permissions\)/);
  assert.match(access, /hasPassword: Boolean\(user\.password \|\| user\.password_hash\)/);
  assert.doesNotMatch(enterprise, /\.select\("[^"]*(?:password|password_hash)/);
  assert.match(builder, /hasPassword: authUser\?\.hasPassword === true/);
  assert.doesNotMatch(builder, /authUser\?\.(?:password|password_hash)/);
  for (const fuente of [access, enterprise]) {
    assert.match(fuente, /"Cache-Control": "no-store"/);
  }
});

test("la gestión de usuarios limita y valida el cuerpo antes del RPC", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const fuente = fs.readFileSync(path.join(raiz, "lib/server/usuarios-portal.js"), "utf8");
  assert.match(fuente, /leerJsonLimitado\(req, \{ maxBytes: 8 \* 1024 \}\)/);
  assert.match(fuente, /validar\(ESQUEMA_POR_MODO\[mode\], cuerpo\.datos\)/);
  assert.match(fuente, /\.select\("id,email,full_name,role,phone,is_active"\)/);
  assert.match(fuente, /body = \{ \.\.\.target, \.\.\.body, email: target\.email \}/);
});

test("las pantallas de integración y permisos no son visibles para cualquier sesión", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const apiHub = fs.readFileSync(path.join(raiz, "app/api/portal/api-hub/route.js"), "utf8");
  const permisos = fs.readFileSync(path.join(raiz, "app/api/portal/permissions/route.js"), "utf8");
  assert.match(apiHub, /puede\(ctx\.role, "api\.manage", ctx\.permissions\)/);
  assert.match(permisos, /puede\(ctx\.role, "users\.manage", ctx\.permissions\)/);
  for (const fuente of [apiHub, permisos]) {
    assert.match(fuente, /"Cache-Control": "no-store"/);
  }
});

test("dominio, prueba de webhook y permisos limitan y validan el JSON", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/portal/domain/connect/route.js",
    "app/api/portal/webhook/test/route.js",
    "app/api/portal/permissions/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(/, `${relativa}: falta esquema`);
    assert.match(fuente, /requireRateLimitAsync\(req/, `${relativa}: falta rate limit`);
  }
});

test("una cuenta de sólo lectura no puede obtener una grabación firmada", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const fuente = fs.readFileSync(path.join(raiz, "app/api/portal/grabacion/route.js"), "utf8");
  assert.match(fuente, /puede\(ctx\.role, "crm\.edit", ctx\.permissions\)/);
  assert.match(fuente, /action: "recording_access"/);
  assert.match(fuente, /"Cache-Control": "no-store"/);
});

test("branding y ajustes tienen esquema, límite, rate limit y auditoría", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const casos = [
    ["app/api/portal/branding/update/route.js", "branding_updated"],
    ["app/api/portal/settings/update/route.js", "settings_updated"],
  ];
  for (const [relativa, accion] of casos) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /requireSameOrigin\(req\)/);
    assert.match(fuente, /requireRateLimitAsync\(req/);
    assert.match(fuente, /leerJsonLimitado\(req, \{ maxBytes: 16 \* 1024 \}\)/);
    assert.match(fuente, /validar\(/);
    assert.match(fuente, new RegExp(`action: "${accion}"`));
    assert.match(fuente, /if \(auditError\) throw/);
  }
});

test("las escrituras restantes de configuración acotan cuerpo y frecuencia", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/portal/agentes/route.js",
    "app/api/portal/automatismos/route.js",
    "app/api/portal/departamentos/route.js",
    "app/api/portal/destinatarios/route.js",
    "app/api/portal/ia/route.js",
    "app/api/portal/webhook/entregas/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /requireRateLimitAsync\(req/, `${relativa}: falta rate limit`);
    assert.match(fuente, /validar\(/, `${relativa}: falta esquema`);
  }
});

test("responder conversaciones valida, limita y no copia PII al audit log", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const fuente = fs.readFileSync(path.join(raiz, "app/api/portal/conversations/respond/route.js"), "utf8");
  assert.match(fuente, /leerJsonLimitado\(req, \{ maxBytes: 16 \* 1024 \}\)/);
  assert.match(fuente, /requireRateLimitAsync\(req/);
  assert.match(fuente, /validar\(ResponderConversacion, cuerpo\.datos\)/);
  assert.match(fuente, /conversation_lead_update_failed/);
  assert.match(fuente, /conversation_event_failed/);
  assert.match(fuente, /conversation_audit_failed/);
  const bloqueAuditoria = fuente.slice(fuente.indexOf("const referenciaEntrega"), fuente.indexOf("if (auditError)"));
  assert.doesNotMatch(bloqueAuditoria, /preview|\bto\b|message\.slice/);
  assert.match(fuente, /logErrorSeguro\("portal\.conversation_response_failed"/);
});

test("los mensajes salientes se reclaman antes del proveedor y un reintento no se reenvía", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const ruta = fs.readFileSync(path.join(raiz, "app/api/portal/conversations/respond/route.js"), "utf8");
  const migracion = fs.readFileSync(
    path.join(raiz, "supabase/migrations/20260920160735_mensajes_salientes_idempotentes.sql"),
    "utf8",
  );
  const reclamo = ruta.indexOf('.from("mensajes_salientes_idempotentes")');
  const proveedor = Math.min(
    ...[ruta.indexOf("await enviarSms"), ruta.indexOf("await enviarWhatsApp"), ruta.indexOf("await enviarCorreo")]
      .filter((indice) => indice >= 0),
  );
  assert.ok(reclamo >= 0 && reclamo < proveedor, "hay que reclamar antes de enviar");
  assert.match(ruta, /anterior\.status === "enviado"/);
  assert.match(ruta, /payload_hash/);
  assert.doesNotMatch(migracion, /^\s*(?:message|email|phone)\s+/gim);
  assert.match(migracion, /unique \(client_id, request_id\)/);
  assert.match(migracion, /force row level security/);
  assert.match(migracion, /revoke all on public\.mensajes_salientes_idempotentes from public, anon, authenticated/);
});

test("las rutas internas de acciones IA validan tamaño y forma", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/ai/next-best-action/save/route.js",
    "app/api/ai/next-step/next-best-action/save/route.js",
    "app/api/ai/next-step/next-best-action/llm/route.js",
    "app/api/automation/run-nba/execute-next-action/route.js",
    "app/api/automation/recalculate-next-actions/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(/, `${relativa}: falta esquema`);
    assert.doesNotMatch(fuente, /await req\.json\(/, `${relativa}: JSON sin límite`);
    assert.doesNotMatch(fuente, /console\.error\(/, `${relativa}: log crudo`);
  }
});

test("un admin interno no puede crear otro admin ni escalar a super_admin", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const fuente = fs.readFileSync(path.join(raiz, "app/api/admin/users/route.js"), "utf8");
  assert.match(fuente, /\["admin", "super_admin"\]\.includes\(role\) && admin\.role !== "super_admin"/);
  assert.match(fuente, /Sólo un superadministrador/);
});

test("fuera del sumidero estructurado ninguna API registra errores crudos", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const carpeta of ["app/api", "lib/server"]) {
    const rutas = fs.readdirSync(path.join(raiz, carpeta), { recursive: true })
      .filter((archivo) => /\.(?:js|mjs)$/.test(archivo));
    for (const relativa of rutas) {
      if (carpeta === "lib/server" && relativa === "observability.mjs") continue;
      const fuente = fs.readFileSync(path.join(raiz, carpeta, relativa), "utf8");
      assert.doesNotMatch(fuente, /console\.(?:error|warn|log)\(/, `${carpeta}/${relativa}: log crudo`);
    }
  }
});

test("la auditoría de routing guarda campos, no correos ni configuración libre", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const destinatarios = fs.readFileSync(path.join(raiz, "app/api/portal/destinatarios/route.js"), "utf8");
  const automatismos = fs.readFileSync(path.join(raiz, "app/api/portal/automatismos/route.js"), "utf8");
  assert.doesNotMatch(destinatarios, /destinatario_creado", \{ id: data\.id, email:/);
  assert.match(destinatarios, /fields: Object\.keys\(cambios\)\.sort\(\)/);
  assert.match(automatismos, /config_fields: Object\.keys\(cambios\.config \|\| \{\}\)\.sort\(\)/);
  assert.doesNotMatch(automatismos, /changes: cambios/);
});

test("Brand Lab e Integrations Center sólo muestran configuración a administradores", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const casos = [
    ["app/api/portal/brand-lab/route.js", "brand.manage"],
    ["app/api/portal/integrations-center/route.js", "api.manage"],
  ];
  for (const [relativa, permiso] of casos) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, new RegExp(`puede\\(ctx\\.role, "${permiso.replace(".", "\\.")}", ctx\\.permissions\\)`));
    assert.match(fuente, /"Cache-Control": "no-store"/);
    assert.match(fuente, /logErrorSeguro\(/);
  }
});

test("ninguna ruta del portal imprime errores crudos", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const portal = path.join(raiz, "app/api/portal");
  const rutas = fs.readdirSync(portal, { recursive: true })
    .filter((archivo) => archivo.endsWith("route.js"));
  for (const relativa of rutas) {
    const fuente = fs.readFileSync(path.join(portal, relativa), "utf8");
    assert.doesNotMatch(fuente, /console\.error\(/, `${relativa}: error crudo`);
  }
});

test("las escrituras administrativas de emergencia validan, limitan y registran sin cargas libres", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/admin/interruptores/route.js",
    "app/api/admin/desvio/route.js",
    "app/api/admin/cola/route.js",
    "app/api/admin/portal-users/update/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /requireSameOrigin\(req\)/, `${relativa}: falta CSRF`);
    assert.match(fuente, /requireRateLimitAsync\(req/, `${relativa}: falta rate limit`);
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(/, `${relativa}: falta esquema`);
    assert.doesNotMatch(fuente, /console\.error\(/, `${relativa}: error crudo`);
  }
  const interruptores = fs.readFileSync(path.join(raiz, "app/api/admin/interruptores/route.js"), "utf8");
  assert.doesNotMatch(interruptores, /changes: resultado/);
  const usuario = fs.readFileSync(path.join(raiz, "app/api/admin/portal-users/update/route.js"), "utf8");
  assert.match(usuario, /action: "admin_portal_user_updated"/);
  assert.match(usuario, /fields: Object\.keys\(cambios\)\.sort\(\)/);
});

test("las acciones de IA y WhatsApp del portal no aceptan JSON ilimitado", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/ai/next-step/route.js",
    "app/api/automation/execute-next-action/route.js",
    "app/api/automation/whatsapp-autopilot/route.js",
    "app/api/automation/whatsapp-autoreply/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /requireSameOrigin\(/, `${relativa}: falta CSRF`);
    assert.match(fuente, /requireRateLimitAsync\(req/, `${relativa}: falta rate limit`);
    assert.match(fuente, /leerJsonLimitado\(req/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(AccionSobreLead/, `${relativa}: falta esquema`);
    assert.match(fuente, /logErrorSeguro\(/, `${relativa}: falta log seguro`);
    assert.doesNotMatch(fuente, /console\.error\(/, `${relativa}: error crudo`);
  }
  const interno = fs.readFileSync(path.join(raiz, "app/api/automation/whatsapp-send/route.js"), "utf8");
  assert.match(interno, /requireInternalRequest\(req\)/);
  assert.match(interno, /leerJsonLimitado\(req/);
  assert.match(interno, /validar\(WhatsappInterno/);
});

test("TOTP cifra el secreto, evita reuso y se integra en login y recuperación", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const migracion = fs.readFileSync(path.join(raiz, "supabase/migrations/20260920135620_auth_totp_factores.sql"), "utf8");
  assert.match(migracion, /secret_ciphertext text not null/);
  assert.match(migracion, /last_used_step bigint not null default -1/);
  assert.match(migracion, /enable row level security/);
  assert.match(migracion, /force row level security/);
  assert.match(migracion, /revoke all on public\.auth_totp_factors from public, anon, authenticated/);

  const totp = fs.readFileSync(path.join(raiz, "lib/server/totp.js"), "utf8");
  assert.match(totp, /aes-256-gcm/);
  assert.match(totp, /NESPED_TOTP_ENCRYPTION_KEY/);
  assert.match(totp, /\.lt\("last_used_step", paso\)/);
  assert.doesNotMatch(totp, /NESPED_SESSION_SECRET|SUPABASE_SERVICE_ROLE_KEY/);

  const ruta = fs.readFileSync(path.join(raiz, "app/api/portal/totp/route.js"), "utf8");
  for (const patron of [/requireSameOrigin\(req\)/, /requireRateLimitAsync\(req/, /leerJsonLimitado\(req/, /validar\(GestionTotp/]) {
    assert.match(ruta, patron);
  }
  assert.match(ruta, /revocarSesionesDe\(ctx\.userEmail\)/);
  assert.match(ruta, /registrar\(ctx, "totp_enabled"\)/);
  assert.match(ruta, /registrar\(ctx, "totp_disabled"\)/);

  const login = fs.readFileSync(path.join(raiz, "app/api/login/route.js"), "utf8");
  const verificar = fs.readFileSync(path.join(raiz, "app/api/login/2fa/route.js"), "utf8");
  const reenviar = fs.readFileSync(path.join(raiz, "app/api/login/2fa/resend/route.js"), "utf8");
  assert.match(login, /estadoTotp\(/);
  assert.match(login, /verificationMethod: passkey \? "passkey" : "totp"/);
  assert.match(verificar, /verificarYConsumirTotp\(/);
  assert.match(reenviar, /challenge\.factorType === "totp"/);
});

test("el transporte SSRF de alertas sólo entra en el bundle Node", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const observabilidad = fs.readFileSync(path.join(raiz, "lib/server/observability.mjs"), "utf8");
  const ramaNode = observabilidad.match(
    /if \(process\.env\.NEXT_RUNTIME === "nodejs"\) \{([\s\S]*?)\n  \}/,
  )?.[1] || "";

  assert.match(ramaNode, /import\("@\/lib\/server\/url-segura"\)/);
  assert.doesNotMatch(observabilidad.slice(0, observabilidad.indexOf(ramaNode)), /url-segura/);
});

test("los secretos de proveedor sólo se aceptan en cabecera, nunca en la URL", () => {
  const anterior = process.env.ELEVENLABS_WEBHOOK_SECRET;
  process.env.ELEVENLABS_WEBHOOK_SECRET = "secreto-de-pruebas-suficientemente-largo";
  try {
    const url = "https://nesped.example/webhook?secret=secreto-de-pruebas-suficientemente-largo";
    assert.equal(isAuthorizedElevenLabsWebhook(new Request(url)), false);
    assert.equal(isAuthorizedElevenLabsWebhook(new Request(url, {
      headers: { "x-nesped-provider-secret": "secreto-de-pruebas-suficientemente-largo" },
    })), true);
  } finally {
    if (anterior === undefined) delete process.env.ELEVENLABS_WEBHOOK_SECRET;
    else process.env.ELEVENLABS_WEBHOOK_SECRET = anterior;
  }
});

test("CSP, cabeceras y CORS permanecen cerrados", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  const proxy = fs.readFileSync(path.join(raiz, "proxy.js"), "utf8");
  for (const cabecera of [
    "Content-Security-Policy", "Strict-Transport-Security", "X-Frame-Options",
    "X-Content-Type-Options", "Permissions-Policy", "Cross-Origin-Opener-Policy",
  ]) assert.match(proxy, new RegExp(cabecera));
  assert.match(proxy, /noIndexar[\s\S]*noindex, nofollow/);

  const fuentes = [proxy, ...fs.readdirSync(path.join(raiz, "app/api"), { recursive: true })
    .filter(file => file.endsWith("route.js"))
    .map(file => fs.readFileSync(path.join(raiz, "app/api", file), "utf8"))].join("\n");
  assert.doesNotMatch(fuentes, /Access-Control-Allow-Origin[^\n]*\*/i, "CORS no puede permitir cualquier origen");
});

test("las rutas caras tienen límite, esquema y cuerpo acotado", () => {
  const raiz = path.resolve(import.meta.dirname, "../..");
  for (const relativa of [
    "app/api/portal/copiloto/route.js",
    "app/api/portal/conversations/suggest/route.js",
    "app/api/portal/ia/previsualizar/route.js",
    "app/api/portal/contactos/clasificar/route.js",
  ]) {
    const fuente = fs.readFileSync(path.join(raiz, relativa), "utf8");
    assert.match(fuente, /requireRateLimitAsync\(/, `${relativa}: falta rate limit`);
    assert.match(fuente, /leerJsonLimitado\(/, `${relativa}: falta límite de cuerpo`);
    assert.match(fuente, /validar\(/, `${relativa}: falta esquema`);
  }
});
