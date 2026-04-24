import { getResend } from "@/lib/resend";
import { logEvent } from "@/lib/server/observability.mjs";

function getSender() {
  return process.env.RESEND_FROM || "Nesped <access@nesped.com>";
}

export function buildTwoFactorEmail({ email, code, clientName = "", role = "" }) {
  const normalizedRole = String(role || "").toLowerCase();
  const audience =
    normalizedRole === "owner" || normalizedRole === "admin"
      ? "acceso privilegiado"
      : "acceso";

  const brand = clientName || "Nesped";

  return {
    subject: `Tu código de acceso para ${brand}`,
    text: [
      `Tu código de verificación para ${audience} en ${brand} es: ${code}`,
      "",
      "Caduca en 10 minutos.",
      "Si no has intentado iniciar sesión, ignora este email.",
    ].join("\n"),
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #08111f; color: #f5f7fb; padding: 32px;">
        <div style="max-width: 520px; margin: 0 auto; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; padding: 28px;">
          <div style="font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.6); margin-bottom: 12px;">Verificación de acceso</div>
          <h1 style="font-size: 28px; margin: 0 0 12px;">Tu código para entrar en ${brand}</h1>
          <p style="font-size: 15px; line-height: 1.6; color: rgba(255,255,255,0.78); margin: 0 0 20px;">
            Hemos detectado un intento de acceso a una cuenta con permisos elevados. Introduce este código para continuar.
          </p>
          <div style="font-size: 36px; font-weight: 700; letter-spacing: 0.22em; background: rgba(255,255,255,0.06); border-radius: 18px; padding: 18px 20px; text-align: center; margin-bottom: 20px;">
            ${code}
          </div>
          <p style="font-size: 14px; line-height: 1.6; color: rgba(255,255,255,0.62); margin: 0;">
            Caduca en 10 minutos. Si no has intentado iniciar sesión, ignora este email.
          </p>
        </div>
      </div>
    `,
    to: email,
    from: getSender(),
  };
}

export async function sendTwoFactorCode({
  email,
  code,
  clientName = "",
  role = "",
}) {
  if (!process.env.RESEND_API_KEY) {
    logEvent("warn", "auth.2fa_delivery_missing_resend", {
      email,
      role,
      clientName,
    });

    if (process.env.NODE_ENV !== "production") {
      return {
        ok: true,
        channel: "console",
        debugCode: code,
      };
    }

    throw new Error(
      "Falta RESEND_API_KEY para enviar el código de verificación"
    );
  }

  const resend = getResend();
  const message = buildTwoFactorEmail({ email, code, clientName, role });

  await resend.emails.send(message);

  logEvent("info", "auth.2fa_code_sent", {
    email,
    role,
    clientName,
  });

  return {
    ok: true,
    channel: "email",
  };
}
