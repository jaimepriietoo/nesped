import { z } from "zod";
import { requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { pedirRestablecimiento } from "@/lib/server/restablecer";
import { logEvent } from "@/lib/server/observability.mjs";

const Recuperar = z.object({ email: z.string().trim().max(254).toLowerCase().pipe(z.email("Correo no válido")) });

/**
 * "He olvidado mi contraseña". La respuesta es la misma exista o no el
 * correo, y con límite por IP y por correo para que nadie lo use para
 * inundar un buzón.
 */
async function manejarPOST(req) {
  const origen = requireSameOrigin(req, "Origen no permitido");
  if (origen) return origen;
  const porIp = await requireRateLimitAsync(req, { namespace: "recuperar:ip", limit: 10, windowMs: 15 * 60 * 1000, message: "Demasiados intentos. Espera unos minutos." });
  if (porIp) return porIp;
  const leido = validar(Recuperar, await req.json().catch(() => ({})), { mensaje: "Correo no válido" });
  if (leido.respuesta) return leido.respuesta;
  const { email } = leido.datos;
  const porCorreo = await requireRateLimitAsync(req, { namespace: "recuperar:email", limit: 3, windowMs: 60 * 60 * 1000, keyParts: [email], includeIp: false, message: "Ya se ha pedido varias veces. Mira tu correo o espera una hora." });
  if (porCorreo) return porCorreo;

  const MENSAJE = "Si ese correo tiene una cuenta, en un momento recibirá un enlace para elegir una contraseña nueva.";
  try {
    const r = await pedirRestablecimiento(email);
    logEvent("info", "auth.recuperar", { email, detalle: r.detalle });
    return Response.json({ success: true, message: MENSAJE, ...(r.enlaceDePrueba ? { enlaceDePrueba: r.enlaceDePrueba } : {}) });
  } catch (err) {
    logEvent("error", "auth.recuperar_fallo", { email, error: String(err?.message || err).slice(0, 200) });
    /* Un fallo al mandar no puede delatar que el correo existe. */
    return Response.json({ success: true, message: MENSAJE });
  }
}

export const POST = observeRoute("api.login.recuperar.post", manejarPOST);
