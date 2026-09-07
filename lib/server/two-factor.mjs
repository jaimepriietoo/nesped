import { getResend } from "@/lib/resend";
import { logEvent } from "@/lib/server/observability.mjs";
import { hasTelnyxSmsConfig, sendTelnyxSms } from "@/lib/server/telnyx";
import { esTelefonoValido } from "@/lib/server/phone";

function getSender() {
  return (
    process.env.RESEND_FROM ||
    "NESPED <onboarding@updates.nesped.com>"
  );
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
    to: [email],
    from: getSender(),
  };
}

async function enviarPorEmail({ email, code, clientName = "", role = "" }) {
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
  const result = await resend.emails.send(message);
  const providerError = result?.error || null;
  const providerId = result?.data?.id || result?.id || "";

  if (providerError) {
    logEvent("error", "auth.2fa_code_failed", {
      email,
      role,
      clientName,
      sender: message.from,
      provider: "resend",
      providerError: {
        name: providerError.name || "ResendError",
        message: providerError.message || "Error enviando el código",
      },
    });

    throw new Error(
      providerError.message || "No se pudo enviar el código de verificación"
    );
  }

  logEvent("info", "auth.2fa_code_sent", {
    email,
    role,
    clientName,
    sender: message.from,
    provider: "resend",
    providerId,
  });

  return {
    ok: true,
    channel: "email",
  };
}

/**
 * Manda el código de verificación.
 *
 * Antes iba sólo por email y, si Resend fallaba, la función lanzaba: el
 * login devolvía 500 y nadie con rol admin u owner podía entrar. Una caída
 * del proveedor de correo, o un dominio que deja de verificarse, te dejaba
 * fuera de tu propia plataforma sin ninguna alternativa.
 *
 * Ahora hay una segunda vía. Si el correo no sale y hay un móvil asociado a
 * la cuenta, el código va por SMS. Se avisa por cuál de las dos ha ido para
 * que quien entra sepa dónde mirar.
 *
 * @param {string} telefono  Móvil de la cuenta, si lo hay. Sólo se usa como
 *                           respaldo: el correo sigue siendo la vía normal.
 */
export async function sendTwoFactorCode({
  email,
  code,
  clientName = "",
  role = "",
  telefono = "",
}) {
  try {
    return await enviarPorEmail({ email, code, clientName, role });
  } catch (errorEmail) {
    const puedeSms = hasTelnyxSmsConfig() && esTelefonoValido(telefono);

    if (!puedeSms) {
      logEvent("error", "auth.2fa_sin_via_alternativa", {
        email,
        role,
        motivo: errorEmail?.message || "email falló",
        tieneSms: hasTelnyxSmsConfig(),
        tieneTelefono: Boolean(telefono),
      });
      throw errorEmail;
    }

    try {
      await sendTelnyxSms({
        to: telefono,
        message: `${code} es tu código de acceso a ${clientName || "Nesped"}. Caduca en 10 minutos.`,
      });

      logEvent("warn", "auth.2fa_respaldo_sms", {
        email,
        role,
        motivoEmail: errorEmail?.message || "email falló",
      });

      return { ok: true, channel: "sms" };
    } catch (errorSms) {
      logEvent("error", "auth.2fa_ambas_vias_fallaron", {
        email,
        role,
        motivoEmail: errorEmail?.message || "",
        motivoSms: errorSms?.message || "",
      });

      throw new Error(
        "No hemos podido enviarte el código ni por email ni por SMS. " +
          "Inténtalo de nuevo en unos minutos o escribe a soporte."
      );
    }
  }
}
