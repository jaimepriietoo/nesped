import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { hashPassword, verifyPassword, sessionSecret, hashOtpCode, challengeKey, generateTwoFactorCode } from "../../lib/server/auth-crypto.js";
import { allowedOrigins, isSameOriginRequest, getRequestIp } from "../../lib/server/request-policy.js";
import { comprobarUrlExterna, peticionExternaSegura } from "../../lib/server/url-segura.js";
import { redactData, redactText } from "../../lib/server/redaction.mjs";
import { GET as oldSetupGet, POST as oldSetupPost } from "../../app/api/portal/account/setup/route.js";

test("las contraseñas sólo admiten scrypt y usan una sal distinta", () => {
  const password = "Una-clave-larga-de-pruebas!";
  const hash = hashPassword(password);
  assert.notEqual(hashPassword(password), hash);
  assert.equal(verifyPassword(password, hash), true);
  for (const stored of [password, "", "scrypt$malformado", "!activation-required"]) assert.equal(verifyPassword(password, stored), false);
  assert.equal(verifyPassword("otra", hash), false);
  assert.equal(verifyPassword("x".repeat(201), hash), false);
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
test("la IP no confía en cabeceras de Cloudflare ni en proxies sin configurar", () => {
  const req = request({ "cf-connecting-ip": "1.1.1.1", "x-forwarded-for": "8.8.8.8" });
  assert.equal(getRequestIp(req, {}), "unknown");
  assert.equal(getRequestIp(req, { VERCEL: "1" }), "8.8.8.8");
  assert.equal(getRequestIp(request({ "x-forwarded-for": "1.1.1.1, 8.8.8.8" }), { VERCEL: "1" }), "unknown");
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
