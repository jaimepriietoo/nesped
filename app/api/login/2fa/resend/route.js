import {
  generateTwoFactorCode,
  getTwoFactorChallenge,
  setTwoFactorChallenge,
} from "@/lib/server/auth";
import { observeRoute } from "@/lib/server/observability.mjs";
import { requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { sendTwoFactorCode } from "@/lib/server/two-factor.mjs";
import { getSupabase } from "@/lib/supabase";

async function handlePost(req) {
  const sameOriginError = requireSameOrigin(
    req,
    "Origen no permitido para reenviar el código"
  );
  if (sameOriginError) return sameOriginError;

  const rateLimitError = await requireRateLimitAsync(req, {
    namespace: "login:2fa:resend",
    limit: 4,
    windowMs: 15 * 60 * 1000,
    message: "Has pedido demasiados códigos. Espera unos minutos.",
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

  const code = generateTwoFactorCode();
  await setTwoFactorChallenge({
    email: challenge.email,
    clientId: challenge.clientId,
    role: challenge.role,
    clientName: challenge.clientName,
    nextPath: challenge.nextPath || "/portal",
    code,
    deliveryChannel: "email",
    attempts: 0,
  });

  // Mismo respaldo que en el primer envío: si el correo no sale, SMS.
  const { data: perfil } = await getSupabase()
    .from("portal_users")
    .select("phone")
    .eq("client_id", challenge.clientId)
    .eq("email", challenge.email)
    .maybeSingle();

  const delivery = await sendTwoFactorCode({
    email: challenge.email,
    code,
    clientName: challenge.clientName,
    role: challenge.role,
    telefono: perfil?.phone || "",
  });

  return Response.json({
    success: true,
    verificationChannel: delivery.channel || "email",
    debugCode: delivery.debugCode || "",
  });
}

export const POST = observeRoute("api.login.2fa.resend.post", handlePost);
