import { getSupabase } from "@/lib/supabase";
import { avisarDeAcceso } from "@/lib/server/aviso-acceso.mjs";
import {
  clearTwoFactorChallenge, getTwoFactorChallenge, setAuthCookies,
  tomarIntentoTwoFactor, verifyTwoFactorCode, consumirTwoFactor,
} from "@/lib/server/auth";
import { consumirCodigo } from "@/lib/server/codigos-recuperacion";
import { observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

async function handlePost(req) {
  const originError = requireSameOrigin(req);
  if (originError) return originError;
  const challenge = await getTwoFactorChallenge();
  if (!challenge) return Response.json({ success: false, message: "La verificación ha caducado. Vuelve a entrar." }, { status: 400 });
  const limited = await requireRateLimitAsync(req, {
    namespace: "login:2fa", limit: 12, windowMs: 15 * 60 * 1000,
    keyParts: [challenge.email], includeIp: false,
  });
  if (limited) return limited;
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || "").trim();
  // El contador está en la base de datos; repetir una cookie no lo reinicia.
  const attempt = await tomarIntentoTwoFactor(challenge);
  if (!attempt) return Response.json({ success: false, message: "La verificación ha caducado." }, { status: 400 });
  const recovery = /^[A-Za-z0-9]{5}-?[A-Za-z0-9]{5}$/.test(code);
  const valid = recovery
    ? await consumirCodigo({ email: challenge.email, codigo: code })
    : verifyTwoFactorCode(attempt, code);
  if (!valid) {
    if (attempt.attempts >= 5) await clearTwoFactorChallenge();
    return Response.json({ success: false, message: "Código incorrecto o caducado." }, { status: 401 });
  }
  if (!await consumirTwoFactor(challenge)) {
    return Response.json({ success: false, message: "El código ya se ha utilizado." }, { status: 401 });
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
    action: recovery ? "2fa_recuperacion_usada" : "2fa_verified", actor: challenge.email,
  });
  void avisarDeAcceso({ email: challenge.email, rol: user.role, clientName: challenge.clientName });
  return Response.json({ success: true, redirectTo: challenge.nextPath || "/portal" });
}
export const POST = observeRoute("api.login.2fa.post", handlePost);
