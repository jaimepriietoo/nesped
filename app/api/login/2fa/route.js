import { getSupabase } from "@/lib/supabase";
import {
  bumpTwoFactorChallengeAttempts,
  clearTwoFactorChallenge,
  getTwoFactorChallenge,
  setAuthCookies,
  verifyTwoFactorCode,
} from "@/lib/server/auth";
import { logEvent, observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";

async function appendAuditLog({ clientId, actor, action, changes }) {
  try {
    const supabase = getSupabase();
    await supabase.from("audit_logs").insert({
      client_id: clientId,
      entity_type: "auth",
      entity_id: actor || null,
      action,
      actor: actor || "system",
      changes: changes ? JSON.stringify(changes) : null,
      created_at: new Date().toISOString(),
    });
  } catch {}
}

async function handlePost(req) {
  const sameOriginError = requireSameOrigin(
    req,
    "Origen no permitido para verificar el acceso"
  );
  if (sameOriginError) return sameOriginError;

  const rateLimitError = await requireRateLimitAsync(req, {
    namespace: "login:2fa",
    limit: 12,
    windowMs: 15 * 60 * 1000,
    message: "Demasiados intentos de verificación. Espera unos minutos.",
  });
  if (rateLimitError) return rateLimitError;

  const challenge = await getTwoFactorChallenge();
  if (!challenge) {
    return Response.json(
      {
        success: false,
        message: "La verificación ha caducado. Vuelve a iniciar sesión.",
      },
      { status: 400 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").replace(/\D/g, "");

  if (code.length !== 6) {
    return Response.json(
      { success: false, message: "Introduce un código de 6 dígitos." },
      { status: 400 }
    );
  }

  if (!verifyTwoFactorCode(challenge, code)) {
    const nextAttempts = Number(challenge.attempts || 0) + 1;

    if (nextAttempts >= 5) {
      await clearTwoFactorChallenge();
    } else {
      await bumpTwoFactorChallengeAttempts(challenge);
    }

    await appendAuditLog({
      clientId: challenge.clientId,
      actor: challenge.email,
      action: "2fa_failed",
      changes: { attempts: nextAttempts },
    });

    return Response.json(
      {
        success: false,
        message:
          nextAttempts >= 5
            ? "Demasiados intentos. Vuelve a iniciar sesión."
            : "Código incorrecto.",
      },
      { status: 401 }
    );
  }

  await clearTwoFactorChallenge();
  await setAuthCookies({
    email: challenge.email,
    clientId: challenge.clientId,
    role: challenge.role || "viewer",
    clientName: challenge.clientName || challenge.clientId,
  });

  await appendAuditLog({
    clientId: challenge.clientId,
    actor: challenge.email,
    action: "2fa_verified",
    changes: { delivery: challenge.deliveryChannel || "email" },
  });

  logEvent("info", "auth.2fa_verified", {
    email: challenge.email,
    clientId: challenge.clientId,
    role: challenge.role || "viewer",
  });

  return Response.json({
    success: true,
    redirectTo: challenge.nextPath || "/portal",
  });
}

export const POST = observeRoute("api.login.2fa.post", handlePost);
