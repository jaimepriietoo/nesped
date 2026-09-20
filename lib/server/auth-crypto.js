import crypto from "node:crypto";

/*
 * Un hash scrypt bien formado que no pertenece a ninguna cuenta. Se usa
 * cuando el correo no existe para que el login haga el mismo trabajo caro
 * que con una contraseña incorrecta de una cuenta real. Sin ello, medir la
 * respuesta permite enumerar qué correos están registrados.
 */
const DUMMY_PASSWORD_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(128)}`;

export function sessionSecret() {
  const secret = process.env.NESPED_SESSION_SECRET || "";
  if (secret.length < 32) throw new Error("Configura un secreto de sesión de al menos 32 caracteres");
  if ([process.env.INTERNAL_API_TOKEN, process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET].filter(Boolean).includes(secret)) {
    throw new Error("El secreto de sesión debe ser exclusivo");
  }
  return secret;
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function hashPassword(password) {
  if (typeof password !== "string" || password.length > 200) throw new Error("Contraseña inválida");
  const salt = crypto.randomBytes(16).toString("hex");
  return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}

export function verifyPassword(password, storedValue) {
  if (typeof password !== "string" || password.length > 200) return false;
  if (!/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(String(storedValue || ""))) return false;
  const [, salt, hash] = storedValue.split("$");
  return safeEqual(crypto.scryptSync(password, salt, 64).toString("hex"), hash);
}

export function verifyPasswordWithoutAccountLeak(password, storedValue) {
  const stored = String(storedValue || "");
  const wellFormed = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(stored);
  const matches = verifyPassword(password, wellFormed ? stored : DUMMY_PASSWORD_HASH);
  return wellFormed && matches;
}

export function generateTwoFactorCode() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtpCode(code, challengeId) {
  return crypto.createHmac("sha256", sessionSecret())
    .update(`2fa:${challengeId}:${String(code || "")}`).digest("hex");
}

export function challengeKey(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
