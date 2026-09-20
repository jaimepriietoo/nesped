/* =========================================================================
   Restablecer la contraseña.

   Un enlace de un solo uso, que caduca en 30 minutos, mandado al correo de
   la cuenta. La respuesta al que lo pide es siempre la misma exista o no
   el correo: decir "ese correo no está" es regalar una lista de clientes a
   quien pruebe direcciones. El token va al correo entero y a la base sólo
   su hash: quien lea la tabla no puede usarlo.

   Al cambiar la contraseña se cierran todas las sesiones de esa cuenta
   (revocar_sesiones_usuario): si alguien pide restablecerla, lo primero
   que quiere es que el que estaba dentro deje de estarlo.
   ========================================================================= */

import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase";
import { enviarCorreo } from "@/lib/server/correo";
import { hashPassword } from "@/lib/server/auth-crypto";
import { validarPassword } from "@/lib/server/passwords";
import { revocarSesionesDe } from "@/lib/server/auth";
import { correoDesactivado } from "@/lib/server/destinatarios";

const CADUCIDAD_MIN = 30;
const hashDe = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

function urlBase() {
  return String(process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "");
}

/**
 * Crea el enlace y lo manda si la cuenta existe. Devuelve siempre
 * { pedido: true }; el detalle sólo sirve para pruebas y registros.
 */
export async function pedirRestablecimiento(email, { supabase = getSupabase() } = {}) {
  const normalizado = String(email || "").trim().toLowerCase();
  if (!normalizado) return { pedido: true, detalle: "sin correo" };

  const { data: usuario } = await supabase.from("users").select("email, client_id").eq("email", normalizado).limit(1).maybeSingle();
  if (!usuario) return { pedido: true, detalle: "no existe" };

  const token = crypto.randomBytes(32).toString("base64url");
  const expira = new Date(Date.now() + CADUCIDAD_MIN * 60e3).toISOString();
  const { error } = await supabase.from("restablecer_password").insert({ email: normalizado, client_id: usuario.client_id, token_hash: hashDe(token), expires_at: expira });
  if (error) throw new Error(error.message);

  /* El fragmento no viaja en la petición HTTP, ni entra en logs del servidor
     o cabeceras Referer. La página lo lee en el navegador y lo borra de la
     barra antes de que la persona escriba la contraseña. */
  const enlace = `${urlBase()}/restablecer#token=${encodeURIComponent(token)}`;
  if (correoDesactivado()) return { pedido: true, detalle: "correo desactivado", enlaceDePrueba: process.env.NODE_ENV !== "production" ? enlace : undefined };

  await enviarCorreo({
    quienEspera: "persona",
    to: [normalizado],
    subject: "Restablecer tu contraseña de Nesped",
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#111">
      <h2 style="font-size:20px;margin:0 0 14px">Restablecer tu contraseña</h2>
      <p>Alguien —esperamos que tú— ha pedido cambiar la contraseña de esta cuenta. Este enlace vale ${CADUCIDAD_MIN} minutos y se puede usar una vez:</p>
      <p style="margin:18px 0"><a href="${enlace}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px">Elegir una contraseña nueva</a></p>
      <p style="font-size:13px;color:#666">Si no has sido tú, no hace falta hacer nada: tu contraseña sigue igual.</p>
    </div>`,
  });
  return { pedido: true, detalle: "enviado" };
}

/** Cambia la contraseña con un token válido. Lanza con mensaje claro si no. */
export async function restablecerConToken({ token, password, supabase = getSupabase(), revocar = revocarSesionesDe }) {
  const tokenHash = hashDe(token || "");
  const { data: candidata } = await supabase
    .from("restablecer_password")
    .select("id,email,client_id,expires_at,used_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!candidata || candidata.used_at || new Date(candidata.expires_at).getTime() <= Date.now()) {
    throw Object.assign(new Error("El enlace no es válido o ha caducado. Pide uno nuevo."), { status: 400 });
  }

  const revision = validarPassword(password, { email: candidata.email });
  if (!revision.ok) throw Object.assign(new Error(revision.message), { status: 400 });

  const usadoEn = new Date().toISOString();
  /*
   * Reclamar y gastar el token es una única escritura condicionada. Dos
   * peticiones simultáneas no pueden leer ambas `used_at = null` y cambiar
   * dos veces la contraseña: sólo una obtiene la fila.
   */
  const { data: fila, error: reclamarError } = await supabase
    .from("restablecer_password")
    .update({ used_at: usadoEn })
    .eq("token_hash", tokenHash)
    .is("used_at", null)
    .gt("expires_at", usadoEn)
    .select("id,email,client_id,expires_at,used_at")
    .maybeSingle();
  if (reclamarError) throw new Error("No se pudo comprobar el enlace");
  if (!fila) {
    throw Object.assign(new Error("El enlace no es válido o ha caducado. Pide uno nuevo."), { status: 400 });
  }

  const hash = hashPassword(password);
  const { error } = await supabase.from("users").update({ password: hash, password_hash: hash }).eq("email", fila.email);
  if (error) throw new Error(error.message);
  await revocar(fila.email);
  await supabase.from("audit_logs").insert({ client_id: fila.client_id, entity_type: "auth", entity_id: fila.email, action: "password_restablecida", actor: fila.email });
  return { ok: true };
}

export const PARA_PRUEBAS = { hashDe, CADUCIDAD_MIN };
