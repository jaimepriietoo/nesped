import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  crearSupabaseDeEmpresa,
  crearTokenRlsDeEmpresa,
  clienteDePortal,
  modoRlsPortal,
  PARA_PRUEBAS,
} from "../../lib/server/supabase-empresa.js";

const RAIZ = path.resolve(import.meta.dirname, "../..");
const SECRETO = "s".repeat(48);

function decodificar(parte) {
  return JSON.parse(Buffer.from(parte, "base64url").toString("utf8"));
}

test("el token RLS sólo puede adoptar nesped_app y una empresa", () => {
  const ahora = Date.UTC(2026, 8, 20, 12, 0, 0);
  const token = crearTokenRlsDeEmpresa("empresa-a", { secreto: SECRETO, ahora });
  const [cabecera, cuerpo, firma] = token.split(".");
  const claims = decodificar(cuerpo);

  assert.deepEqual(decodificar(cabecera), { alg: "HS256", typ: "JWT" });
  assert.equal(claims.role, "nesped_app");
  assert.equal(claims.client_id, "empresa-a");
  assert.equal(claims.exp - claims.iat, PARA_PRUEBAS.DURACION_TOKEN_SEGUNDOS);
  assert.equal(
    firma,
    crypto.createHmac("sha256", SECRETO).update(`${cabecera}.${cuerpo}`).digest("base64url"),
  );
  assert.throws(() => crearTokenRlsDeEmpresa("empresa con espacios", { secreto: SECRETO }), /empresa/i);
});

test("el modo obligatorio falla cerrado si falta la clave RLS", () => {
  assert.equal(modoRlsPortal({}), "preparar");
  assert.throws(
    () => clienteDePortal({
      clientId: "empresa-a",
      clienteAnterior: { privilegiado: true },
      env: {
        NESPED_RLS_PORTAL: "obligatorio",
        SUPABASE_URL: "https://proyecto.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
      },
    }),
    /SUPABASE_JWT_SECRET/,
  );
  assert.throws(() => modoRlsPortal({ NESPED_RLS_PORTAL: "tal-vez" }), /debe ser/i);
});

test("una consulta sin filtro viaja con el JWT de una sola empresa", async () => {
  let peticion = null;
  const cliente = crearSupabaseDeEmpresa("empresa-a", {
    SUPABASE_URL: "https://proyecto.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    SUPABASE_JWT_SECRET: SECRETO,
  }, {
    fetch: async (url, opciones) => {
      peticion = { url: String(url), headers: new Headers(opciones.headers) };
      return new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json", "Content-Range": "0-0/0" },
      });
    },
  });

  const { error } = await cliente.from("leads").select("id,client_id");
  assert.equal(error, null);
  assert.ok(peticion, "la consulta llegó al transporte");
  assert.doesNotMatch(peticion.url, /client_id=eq/, "la prueba omite el filtro a propósito");

  const bearer = peticion.headers.get("authorization");
  assert.match(bearer, /^Bearer /);
  const claims = decodificar(bearer.slice(7).split(".")[1]);
  assert.equal(claims.role, "nesped_app");
  assert.equal(claims.client_id, "empresa-a");
});

test("las migraciones crean mínimo privilegio, contexto transaccional y FORCE RLS", () => {
  const preparar = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/20260920183000_preparar_rls_por_empresa.sql"),
    "utf8",
  ).toLowerCase();
  const forzar = fs.readFileSync(
    path.join(RAIZ, "supabase/migrations/20260920183100_forzar_rls_por_empresa.sql"),
    "utf8",
  ).toLowerCase();

  assert.match(preparar, /create role nesped_app[\s\S]*nologin[\s\S]*nobypassrls/);
  assert.match(preparar, /set_config\('app\.client_id', v_empresa, true\)/);
  assert.match(preparar, /current_setting\(''app\.client_id'', true\)/);
  assert.match(preparar, /as permissive for all to nesped_app/);
  assert.match(preparar, /grant nesped_app to authenticator/);
  assert.match(preparar, /revoke all privileges on all tables in schema %i from nesped_app/);
  assert.doesNotMatch(preparar, /grant[^;]+(?:auth\.|storage\.|supabase_migrations\.)/);
  assert.match(preparar, /create policy nesped_catalogo_lectura/);
  assert.match(forzar, /alter table public\.%i force row level security/);
});
