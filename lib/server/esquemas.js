/* =========================================================================
   Lo que se acepta en la puerta.

   Los esquemas de lo que entra por donde entra cualquiera: el login y los
   webhooks. Cada ruta validaba a mano —`String(body?.email || "")`— y
   aceptaba lo que fuera con tal de que se pudiera convertir a texto. Aquí
   se dice qué forma tiene lo que se acepta, y lo que no la tiene se
   rechaza con un 400 antes de tocar la base o hacer un hash.

   Sólo la puerta pública, a propósito. Las 115 rutas del portal ya están
   detrás de una sesión y validan lo suyo; ponerles esquemas a todas de
   golpe es un cambio grande que no arregla nada hoy.
   ========================================================================= */

import { z } from "zod";

const texto = (max) => z.string().trim().max(max);

/** El login: correo, contraseña y a dónde volver después. */
export const Login = z.object({
  email: texto(254).toLowerCase().pipe(z.email("Correo no válido")),
  password: z.string().min(1, "Falta la contraseña").max(1024),
  next: texto(512).optional().default(""),
});

/** El segundo factor: seis dígitos o un código de recuperación. */
export const SegundoFactor = z.object({
  code: texto(16).regex(/^(\d{6}|[A-Za-z0-9]{5}-?[A-Za-z0-9]{5})$/, "Código no válido"),
});

/** Lo que ElevenLabs manda al colgar. Sólo lo que se usa; el resto pasa. */
export const PostCallElevenLabs = z.object({
  type: texto(80).optional(),
  data: z.object({
    conversation_id: texto(200).optional(),
    conversation_initiation_client_data: z.object({
      dynamic_variables: z.record(z.string(), z.unknown()).optional(),
    }).loose().optional(),
  }).loose().optional(),
}).loose();

/** Lo que Twilio manda por un WhatsApp o SMS entrante. */
export const MensajeTwilio = z.object({
  MessageSid: texto(64).optional(),
  SmsSid: texto(64).optional(),
  From: texto(64).optional(),
  To: texto(64).optional(),
  Body: z.string().max(4096).optional(),
}).loose();

/**
 * Lee y valida. Devuelve { datos } o { respuesta } con el 400 ya hecho:
 * la ruta hace `if (r.respuesta) return r.respuesta;` y sigue con `r.datos`.
 */
export function validar(esquema, entrada, { mensaje = "Datos no válidos" } = {}) {
  const r = esquema.safeParse(entrada);
  if (r.success) return { datos: r.data };
  const detalle = r.error.issues[0];
  const campo = detalle?.path?.length ? `${detalle.path.join(".")}: ` : "";
  return {
    respuesta: Response.json(
      { success: false, message: `${mensaje} (${campo}${detalle?.message || "forma incorrecta"})` },
      { status: 400 },
    ),
  };
}
