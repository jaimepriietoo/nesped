import crypto from "crypto";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { findUserByEmailAndClient } from "@/lib/auth";

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
  return (
    process.env.NESPED_SESSION_SECRET ||
    process.env.INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "nesped-dev-secret"
  );
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

function safeEqual(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function hashOtpCode(value = "") {
  return crypto
    .createHash("sha256")
    .update(String(value || ""))
    .digest("hex");
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

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, storedValue) {
  if (!storedValue) return false;

  if (!String(storedValue).startsWith("scrypt$")) {
    return String(password) === String(storedValue);
  }

  const [, salt, hash] = String(storedValue).split("$");
  if (!salt || !hash) return false;

  const candidate = crypto.scryptSync(password, salt, 64).toString("hex");
  return safeEqual(candidate, hash);
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
  if (!token || !String(token).includes(".")) return null;

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

    if (!issuedAt || Number.isNaN(issuedAt)) {
      return null;
    }

    if (issuedAt > now + SESSION_CLOCK_SKEW_MS) {
      return null;
    }

    const effectiveExpiry =
      expiresAt && !Number.isNaN(expiresAt)
        ? expiresAt
        : issuedAt + SESSION_MAX_AGE_MS;

    if (effectiveExpiry <= now) {
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

export function generateTwoFactorCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function setTwoFactorChallenge({
  email,
  clientId,
  role,
  clientName = "",
  nextPath = "/portal",
  code,
  codeHash = "",
  deliveryChannel = "email",
  attempts = 0,
  sessionEpoch = 0,
}) {
  const cookieStore = await cookies();
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
    codeHash: codeHash || hashOtpCode(code),
    attempts,
    issuedAt: Date.now(),
    expiresAt: Date.now() + TWO_FACTOR_MAX_AGE_MS,
  };

  cookieStore.set(
    TWO_FACTOR_COOKIE,
    createSessionToken(payload),
    getCookieOptions(TWO_FACTOR_MAX_AGE)
  );

  return payload;
}

export async function getTwoFactorChallenge() {
  const cookieStore = await cookies();
  const token = cookieStore.get(TWO_FACTOR_COOKIE)?.value || "";
  const payload = readSessionToken(token);

  if (!payload?.email || !payload?.clientId || !payload?.codeHash) {
    return null;
  }

  if ((payload.attempts || 0) >= TWO_FACTOR_MAX_ATTEMPTS) {
    return null;
  }

  return payload;
}

export async function clearTwoFactorChallenge() {
  const cookieStore = await cookies();
  cookieStore.set(TWO_FACTOR_COOKIE, "", getCookieOptions(0));
}

export async function bumpTwoFactorChallengeAttempts(challenge) {
  if (!challenge?.email || !challenge?.clientId) {
    return null;
  }

  return setTwoFactorChallenge({
    email: challenge.email,
    clientId: challenge.clientId,
    role: challenge.role,
    clientName: challenge.clientName,
    nextPath: challenge.nextPath || "/portal",
    codeHash: challenge.codeHash,
    deliveryChannel: challenge.deliveryChannel || "email",
    attempts: Number(challenge.attempts || 0) + 1,
  });
}

export function verifyTwoFactorCode(challenge, code) {
  if (!challenge?.codeHash || !code) return false;
  return safeEqual(hashOtpCode(code), challenge.codeHash);
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

  const { data, error } = await supabase
    .from("users")
    .select("session_epoch")
    .eq("email", normalizado)
    .maybeSingle();

  if (error || !data) return { ok: false };

  const siguiente = Number(data.session_epoch || 0) + 1;
  const { error: fallo } = await supabase
    .from("users")
    .update({ session_epoch: siguiente })
    .eq("email", normalizado);

  return { ok: !fallo, epoch: siguiente };
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
    const legacyUser = findUserByEmailAndClient(email, session.clientId);

    if (!legacyUser) {
      return { ok: false, message: "Sesión inválida" };
    }

    return {
      ok: true,
      session,
      supabase,
      user: {
        id: `legacy:${legacyUser.email}`,
        email,
        role: legacyUser.role || "viewer",
        client_id: legacyUser.clientId || session.clientId,
        created_at: null,
      },
    };
  }

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

  const { data: portalUser } = await ctx.supabase
    .from("portal_users")
    .select("*")
    .eq("client_id", ctx.user.client_id)
    .eq("email", ctx.user.email)
    .maybeSingle();

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

  return {
    ok: true,
    clientId: ctx.user.client_id,
    userEmail: ctx.user.email,
    role: currentUser.role || "viewer",
    currentUser,
    supabase: ctx.supabase,
  };
}
