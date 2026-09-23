import crypto from "node:crypto";
import net from "node:net";
import { headers } from "next/headers";
import { getSupabaseAdministrativo } from "@/lib/supabase";
import { logErrorSeguro } from "@/lib/server/observability.mjs";

/**
 * Sesiones con huella e inactividad.
 *
 * El token firmado sigue siendo lo que abre la puerta; esto añade tres cosas:
 *
 *  - Una fila por sesión en `sesiones_activas`, para poder verlas y cerrar
 *    una sola. El token lleva su id (`sid`).
 *  - Una huella del navegador dentro del token: el hash del User-Agent, y
 *    para owner y admin también el del prefijo de IP. Un token robado y usado
 *    desde otro sitio no vale.
 *  - Inactividad: una sesión privilegiada que lleve más de quince minutos
 *    sin usarse se cierra sola. Las demás caducan a los siete días.
 */

const INACTIVIDAD_ADMIN_MS = 15 * 60 * 1000;
const RETOQUE_MINIMO_MS = 60 * 1000;
const ROLES_ESTRICTOS = new Set(["owner", "admin", "super_admin"]);

function hash(valor) {
  return crypto.createHash("sha256").update(String(valor || ""), "utf8").digest("hex").slice(0, 32);
}

/** /24 para IPv4, /48 para IPv6: lo que cambia entre wifi y datos no rompe. */
export function prefijoDeIp(ip = "") {
  const texto = String(ip || "").trim();
  if (net.isIPv4(texto)) return texto.split(".").slice(0, 3).join(".") + ".0/24";
  if (net.isIPv6(texto)) return texto.split(":").slice(0, 3).join(":") + "::/48";
  return "";
}

/** El nombre corto del navegador, para que la persona reconozca la sesión. */
export function nombreDeNavegador(userAgent = "") {
  const ua = String(userAgent || "");
  const so = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /Linux/.test(ua) ? "Linux" : "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : ua ? "Navegador" : "Desconocido";
  return so ? `${nav} en ${so}` : nav;
}

export function huellaDe({ userAgent = "", ip = "" } = {}) {
  return { ua: hash(userAgent), ip: hash(prefijoDeIp(ip)), navegador: nombreDeNavegador(userAgent), ipPrefijo: prefijoDeIp(ip) };
}

/** La huella de la petición en curso, leída de las cabeceras que pone Vercel. */
export async function huellaDePeticion() {
  const h = await headers();
  const ip = process.env.VERCEL === "1"
    ? (h.get("x-vercel-forwarded-for") || h.get("x-forwarded-for") || "").split(",")[0].trim()
    : "";
  return huellaDe({ userAgent: h.get("user-agent") || "", ip });
}

export function rolEstricto(role = "") {
  return ROLES_ESTRICTOS.has(String(role || "").toLowerCase());
}

/**
 * ¿Coincide la huella del token con la de la petición? El User-Agent se
 * exige siempre; la IP sólo a owner y admin, que son a quienes más les
 * duele un robo y menos se mueven entre redes mientras trabajan.
 */
export function huellaCoincide({ token, actual, role }) {
  if (!token?.ua || token.ua !== actual.ua) return false;
  if (rolEstricto(role) && token.ip !== actual.ip) return false;
  return true;
}

export async function abrirSesion({ email, clientId, huella }) {
  const supabase = getSupabaseAdministrativo();
  const { data, error } = await supabase.from("sesiones_activas")
    .insert({ client_id: clientId, email, navegador: huella.navegador, ip_prefijo: huella.ipPrefijo })
    .select("id").single();
  if (error || !data?.id) throw new Error("No se pudo abrir la sesión");
  return data.id;
}

/**
 * Comprueba la fila de la sesión y la retoca. Devuelve null si vale, o el
 * motivo si no. Nunca lanza. Un fallo de la base deja continuar a los roles
 * operativos para no tumbar el servicio, pero falla cerrado para owner,
 * admin y super_admin, cuyas sesiones dan acceso a cambios críticos.
 */
export async function comprobarSesion(
  { sid, email, clientId, role, ahora = Date.now() },
  { supabase = null } = {},
) {
  if (!sid) return "Tu sesión es de antes del cambio. Vuelve a entrar.";
  supabase ||= getSupabaseAdministrativo();
  const { data, error } = await supabase.from("sesiones_activas")
    .select("id,last_seen_at,revoked_at")
    .eq("id", sid).eq("email", email).eq("client_id", clientId).maybeSingle();
  if (error) {
    logErrorSeguro("sesiones.lectura_fallida", error);
    if (rolEstricto(role)) {
      return "No se pudo comprobar la seguridad de tu sesión. Vuelve a entrar.";
    }
    return null;
  }
  if (!data || data.revoked_at) return "Esta sesión se ha cerrado. Vuelve a entrar.";

  const ultima = Date.parse(data.last_seen_at) || 0;
  if (rolEstricto(role) && ahora - ultima > INACTIVIDAD_ADMIN_MS) {
    await supabase.from("sesiones_activas").update({ revoked_at: new Date(ahora).toISOString() }).eq("id", sid);
    return "Sesión cerrada por inactividad. Vuelve a entrar.";
  }
  if (ahora - ultima > RETOQUE_MINIMO_MS) {
    const { error: errorRetoque } = await supabase.from("sesiones_activas")
      .update({ last_seen_at: new Date(ahora).toISOString() }).eq("id", sid);
    if (errorRetoque) logErrorSeguro("sesiones.retoque_fallido", errorRetoque);
  }
  return null;
}

export async function cerrarSesion({ sid, email, clientId }) {
  const supabase = getSupabaseAdministrativo();
  const { data, error } = await supabase.from("sesiones_activas")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", sid).eq("email", email).eq("client_id", clientId).is("revoked_at", null)
    .select("id");
  if (error) throw new Error("No se pudo cerrar la sesión");
  return (data || []).length === 1;
}

export async function cerrarTodasLasSesiones({ email, clientId }) {
  const supabase = getSupabaseAdministrativo();
  const { error } = await supabase.from("sesiones_activas")
    .update({ revoked_at: new Date().toISOString() })
    .eq("email", email).eq("client_id", clientId).is("revoked_at", null);
  if (error) throw new Error("No se pudieron cerrar las sesiones");
}

export async function listarSesiones({ email, clientId, sidActual }) {
  const supabase = getSupabaseAdministrativo();
  const { data, error } = await supabase.from("sesiones_activas")
    .select("id,navegador,ip_prefijo,created_at,last_seen_at")
    .eq("email", email).eq("client_id", clientId).is("revoked_at", null)
    .order("last_seen_at", { ascending: false }).limit(50);
  if (error) throw new Error("No se pudieron leer las sesiones");
  return (data || []).map((s) => ({ ...s, actual: s.id === sidActual }));
}

export const PARA_PRUEBAS = { INACTIVIDAD_ADMIN_MS, RETOQUE_MINIMO_MS };
