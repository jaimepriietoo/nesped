import { getResend } from "@/lib/resend";
import { requireInternalRequest } from "@/lib/server/internal-api";

/**
 * Correo de bienvenida a un usuario recién creado.
 *
 * Esta ruta era un problema serio y conviene dejar escrito por qué, porque
 * "una ruta que manda un correo" no suena a nada:
 *
 *   1. No pedía credencial. Cualquiera podía llamarla desde fuera.
 *   2. Metía `clientName`, `email` y `password` en el HTML sin escapar, así
 *      que el cuerpo del correo se podía escribir entero desde la petición.
 *   3. `loginUrl` iba directo a un href, o sea que el botón podía apuntar a
 *      donde quisiera quien llamara.
 *
 * Las tres juntas convierten esto en una máquina de mandar el correo que sea,
 * a quien sea, firmado desde nuestro dominio. Ni siquiera hace falta engañar
 * a un filtro antispam: sale de un remitente legítimo con SPF y DKIM buenos.
 * El daño no es el correo, es que quemas el dominio y a partir de ahí tus
 * avisos de verdad acaban en la carpeta de basura de todos tus clientes.
 *
 * Ahora: sólo se llama desde el servidor con el token interno, todo lo que
 * entra se escapa, y el enlace lo construye esta ruta, no quien la llama.
 */

/** Escapa lo que va a acabar dentro del HTML del correo. */
function escaparHtml(valor = "") {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req) {
  try {
    const errorInterno = requireInternalRequest(req);
    if (errorInterno) return errorInterno;

    const resend = getResend();
    const { email, clientName, password } = await req.json().catch(() => ({}));

    if (!email || !clientName) {
      return Response.json({ success: false, message: "Faltan datos" }, { status: 400 });
    }

    /* El destino lo decide el servidor. Aceptarlo del cuerpo permitía mandar
       a alguien un correo con nuestro remite y un botón a cualquier sitio. */
    const base = (process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "");
    const enlace = `${base}/login`;

    const nombre = escaparHtml(clientName);
    const correo = escaparHtml(email);

    const { error } = await resend.emails.send({
      from: "Nesped <onboarding@updates.nesped.com>",
      to: [email],
      subject: `Tu acceso a ${clientName}`,
      html: `
        <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;padding:32px;">
          <h1 style="font-size:22px;margin:0 0 16px;">Bienvenido a ${nombre}</h1>
          <p style="margin:0 0 8px;">Tu acceso ya está listo.</p>
          <p style="margin:0 0 4px;"><strong>Correo:</strong> ${correo}</p>
          ${
            password
              ? `<p style="margin:0 0 4px;"><strong>Contraseña:</strong> ${escaparHtml(password)}</p>
                 <p style="margin:12px 0 0;font-size:13px;color:#9a9a9a;">Cámbiala en cuanto entres.</p>`
              : ""
          }
          <p style="margin-top:24px;">
            <a href="${enlace}" style="background:#fff;color:#000;padding:12px 18px;border-radius:10px;text-decoration:none;">
              Entrar al panel
            </a>
          </p>
        </div>
      `,
    });

    if (error) {
      return Response.json({ success: false, message: error.message }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("POST /api/onboarding-email error:", error);
    /* Sin devolver el mensaje interno: decía cosas como qué proveedor de
       correo falla y con qué error, que es información gratis para quien
       esté probando. */
    return Response.json(
      { success: false, message: "No se pudo enviar el correo" },
      { status: 500 }
    );
  }
}
