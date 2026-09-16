import crypto from "crypto";
import { datosDeLaEmpresa } from "@/lib/server/datos-cliente";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { sessionSecret, safeEqual, hashOtpCode, challengeKey } from "@/lib/server/auth-crypto";
export { hashPassword, verifyPassword, generateTwoFactorCode } from "@/lib/server/auth-crypto";

const SESSION_COOKIE = "nesped_session";
const TWO_FACTOR_COOKIE = "nesped_login_challenge";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE * 1000;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;
const TWO_FACTOR_MAX_AGE = 60 * 10;
const TWO_FACTOR_MAX_AGE_MS = TWO_FACTOR_MAX_AGE * 1000;
const TWO_FACTOR_MAX_ATTEMPTS = 5;
/*
 * Quién entra en la administración de Nesped.
 *
 * "owner" estaba aquí y era un agujero grave: en la tabla `users`, cada
 * cliente que da de alta su empresa se guarda como owner de ELLA. No de
 * Nesped. Así que el dueño de cualquier empresa cliente pasaba este filtro y
 * podía abrir /admin y ver la lista completa de clientes, sus usuarios, sus
 * llamadas y el panel de dirección.
 *
 * Las dos cosas se llaman igual y significan lo contrario, que es exactamente
 * como se cuelan estos fallos. Dentro de su empresa el rol sigue viviendo en
 * `portal_users.role`, que es otra tabla y no la toca esto.
 *
 * Aquí sólo entra quien trabaja en Nesped.
 */
const ADMIN_ROLES = new Set(["admin", "super_admin"]);

function isSecureCookie() {
  return process.env.NODE_ENV === "production";
}

function getSessionSecret() {
  return sessionSecret();
}

function hasDedicatedSessionSecret() {
  return Boolean(process.env.NESPED_SESSION_SECRET);
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payload) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

/**
 * Deja pasar sólo rutas internas.
 *
 * Se usa para el parámetro `next` del login, así que un fallo aquí es una
 * redirección abierta: alguien manda un enlace a nesped.com que, tras
 * iniciar sesión de verdad, deposita al usuario en una copia del sitio que
 * le pide otra vez la contraseña.
 *
 * La versión anterior sólo miraba que empezase por "/" y no por "//". No
 * bastaba: el navegador convierte la barra invertida en barra, así que
 * "/\\evil.com" pasaba el filtro y terminaba en https://evil.com. Además
 * los tabuladores y saltos de línea se eliminan al resolver la URL, con lo
 * que "/\tevil" tampoco era lo que parecía.
 *
 * Ahora se resuelve la ruta como lo haría el navegador y se comprueba que
 * el origen siga siendo el nuestro.
 */
export function sanitizeNextPath(value = "") {
  const bruto = String(value ?? "");

  // El navegador ignora estos caracteres al resolver la URL, así que se
  // quitan antes de decidir: si no, se validaría algo distinto de lo que
  // acabaría navegando.
  const limpio = bruto.replace(/[\u0000-\u001f\u007f\s]/g, "");

  if (!limpio.startsWith("/")) return "/portal";

  try {
    // El origen es ficticio a propósito: sólo interesa saber si la ruta
    // escapa de él. Si lo hace, `resuelta.origin` será otro.
    const base = "https://nesped.invalid";
    const resuelta = new URL(limpio, base);
    if (resuelta.origin !== base) return "/portal";
    return `${resuelta.pathname}${resuelta.search}${resuelta.hash}`;
  } catch {
    return "/portal";
  }
}

export function isPasswordHashed(value) {
  return String(value || "").startsWith("scrypt$");
}

function createSessionToken(payload) {
  const body = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(body);
  return `${body}.${signature}`;
}

function readSessionToken(token) {
  if (!token || String(token).split(".").length !== 2) return null;

  const [body, signature] = String(token).split(".");
  const expected = signPayload(body);

  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(body));
    const issuedAt = Number(payload?.issuedAt || 0);
    const expiresAt = Number(payload?.expiresAt || 0);
    const now = Date.now();

    if (!issuedAt || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
      return null;
    }

    if (issuedAt > now + SESSION_CLOCK_SKEW_MS) {
      return null;
    }

    const effectiveExpiry =
      expiresAt && !Number.isNaN(expiresAt)
        ? expiresAt
        : issuedAt + SESSION_MAX_AGE_MS;

    if (effectiveExpiry <= now || expiresAt > issuedAt + SESSION_MAX_AGE_MS || payload.purpose !== "session") {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function getCookieOptions(maxAge = SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: isSecureCookie(),
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function requiresTwoFactor(role = "") {
  return ["owner", "admin", "super_admin"].includes(
    String(role || "").toLowerCase()
  );
}

export async function setTwoFactorChallenge({
  email,
  clientId,
  role,
  clientName = "",
  nextPath = "/portal",
  code,
  deliveryChannel = "email",
  sessionEpoch = 0,
}) {
  const cookieStore = await cookies();
  const token = crypto.randomBytes(32).toString("base64url");
  const id = challengeKey(token);
  await clearTwoFactorChallenge();
  const payload = {
    email: normalizeEmail(email),
    clientId,
    role,
    clientName,
    // Se arrastra hasta la verificación: si entre el primer paso y el código
    // alguien revoca las sesiones, el token que se emita ya no valdrá.
    sessionEpoch: Number(sessionEpoch) || 0,
    nextPath: sanitizeNextPath(nextPath),
    deliveryChannel,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TWO_FACTOR_MAX_AGE_MS,
  };

  const { error } = await getSupabase().from("auth_challenges").insert({
    id, email: payload.email, client_id: clientId, payload,
    code_hash: hashOtpCode(code, id), expires_at: new Date(payload.expiresAt).toISOString(),
  });
  if (error) throw new Error("No se pudo crear la verificación");

  cookieStore.set(
    TWO_FACTOR_COOKIE,
    token,
    getCookieOptions(TWO_FACTOR_MAX_AGE)
  );

  return payload;
}

export async function getTwoFactorChallenge() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWO_FACTOR_COOKIE)?.value || "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const { data, error } = await getSupabase().from("auth_challenges")
    .select("id,payload,attempts").eq("id", challengeKey(token))
    .is("consumed_at", null).gt("expires_at", new Date().toISOString())
    .lt("attempts", TWO_FACTOR_MAX_ATTEMPTS).maybeSingle();
  if (error || !data) return null;
  return { ...data.payload, id: data.id, attempts: data.attempts };
}

export async function clearTwoFactorChallenge() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWO_FACTOR_COOKIE)?.value || "";
  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    const { error } = await getSupabase().from("auth_challenges")
      .update({ consumed_at: new Date().toISOString() }).eq("id", challengeKey(token));
    if (error) throw new Error("No se pudo cerrar la verificación");
  }
  cookieStore.set(TWO_FACTOR_COOKIE, "", getCookieOptions(0));
}

export async function tomarIntentoTwoFactor(challenge) {
  const { data, error } = await getSupabase().rpc("tomar_intento_auth", { p_id: challenge.id });
  if (error) throw new Error("No se pudo verificar el acceso");
  return data;
}

export function verifyTwoFactorCode(attempt, code) {
  return /^[0-9]{6}$/.test(code) && safeEqual(hashOtpCode(code, attempt.id), attempt.code_hash);
}

export async function consumirTwoFactor(challenge) {
  const { data, error } = await getSupabase().from("auth_challenges")
    .update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id)
    .is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("id");
  if (error) throw new Error("No se pudo completar el acceso");
  return data?.length === 1;
}

export function getTwoFactorSecurityProfile() {
  return {
    requiredRoles: ["owner", "admin", "super_admin"],
    challengeCookie: TWO_FACTOR_COOKIE,
    maxAgeSeconds: TWO_FACTOR_MAX_AGE,
    maxAgeMinutes: Math.round(TWO_FACTOR_MAX_AGE / 60),
    maxAttempts: TWO_FACTOR_MAX_ATTEMPTS,
    delivery: process.env.RESEND_API_KEY ? "email" : "not_configured",
  };
}

export async function setAuthCookies({
  email,
  clientId,
  role,
  clientName = "",
  sessionEpoch = 0,
}) {
  const cookieStore = await cookies();
  const normalizedEmail = normalizeEmail(email);
  /*
   * `epoch` es la generación de sesión del usuario. Va firmada dentro del
   * token y se compara con la de su fila en cada petición: subir ese número
   * echa a todos los navegadores a la vez. Sin esto, una sesión robada valía
   * siete días y no había forma de matarla, ni siquiera cambiando la clave.
   */
  const payload = {
    email: normalizedEmail,
    purpose: "session",
    clientId,
    role,
    epoch: Number(sessionEpoch) || 0,
    issuedAt: Date.now(),
    expiresAt: Date.now() + SESSION_MAX_AGE_MS,
  };

  const token = createSessionToken(payload);
  const options = getCookieOptions();

  cookieStore.set(SESSION_COOKIE, token, options);
  cookieStore.set("nesped_auth", "ok", options);
  cookieStore.set("nesped_client_id", clientId, options);
  cookieStore.set("nesped_client_name", clientName || clientId, options);
  cookieStore.set("nesped_role", role || "viewer", options);
  cookieStore.set("nesped_user_email", normalizedEmail, options);
}

export async function clearAuthCookies() {
  await clearTwoFactorChallenge();
  const cookieStore = await cookies();
  const options = getCookieOptions(0);

  [
    SESSION_COOKIE,
    "nesped_auth",
    "nesped_client_id",
    "nesped_client_name",
    "nesped_role",
    "nesped_user_email",
    TWO_FACTOR_COOKIE,
  ].forEach((name) => {
    cookieStore.set(name, "", options);
  });
}

/**
 * Invalida todas las sesiones abiertas de una cuenta.
 *
 * Se llama al cambiar la contraseña —que es lo primero que hace alguien que
 * sospecha que le han entrado— y desde el botón del portal. Sin esto, cambiar
 * la clave no echaba al intruso: su sesión seguía siendo válida.
 */
export async function revocarSesionesDe(email) {
  const supabase = getSupabase();
  const normalizado = normalizeEmail(email);
  if (!normalizado) return { ok: false };

  const { data, error } = await supabase.rpc("revocar_sesiones_usuario", { p_email: normalizado });
  return { ok: !error && data !== null, epoch: data };
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || "";
  return readSessionToken(token);
}

export function getSessionSecurityProfile() {
  return {
    cookieName: SESSION_COOKIE,
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    secureCookie: isSecureCookie(),
    maxAgeSeconds: SESSION_MAX_AGE,
    maxAgeDays: Math.round((SESSION_MAX_AGE / 60 / 60 / 24) * 10) / 10,
    secretConfigured: hasDedicatedSessionSecret(),
    twoFactor: getTwoFactorSecurityProfile(),
  };
}

export async function getAuthenticatedUserContext() {
  const session = await getSessionFromCookies();
  if (!session?.email || !session?.clientId) {
    return { ok: false, message: "No autorizado" };
  }

  const supabase = getSupabase();
  const email = normalizeEmail(session.email);

  const { data: user, error } = await supabase
    .from("users")
    .select("id,email,role,client_id,created_at,session_epoch")
    .eq("email", email)
    .eq("client_id", session.clientId)
    .maybeSingle();

  if (error || !user) {
    return { ok: false, message: "Sesión inválida" };
  }

  const { data: profile, error: profileError } = await supabase.from("portal_users")
    .select("id,email,full_name,role,is_active,phone,avatar_url,created_at,permissions")
    .eq("client_id", session.clientId).eq("email", email).maybeSingle();
  if (profileError || !profile || profile.is_active !== true) return { ok: false, message: "Sesión inválida" };
  const { data: client, error: clientError } = await supabase.from("clients")
    .select("is_active").eq("id", session.clientId).maybeSingle();
  if (clientError || !client || client.is_active === false) return { ok: false, message: "Sesión inválida" };

  /*
   * Generación de sesión. Si la del token no coincide con la de la fila, es
   * que alguien ha revocado las sesiones —o ha cambiado la contraseña— desde
   * que se emitió, así que esta deja de valer aunque no haya caducado.
   */
  if (Number(session.epoch || 0) !== Number(user.session_epoch || 0)) {
    return { ok: false, message: "Tu sesión ha caducado. Vuelve a entrar." };
  }

  return {
    ok: true,
    session,
    supabase,
    profile,
    user: {
      ...user,
      email,
      role: user.role || "viewer",
      client_id: user.client_id || session.clientId,
    },
  };
}

export async function getAdminContext() {
  const ctx = await getAuthenticatedUserContext();
  if (!ctx.ok) return ctx;

  if (!ADMIN_ROLES.has(String(ctx.user.role || "").toLowerCase())) {
    return { ok: false, message: "Sin permisos de administrador", status: 403 };
  }

  return {
    ok: true,
    supabase: ctx.supabase,
    currentUser: ctx.user,
    clientId: ctx.user.client_id,
    role: ctx.user.role,
    userEmail: ctx.user.email,
  };
}

export async function getPortalSessionContext() {
  const ctx = await getAuthenticatedUserContext();
  if (!ctx.ok) return ctx;

  // Leídos del perfil en cada petición, nunca del cuerpo ni de la cookie.
  // Se mantienen fuera de currentUser para conservar la respuesta pública.
  const { permissions, ...portalUser } = ctx.profile;

  const currentUser = portalUser
    ? {
        ...portalUser,
        full_name: portalUser.full_name || ctx.user.email,
      }
    : {
        id: ctx.user.id,
        email: ctx.user.email,
        full_name: ctx.user.email,
        role: ctx.user.role || "viewer",
      };

  /* El cliente de base de datos del portal sale ya acotado a la empresa de
     la sesión: toda consulta a una tabla de empresa lleva su filtro puesto y
     toda escritura lleva su client_id, sin que la ruta tenga que acordarse.
     Es lo que convierte el aislamiento entre empresas de disciplina en
     construcción. Las rutas siguen escribiendo `ctx.supabase.from(...)` como
     siempre; lo que cambia es que ya no pueden olvidarse.

     La vía de escape, para lo que legítimamente cruza empresas, es
     `ctx.supabase.sinFiltroDeEmpresa`, con ese nombre para que se vea. */
  const supabase = datosDeLaEmpresa(ctx.supabase, ctx.user.client_id);

  return {
    ok: true,
    clientId: ctx.user.client_id,
    userEmail: ctx.user.email,
    role: currentUser.role || "viewer",
    permissions,
    currentUser,
    supabase,
    datos: supabase,
  };
}
