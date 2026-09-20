import { getSupabase } from "@/lib/supabase";
import {
  clearTwoFactorChallenge,
  getTwoFactorChallenge,
  setAuthCookies,
  tomarIntentoTwoFactor,
} from "@/lib/server/auth";
import { avisarDeAcceso } from "@/lib/server/aviso-acceso.mjs";
import { anotarPais } from "@/lib/server/anomalias";
import { validar } from "@/lib/server/esquemas";
import { AccesoConPasskey } from "@/lib/server/esquemas-portal";
import { observeRoute } from "@/lib/server/observability.mjs";
import { verificarAutenticacion } from "@/lib/server/passkeys";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

/**
 * Segundo paso del acceso con passkey. Mismo recorrido que /api/login/2fa,
 * con la firma del dispositivo en vez de un código.
 */
async function handlePost(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const challenge = await getTwoFactorChallenge();
  if (!challenge || challenge.factorType !== "passkey") {
    return Response.json({ success: false, message: "La verificación ha caducado." }, { status: 400 });
  }
  const limited = await requireRateLimitAsync(req, {
    namespace: "login:passkey", limit: 10, keyParts: [challenge.email], includeIp: false,
  });
  if (limited) return limited;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(AccesoConPasskey, cuerpo.datos, { mensaje: "Respuesta no válida" });
  if (leido.respuesta) return leido.respuesta;

  const attempt = await tomarIntentoTwoFactor(challenge);
  if (!attempt) return Response.json({ success: false, message: "La verificación ha caducado." }, { status: 400 });
  const valid = await verificarAutenticacion({
    email: challenge.email, clientId: challenge.clientId, respuesta: leido.datos.response,
  });
  if (!valid) {
    if (attempt.attempts >= 5) await clearTwoFactorChallenge();
    return Response.json({ success: false, message: "La passkey no se pudo verificar." }, { status: 401 });
  }

  const supabase = getSupabase();
  const { data: user, error } = await supabase.from("users")
    .select("role,session_epoch").eq("email", challenge.email).eq("client_id", challenge.clientId).maybeSingle();
  const { data: profile, error: profileError } = await supabase.from("portal_users")
    .select("is_active").eq("email", challenge.email).eq("client_id", challenge.clientId).maybeSingle();
  if (error || profileError || !user || profile?.is_active !== true ||
      Number(user.session_epoch || 0) !== Number(challenge.sessionEpoch || 0)) {
    await clearTwoFactorChallenge();
    return Response.json({ success: false, message: "El acceso ha cambiado. Vuelve a entrar." }, { status: 401 });
  }
  await clearTwoFactorChallenge();
  await setAuthCookies({
    email: challenge.email, clientId: challenge.clientId, role: user.role,
    clientName: challenge.clientName, sessionEpoch: user.session_epoch,
  });
  await supabase.from("audit_logs").insert({
    client_id: challenge.clientId, entity_type: "auth", entity_id: challenge.email,
    action: "passkey_verified", actor: challenge.email,
  });
  void anotarPais({ email: challenge.email, clientId: challenge.clientId, pais: challenge.pais || "" });
  void avisarDeAcceso({ email: challenge.email, rol: user.role, clientName: challenge.clientName, pais: challenge.pais || "" });
  return Response.json({ success: true, redirectTo: challenge.nextPath || "/portal" });
}

export const POST = observeRoute("api.login.passkey.post", handlePost);
