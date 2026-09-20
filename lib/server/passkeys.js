import crypto from "node:crypto";
import { cookies } from "next/headers";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { getSupabaseAdministrativo } from "@/lib/supabase";
import { sessionSecret, safeEqual } from "@/lib/server/auth-crypto";

/**
 * Passkeys (WebAuthn) como segundo factor.
 *
 * El navegador crea un par de claves atado al dominio; aquí se guarda la
 * pública. Para entrar, el servidor manda un reto, el dispositivo lo firma y
 * se comprueba la firma. Un sitio falso no puede pedir esa firma: el
 * navegador sólo la da al dominio que la creó. Eso es lo que TOTP no tiene.
 *
 * El reto viaja en una cookie firmada de tres minutos, igual que el de 2FA:
 * no hace falta tabla, y el servidor no guarda nada hasta que se completa.
 */

const COOKIE_RETO = "nesped_webauthn";
const RETO_MAX_AGE_S = 3 * 60;
const RP_NAME = "Nesped";

function correo(email) {
  return String(email || "").trim().toLowerCase();
}

/** Dominio registrable del sitio: www.nesped.com y nesped.com comparten passkeys. */
export function rpIdDe(url = process.env.NEXT_PUBLIC_APP_URL || "") {
  try {
    const host = new URL(url).hostname;
    return host.replace(/^www\./, "") || "localhost";
  } catch {
    return "localhost";
  }
}

export function origenesPermitidos(url = process.env.NEXT_PUBLIC_APP_URL || "") {
  const rpId = rpIdDe(url);
  if (rpId === "localhost") return ["http://localhost:3000", "http://127.0.0.1:3000"];
  return [`https://${rpId}`, `https://www.${rpId}`];
}

function firmar(cuerpo) {
  return crypto.createHmac("sha256", sessionSecret()).update(cuerpo).digest("base64url");
}

async function guardarReto({ proposito, email, clientId, challenge }) {
  const cuerpo = Buffer.from(JSON.stringify({
    proposito, email: correo(email), clientId, challenge, exp: Date.now() + RETO_MAX_AGE_S * 1000,
  })).toString("base64url");
  (await cookies()).set(COOKIE_RETO, `${cuerpo}.${firmar(cuerpo)}`, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/", maxAge: RETO_MAX_AGE_S,
  });
}

async function tomarReto({ proposito, email, clientId }) {
  const store = await cookies();
  const token = store.get(COOKIE_RETO)?.value || "";
  store.set(COOKIE_RETO, "", { httpOnly: true, sameSite: "strict", path: "/", maxAge: 0 });
  const [cuerpo, firma] = token.split(".");
  if (!cuerpo || !firma || !safeEqual(firma, firmar(cuerpo))) return null;
  try {
    const datos = JSON.parse(Buffer.from(cuerpo, "base64url").toString("utf8"));
    if (datos.proposito !== proposito || datos.email !== correo(email) || datos.clientId !== clientId) return null;
    if (!datos.exp || datos.exp < Date.now()) return null;
    return datos.challenge;
  } catch {
    return null;
  }
}

export async function listarPasskeys({ email, clientId }) {
  const { data, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials")
    .select("id,nombre,device_type,backed_up,created_at,last_used_at")
    .eq("client_id", clientId).eq("email", correo(email)).order("created_at");
  if (error) throw new Error("No se pudieron leer las passkeys");
  return data || [];
}

async function credencialesDe({ email, clientId }) {
  const { data, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials")
    .select("id,credential_id,public_key,counter,transports")
    .eq("client_id", clientId).eq("email", correo(email));
  if (error) throw new Error("No se pudieron leer las passkeys");
  return data || [];
}

export async function tienePasskeys({ email, clientId }) {
  const { count, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials")
    .select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("email", correo(email));
  if (error) throw new Error("No se pudieron consultar las passkeys");
  return Number(count || 0) > 0;
}

export async function opcionesDeRegistro({ email, clientId }) {
  const existentes = await credencialesDe({ email, clientId });
  const opciones = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rpIdDe(),
    userName: correo(email),
    userDisplayName: correo(email),
    attestationType: "none",
    excludeCredentials: existentes.map((c) => ({ id: c.credential_id, transports: c.transports })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
  await guardarReto({ proposito: "registro", email, clientId, challenge: opciones.challenge });
  return opciones;
}

export async function completarRegistro({ email, clientId, respuesta, nombre = "" }) {
  const challenge = await tomarReto({ proposito: "registro", email, clientId });
  if (!challenge) return { ok: false, motivo: "El reto ha caducado. Vuelve a intentarlo." };
  let verificacion;
  try {
    verificacion = await verifyRegistrationResponse({
      response: respuesta,
      expectedChallenge: challenge,
      expectedOrigin: origenesPermitidos(),
      expectedRPID: rpIdDe(),
      requireUserVerification: false,
    });
  } catch {
    return { ok: false, motivo: "La passkey no se pudo verificar" };
  }
  if (!verificacion.verified || !verificacion.registrationInfo) return { ok: false, motivo: "La passkey no se pudo verificar" };
  const { credential, credentialDeviceType, credentialBackedUp } = verificacion.registrationInfo;
  const { data, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials").insert({
    client_id: clientId, email: correo(email),
    credential_id: credential.id,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports || [],
    device_type: credentialDeviceType || "",
    backed_up: Boolean(credentialBackedUp),
    nombre: String(nombre || "").trim().slice(0, 80),
  }).select("id").single();
  if (error) return { ok: false, motivo: "No se pudo guardar la passkey" };
  return { ok: true, id: data.id };
}

export async function opcionesDeAutenticacion({ email, clientId }) {
  const credenciales = await credencialesDe({ email, clientId });
  if (!credenciales.length) return null;
  const opciones = await generateAuthenticationOptions({
    rpID: rpIdDe(),
    allowCredentials: credenciales.map((c) => ({ id: c.credential_id, transports: c.transports })),
    userVerification: "preferred",
  });
  await guardarReto({ proposito: "acceso", email, clientId, challenge: opciones.challenge });
  return opciones;
}

export async function verificarAutenticacion({ email, clientId, respuesta }) {
  const challenge = await tomarReto({ proposito: "acceso", email, clientId });
  if (!challenge) return false;
  const credenciales = await credencialesDe({ email, clientId });
  const credencial = credenciales.find((c) => c.credential_id === respuesta?.id);
  if (!credencial) return false;
  let verificacion;
  try {
    verificacion = await verifyAuthenticationResponse({
      response: respuesta,
      expectedChallenge: challenge,
      expectedOrigin: origenesPermitidos(),
      expectedRPID: rpIdDe(),
      requireUserVerification: false,
      credential: {
        id: credencial.credential_id,
        publicKey: new Uint8Array(Buffer.from(credencial.public_key, "base64url")),
        counter: Number(credencial.counter || 0),
        transports: credencial.transports,
      },
    });
  } catch {
    return false;
  }
  if (!verificacion.verified) return false;
  /* El contador sólo puede subir: uno repetido delata una passkey clonada.
     La comparación la hace la librería; aquí se guarda el nuevo. */
  const { data, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials")
    .update({ counter: verificacion.authenticationInfo.newCounter, last_used_at: new Date().toISOString() })
    .eq("id", credencial.id).select("id");
  return !error && (data || []).length === 1;
}

export async function eliminarPasskey({ id, email, clientId }) {
  const { data, error } = await getSupabaseAdministrativo().from("auth_webauthn_credentials")
    .delete().eq("id", id).eq("client_id", clientId).eq("email", correo(email)).select("id");
  if (error) throw new Error("No se pudo eliminar la passkey");
  return (data || []).length === 1;
}

/** Fecha a partir de la cual owner y admin deben tener passkey (aviso en el portal). */
export function passkeyObligatoriaDesde(env = process.env) {
  const valor = String(env.NESPED_PASSKEY_OBLIGATORIA_DESDE || "").trim();
  const fecha = Date.parse(valor);
  return Number.isFinite(fecha) ? new Date(fecha) : null;
}
