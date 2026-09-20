import { z } from "zod";
import { leerJsonLimitado, requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { restablecerConToken } from "@/lib/server/restablecer";

const Restablecer = z.object({
  token: z.string().trim().min(20).max(200),
  password: z.string().min(1, "Falta la contraseña").max(1024),
});

async function manejarPOST(req) {
  const origen = requireSameOrigin(req, "Origen no permitido");
  if (origen) return origen;
  const limitado = await requireRateLimitAsync(req, { namespace: "restablecer:ip", limit: 10, windowMs: 15 * 60 * 1000, message: "Demasiados intentos. Espera unos minutos." });
  if (limitado) return limitado;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const leido = validar(Restablecer, cuerpo.datos, { mensaje: "Datos no válidos" });
  if (leido.respuesta) return leido.respuesta;
  try {
    await restablecerConToken(leido.datos);
    return Response.json({ success: true, message: "Contraseña cambiada. Ya puedes entrar con la nueva." });
  } catch (err) {
    return Response.json({ success: false, message: err?.message || "No se pudo cambiar la contraseña" }, { status: err?.status || 500 });
  }
}

export const POST = observeRoute("api.login.restablecer.post", manejarPOST);
