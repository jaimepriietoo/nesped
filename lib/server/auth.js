import crypto from "crypto";
import { cookies } from "next/headers";
import { getSupabase } from "@/lib/supabase";
import { findUserByEmailAndClient } from "@/lib/auth";

const SESSION_COOKIE = "nesped_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;
const SESSION_MAX_AGE_MS = SESSION_MAX_AGE * 1000;
const SESSION_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ADMIN_ROLES = new Set(["admin", "owner", "super_admin"]);

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

export async function setAuthCookies({
  email,
  clientId,
  role,
  clientName = "",
}) {
  const cookieStore = await cookies();
  const normalizedEmail = normalizeEmail(email);
  const payload = {
    email: normalizedEmail,
    clientId,
    role,
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
  ].forEach((name) => {
    cookieStore.set(name, "", options);
  });
}

export async function getSessionFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || "";
  return readSessionToken(token);
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
    .select("id,email,role,client_id,created_at")
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
