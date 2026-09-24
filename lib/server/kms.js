import { DecryptCommand, EncryptCommand, KMSClient } from "@aws-sdk/client-kms";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { logEvent } from "@/lib/server/observability.mjs";

/**
 * Sobres KMS.
 *
 * Un secreto puede vivir en Vercel en claro (`abc123…`) o cerrado en un sobre
 * (`kms:v1:<base64>`). El sobre sólo lo abre AWS KMS con la clave maestra
 * `nesped-secretos`, que nunca sale de allí: quien copie las variables de
 * Vercel se lleva sobres, y el acceso para abrirlos requiere una identidad
 * AWS autorizada, preferentemente temporal, y deja rastro en CloudTrail.
 *
 * Al arrancar (instrumentation.js) se abren todos los sobres y se deja el
 * valor en process.env, así que el resto del código sigue leyendo
 * `process.env.LO_QUE_SEA` como siempre. Los que ya están en claro se dejan
 * tal cual: la migración a sobres puede ser variable a variable.
 *
 * Lo que NO puede ir en sobre: lo que lee el proxy en Edge (el secreto de
 * sesión), porque Edge no puede hablar con KMS. Queda documentado.
 */

const PREFIJO = "kms:v1:";

/* Las variables que se abren al arrancar. Añadir aquí una nueva es lo único
   que hace falta para que pueda ir en sobre. */
export const SECRETOS_EN_SOBRE = [
  "NESPED_TOTP_ENCRYPTION_KEY",
  "NESPED_DATA_ENCRYPTION_KEY",
  "NESPED_AUDIT_CHECKPOINT_SECRET",
  "SUPABASE_JWT_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_SUBSCRIPTION_WEBHOOK_SECRET",
  "TWILIO_AUTH_TOKEN",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
  "RESEND_API_KEY",
  "INTERNAL_API_TOKEN",
];

let cliente = null;
const abiertos = new Map();

export function esSobre(valor) {
  return typeof valor === "string" && valor.startsWith(PREFIJO);
}

/** Qué identidad AWS se va a usar, para dejarlo en el log (nunca el valor). */
export function identidadKms(env = process.env) {
  if (env.AWS_ROLE_ARN) return "oidc_vercel";
  if (env.AWS_ACCESS_KEY_ID) return "claves_estaticas";
  return "cadena_sdk";
}

export function clienteKms(env = process.env, {
  crearCliente = (config) => new KMSClient(config),
  proveedorOidc = awsCredentialsProvider,
} = {}) {
  if (cliente) return cliente;
  if (!env.AWS_REGION) {
    throw new Error("Falta AWS_REGION para abrir sobres KMS");
  }
  /* Con AWS_ROLE_ARN, Vercel cambia su token OIDC por credenciales de una
     hora (AssumeRoleWithWebIdentity): en Vercel no queda ninguna clave AWS
     fija junto a los sobres. La cadena estándar del SDK no sirve para eso,
     porque Vercel no entrega el token como fichero. Sin AWS_ROLE_ARN se usa
     la cadena estándar (claves locales, perfil…), como hasta ahora. */
  const config = { region: env.AWS_REGION };
  if (env.AWS_ROLE_ARN) {
    config.credentials = proveedorOidc({
      roleArn: env.AWS_ROLE_ARN,
      roleSessionName: "nesped-kms",
      clientConfig: { region: env.AWS_REGION },
    });
  }
  cliente = crearCliente(config);
  return cliente;
}

/** Cierra un valor en un sobre. Sólo lo usa el script cerrar-sobre. */
export async function cerrarSobre(valor, { kms = clienteKms(), keyId = process.env.NESPED_KMS_KEY_ID, nombre = "" } = {}) {
  if (!keyId) throw new Error("Falta NESPED_KMS_KEY_ID");
  const { CiphertextBlob } = await kms.send(new EncryptCommand({
    KeyId: keyId,
    Plaintext: Buffer.from(String(valor), "utf8"),
    /* El nombre de la variable va como contexto: un sobre de STRIPE no se
       puede abrir haciéndose pasar por el de TWILIO. */
    EncryptionContext: nombre ? { variable: nombre } : undefined,
  }));
  return PREFIJO + Buffer.from(CiphertextBlob).toString("base64");
}

export async function abrirSobre(sobre, { kms = null, nombre = "" } = {}) {
  if (!esSobre(sobre)) return sobre;
  const cache = `${nombre}|${sobre}`;
  if (abiertos.has(cache)) return abiertos.get(cache);
  const { Plaintext } = await (kms || clienteKms()).send(new DecryptCommand({
    CiphertextBlob: Buffer.from(sobre.slice(PREFIJO.length), "base64"),
    EncryptionContext: nombre ? { variable: nombre } : undefined,
  }));
  const valor = Buffer.from(Plaintext).toString("utf8");
  abiertos.set(cache, valor);
  return valor;
}

/**
 * Abre todos los sobres de la lista y deja los valores en `env`. Falla
 * cerrado: si un sobre no se puede abrir, la app no arranca con un secreto
 * a medias. Devuelve cuántos abrió para el log de arranque.
 */
export async function abrirSobresDeEntorno({ env = process.env, kms = null, nombres = SECRETOS_EN_SOBRE } = {}) {
  const cerrados = nombres.filter((n) => esSobre(env[n]));
  if (!cerrados.length) return { abiertos: 0, variables: [] };
  const cliente = kms || clienteKms(env);
  for (const nombre of cerrados) {
    env[nombre] = await abrirSobre(env[nombre], { kms: cliente, nombre });
  }
  logEvent("info", "kms.sobres_abiertos", { cuantos: cerrados.length, variables: cerrados, identidad: identidadKms(env) });
  return { abiertos: cerrados.length, variables: cerrados };
}

export const PARA_PRUEBAS = {
  PREFIJO,
  abiertos,
  reiniciarCliente() {
    cliente = null;
  },
};
