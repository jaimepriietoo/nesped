import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase";

const ALFABETO_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PASO_MS = 30_000;
const VENTANA = 1;

function correoNormalizado(email) {
  return String(email || "").trim().toLowerCase();
}

function claveDeCifrado() {
  const valor = String(process.env.NESPED_TOTP_ENCRYPTION_KEY || "").trim();
  let clave;
  if (/^[a-f0-9]{64}$/i.test(valor)) clave = Buffer.from(valor, "hex");
  else {
    try { clave = Buffer.from(valor, "base64"); } catch { clave = Buffer.alloc(0); }
  }
  if (clave.length !== 32) {
    throw new Error("Configura NESPED_TOTP_ENCRYPTION_KEY con 32 bytes aleatorios");
  }
  return clave;
}

export function cifrarSecretoTotp(secreto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", claveDeCifrado(), iv);
  const cifrado = Buffer.concat([cipher.update(String(secreto), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${cifrado.toString("base64url")}`;
}

export function descifrarSecretoTotp(sobre) {
  const [version, iv, tag, cifrado] = String(sobre || "").split(".");
  if (version !== "v1" || !iv || !tag || !cifrado) throw new Error("Factor TOTP no válido");
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", claveDeCifrado(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(cifrado, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("No se pudo descifrar el factor TOTP");
  }
}

function codificarBase32(bytes) {
  let bits = 0;
  let valor = 0;
  let salida = "";
  for (const byte of bytes) {
    valor = (valor << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      salida += ALFABETO_BASE32[(valor >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) salida += ALFABETO_BASE32[(valor << (5 - bits)) & 31];
  return salida;
}

function decodificarBase32(valor) {
  const limpio = String(valor || "").toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let acumulado = 0;
  const bytes = [];
  for (const caracter of limpio) {
    const indice = ALFABETO_BASE32.indexOf(caracter);
    if (indice < 0) throw new Error("Secreto TOTP no válido");
    acumulado = (acumulado << 5) | indice;
    bits += 5;
    if (bits >= 8) {
      bytes.push((acumulado >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function codigoParaPaso(secreto, paso) {
  const contador = Buffer.alloc(8);
  contador.writeBigUInt64BE(BigInt(paso));
  const digest = crypto.createHmac("sha1", decodificarBase32(secreto)).update(contador).digest();
  const offset = digest[digest.length - 1] & 15;
  const numero = ((digest[offset] & 127) << 24)
    | (digest[offset + 1] << 16)
    | (digest[offset + 2] << 8)
    | digest[offset + 3];
  return String(numero % 1_000_000).padStart(6, "0");
}

export function generarSecretoTotp() {
  return codificarBase32(crypto.randomBytes(20));
}

export function codigoTotp(secreto, ahora = Date.now()) {
  return codigoParaPaso(secreto, Math.floor(ahora / PASO_MS));
}

export function encontrarPasoTotp(secreto, codigo, ahora = Date.now()) {
  if (!/^\d{6}$/.test(String(codigo || ""))) return null;
  const actual = Math.floor(ahora / PASO_MS);
  for (let desfase = -VENTANA; desfase <= VENTANA; desfase += 1) {
    const paso = actual + desfase;
    if (paso >= 0 && crypto.timingSafeEqual(
      Buffer.from(codigoParaPaso(secreto, paso)),
      Buffer.from(String(codigo)),
    )) return paso;
  }
  return null;
}

export function uriTotp({ secreto, email, issuer = "Nesped" }) {
  const etiqueta = encodeURIComponent(`${issuer}:${correoNormalizado(email)}`);
  const params = new URLSearchParams({ secret: secreto, issuer, algorithm: "SHA1", digits: "6", period: "30" });
  return `otpauth://totp/${etiqueta}?${params.toString()}`;
}

export async function estadoTotp({ email, clientId }) {
  const { data, error } = await getSupabase().from("auth_totp_factors")
    .select("confirmed_at").eq("email", correoNormalizado(email))
    .eq("client_id", clientId).maybeSingle();
  if (error) throw new Error("No se pudo consultar el segundo factor");
  return { configured: Boolean(data), enabled: Boolean(data?.confirmed_at) };
}

export async function iniciarAltaTotp({ email, clientId }) {
  const estado = await estadoTotp({ email, clientId });
  if (estado.enabled) throw new Error("TOTP ya está activado");
  const secreto = generarSecretoTotp();
  const fila = {
    email: correoNormalizado(email), client_id: clientId,
    secret_ciphertext: cifrarSecretoTotp(secreto), confirmed_at: null,
    last_used_step: -1, updated_at: new Date().toISOString(),
  };
  const { error } = await getSupabase().from("auth_totp_factors")
    .upsert(fila, { onConflict: "client_id,email" });
  if (error) throw new Error("No se pudo iniciar el alta TOTP");
  return { secret: secreto, uri: uriTotp({ secreto, email }) };
}

async function leerFactor({ email, clientId, confirmado = true }) {
  let consulta = getSupabase().from("auth_totp_factors")
    .select("id,secret_ciphertext,confirmed_at,last_used_step")
    .eq("email", correoNormalizado(email)).eq("client_id", clientId);
  if (confirmado) consulta = consulta.not("confirmed_at", "is", null);
  const { data, error } = await consulta.maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function confirmarAltaTotp({ email, clientId, codigo, ahora = Date.now() }) {
  const factor = await leerFactor({ email, clientId, confirmado: false });
  if (!factor || factor.confirmed_at) return false;
  const paso = encontrarPasoTotp(descifrarSecretoTotp(factor.secret_ciphertext), codigo, ahora);
  if (paso === null) return false;
  const { data, error } = await getSupabase().from("auth_totp_factors")
    .update({ confirmed_at: new Date(ahora).toISOString(), last_used_step: paso, updated_at: new Date(ahora).toISOString() })
    .eq("id", factor.id).is("confirmed_at", null).select("id");
  if (error) throw new Error("No se pudo confirmar el factor TOTP");
  return data?.length === 1;
}

export async function verificarYConsumirTotp({ email, clientId, codigo, ahora = Date.now() }) {
  const factor = await leerFactor({ email, clientId });
  if (!factor) return false;
  const paso = encontrarPasoTotp(descifrarSecretoTotp(factor.secret_ciphertext), codigo, ahora);
  if (paso === null || paso <= Number(factor.last_used_step ?? -1)) return false;
  const { data, error } = await getSupabase().from("auth_totp_factors")
    .update({ last_used_step: paso, updated_at: new Date(ahora).toISOString() })
    .eq("id", factor.id).lt("last_used_step", paso).select("id");
  if (error) throw new Error("No se pudo verificar el factor TOTP");
  return data?.length === 1;
}

export async function eliminarTotp({ email, clientId }) {
  const { error } = await getSupabase().from("auth_totp_factors")
    .delete().eq("email", correoNormalizado(email)).eq("client_id", clientId);
  if (error) throw new Error("No se pudo desactivar TOTP");
}

export const PARAMETROS_TOTP = { pasoMs: PASO_MS, ventana: VENTANA };
