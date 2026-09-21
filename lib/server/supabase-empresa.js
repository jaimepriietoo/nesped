import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { envolverConCifrado } from "@/lib/server/cifrado-datos";

const DURACION_TOKEN_SEGUNDOS = 5 * 60;
const MODOS_VALIDOS = new Set(["preparar", "obligatorio", "desactivado"]);

function base64Url(valor) {
  return Buffer.from(valor).toString("base64url");
}

/**
 * Emite el JWT corto que hace que PostgREST adopte `nesped_app`.
 *
 * No se acepta el rol como argumento. Si un futuro cambio pudiera pedir
 * `service_role` aquí, la capa de mínimo privilegio se convertiría en una vía
 * para saltársela.
 */
export function crearTokenRlsDeEmpresa(clientId, {
  secreto = process.env.SUPABASE_JWT_SECRET,
  ahora = Date.now(),
} = {}) {
  const empresa = String(clientId || "").trim();
  if (!empresa || empresa.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(empresa)) {
    throw new Error("La empresa del contexto RLS no es válida");
  }
  if (!secreto || String(secreto).length < 32) {
    throw new Error("Falta SUPABASE_JWT_SECRET para activar el RLS del portal");
  }

  const emitido = Math.floor(Number(ahora) / 1000);
  const cabecera = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const cuerpo = base64Url(JSON.stringify({
    role: "nesped_app",
    client_id: empresa,
    iat: emitido,
    exp: emitido + DURACION_TOKEN_SEGUNDOS,
    aud: "authenticated",
  }));
  const firma = crypto
    .createHmac("sha256", String(secreto))
    .update(`${cabecera}.${cuerpo}`)
    .digest("base64url");
  return `${cabecera}.${cuerpo}.${firma}`;
}

export function modoRlsPortal(env = process.env) {
  const modo = String(env.NESPED_RLS_PORTAL || "preparar").trim().toLowerCase();
  if (!MODOS_VALIDOS.has(modo)) {
    throw new Error("NESPED_RLS_PORTAL debe ser preparar, obligatorio o desactivado");
  }
  return modo;
}

/**
 * Cliente PostgREST de una sola empresa.
 *
 * PostgREST abre una transacción por operación. Su pre-request hook fija
 * `app.client_id` dentro de ESA transacción antes de evaluar RLS; de este modo
 * no dependemos de estado de sesión que el pool transaccional podría perder.
 */
export function crearSupabaseDeEmpresa(clientId, env = process.env, { fetch: fetchPersonalizado } = {}) {
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = env.SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !apiKey) {
    throw new Error("Faltan SUPABASE_URL y SUPABASE_PUBLISHABLE_KEY para el RLS del portal");
  }

  const token = crearTokenRlsDeEmpresa(clientId, { secreto: env.SUPABASE_JWT_SECRET });
  return envolverConCifrado(createClient(url, apiKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(fetchPersonalizado ? { global: { fetch: fetchPersonalizado } } : {}),
  }), { env });
}

/**
 * Activa el cliente de mínimo privilegio sólo al pasar el despliegue a modo
 * obligatorio. `preparar` permite publicar código y migraciones sin corte;
 * `desactivado` es la palanca de rollback documentada.
 */
export function clienteDePortal({ clientId, clienteAnterior, env = process.env }) {
  const modo = modoRlsPortal(env);
  if (modo !== "obligatorio") {
    return { cliente: clienteAnterior, rlsActivo: false, modo };
  }
  return {
    cliente: crearSupabaseDeEmpresa(clientId, env),
    rlsActivo: true,
    modo,
  };
}

export const PARA_PRUEBAS = { DURACION_TOKEN_SEGUNDOS };
