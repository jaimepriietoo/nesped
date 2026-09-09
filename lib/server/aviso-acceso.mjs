import { enviarCorreo } from "@/lib/server/correo";
import { logEvent } from "@/lib/server/observability.mjs";

/**
 * Avisa por correo de que alguien ha entrado en la cuenta.
 *
 * Es la forma más barata y más efectiva de detectar un robo de credenciales:
 * quien recibe un aviso de un acceso que no ha hecho, lo sabe en el momento y
 * puede cerrar todas las sesiones. Sin esto, un intruso con la contraseña
 * correcta entra y sale sin dejar rastro visible para el titular.
 *
 * Nunca bloquea el acceso: si el correo falla, el usuario entra igual. Un
 * proveedor de email caído no puede convertirse en un fallo de inicio de
 * sesión, que es exactamente el error que ya costó una caída del 2FA.
 */
export async function avisarDeAcceso({ email, rol, clientName, ip, agente }) {
  if (!process.env.RESEND_API_KEY) return { ok: false, motivo: "sin resend" };

  const marca = clientName || "Nesped";
  const cuando = new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date());

  // Del navegador sólo se nombra la familia: la cadena completa no dice nada
  // a quien lo lee y además es un dato más del que responder.
  const navegador = /iphone|ipad|android|mobile/i.test(agente || "")
    ? "un móvil"
    : "un ordenador";

  const texto = [
    `Alguien ha entrado en tu cuenta de ${marca}.`,
    "",
    `Cuándo: ${cuando}`,
    `Desde: ${navegador}${ip ? ` · ${ip}` : ""}`,
    `Permisos: ${rol || "cliente"}`,
    "",
    "Si has sido tú, no tienes que hacer nada.",
    "",
    "Si no has sido tú, entra en el portal, ve a Ajustes y pulsa",
    "«Cerrar todas las sesiones». Después cambia tu contraseña.",
    "",
    "https://nesped.com/portal",
  ].join("\n");

  try {
    /* Nadie espera este aviso: se manda después de que la persona ya ha
       entrado. Si Resend está caído, no vale la pena insistir. */
    await enviarCorreo({
      quienEspera: "nadie",
      to: [email],
      subject: `Nuevo acceso a tu cuenta de ${marca}`,
      text: texto,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #000; color: #fff; padding: 32px;">
          <div style="max-width: 520px; margin: 0 auto; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.09); border-radius: 22px; padding: 28px;">
            <div style="font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,0.5); margin-bottom: 14px;">Aviso de acceso</div>
            <h1 style="font-size: 24px; margin: 0 0 16px; font-weight: 600;">Alguien ha entrado en tu cuenta</h1>
            <table style="width:100%; font-size:14px; color: rgba(255,255,255,0.78); border-collapse: collapse;">
              <tr><td style="padding:6px 0; color: rgba(255,255,255,0.45);">Cuándo</td><td style="padding:6px 0; text-align:right;">${cuando}</td></tr>
              <tr><td style="padding:6px 0; color: rgba(255,255,255,0.45);">Desde</td><td style="padding:6px 0; text-align:right;">${navegador}${ip ? ` · ${ip}` : ""}</td></tr>
              <tr><td style="padding:6px 0; color: rgba(255,255,255,0.45);">Permisos</td><td style="padding:6px 0; text-align:right;">${rol || "cliente"}</td></tr>
            </table>
            <p style="font-size:14px; line-height:1.6; color: rgba(255,255,255,0.7); margin: 22px 0 0;">
              Si has sido tú, no tienes que hacer nada.
            </p>
            <p style="font-size:14px; line-height:1.6; color: rgba(255,255,255,0.7); margin: 12px 0 22px;">
              Si no has sido tú, entra en el portal, ve a <strong style="color:#fff;">Ajustes</strong>
              y pulsa <strong style="color:#fff;">Cerrar todas las sesiones</strong>. Después cambia tu contraseña.
            </p>
            <a href="https://nesped.com/portal" style="display:inline-block; background:#fff; color:#000; padding:11px 22px; border-radius:999px; font-size:14px; font-weight:600; text-decoration:none;">Abrir el portal</a>
          </div>
        </div>
      `,
    });

    return { ok: true };
  } catch (error) {
    logEvent("warn", "auth.aviso_acceso_fallido", { email, motivo: error?.message });
    return { ok: false };
  }
}
