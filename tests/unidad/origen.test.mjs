import { test } from "node:test";
import assert from "node:assert/strict";
import { isSameOriginRequest, allowedOrigins } from "@/lib/server/request-policy";

/**
 * El mismo origen. Lo que se rompió el 16 de septiembre de 2026: la lista
 * de orígenes salía sólo de variables de entorno, NEXT_PUBLIC_APP_URL decía
 * nesped.com, la gente entraba por www.nesped.com, y /api/login devolvía
 * 403 a todo el mundo. El host al que llega la petición vale como origen.
 */
const PROD = { NODE_ENV: "production", VERCEL: "1", NEXT_PUBLIC_APP_URL: "https://nesped.com" };
const peticion = (cabeceras) => ({ headers: new Headers(cabeceras) });

test("entrar por www cuando la variable dice sin www: se acepta", () => {
  const req = peticion({ origin: "https://www.nesped.com", "x-forwarded-host": "www.nesped.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginRequest(req, PROD), true);
});

test("la lista de variables sigue valiendo", () => {
  const req = peticion({ origin: "https://nesped.com", "x-forwarded-host": "www.nesped.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginRequest(req, PROD), true);
  assert.ok(allowedOrigins(PROD).has("https://nesped.com"));
});

test("un POST desde otra web trae su propio Origin y se rechaza", () => {
  const req = peticion({ origin: "https://evil.example", "x-forwarded-host": "www.nesped.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginRequest(req, PROD), false);
  const sinOrigen = peticion({ "x-forwarded-host": "www.nesped.com" });
  assert.equal(isSameOriginRequest(sinOrigen, PROD), false, "sin Origin ni Referer no hay forma de saber de dónde viene");
});

test("fuera de Vercel el host no se cree: la cabecera la pone quien llama", () => {
  const req = peticion({ origin: "https://www.nesped.com", "x-forwarded-host": "www.nesped.com", "x-forwarded-proto": "https" });
  assert.equal(isSameOriginRequest(req, { ...PROD, VERCEL: undefined }), false);
});

test("en producción el host propio sólo cuenta con https", () => {
  const req = peticion({ origin: "http://www.nesped.com", "x-forwarded-host": "www.nesped.com", "x-forwarded-proto": "http" });
  assert.equal(isSameOriginRequest(req, PROD), false);
});
