import { getResend } from "@/lib/resend";
import { remitenteNesped } from "@/lib/server/remitente.mjs";
import { conCortacircuitos } from "@/lib/server/cortacircuitos";

/**
 * Una sola puerta para el correo saliente.
 *
 * Existe por dos motivos, y el segundo es el que de verdad importa.
 *
 * EL PRIMERO: el cortacircuitos. Si Resend se cae, la cola reintenta, los
 * barridos reintentan, y cada reintento es una petición más contra un servicio
 * que ya está de rodillas. Con la llamada repartida por cinco ficheros no hay
 * dónde poner el freno; con una sola, sí.
 *
 * EL SEGUNDO: el SDK de Resend NO lanza cuando falla el envío. Devuelve un
 * objeto con `error` dentro y el programa sigue tan contento. Esto:
 *
 *     await resend.emails.send(mensaje);
 *
 * parece que manda un correo y puede no mandar nada, sin dar un solo aviso.
 * Dos de los cinco sitios que llamaban a Resend no miraban ese `error`. Y un
 * fallo que no se mira tampoco cuenta para el cortacircuitos: el contador se
 * quedaría a cero mientras no sale ni un correo.
 *
 * Aquí se mira siempre, y un envío fallido lanza.
 */

/** Falló el envío. Lleva dentro lo que dijo el proveedor. */
export class ErrorDeCorreo extends Error {
  constructor(mensaje, detalle) {
    super(mensaje);
    this.name = "ErrorDeCorreo";
    this.detalle = detalle || null;
  }
}

/**
 * Manda un correo.
 *
 * @param quienEspera  "persona" si hay alguien mirando la pantalla ahora
 *   mismo —el código de acceso al entrar—, "nadie" para trabajos de fondo.
 *   Con "persona" se intenta aunque el circuito esté abierto: esa petición no
 *   es una tormenta, y dejar a alguien fuera de su cuenta porque el proveedor
 *   va lento es peor que hacerle una llamada de más.
 * @returns El identificador que da Resend, para poder buscarlo luego.
 */
export async function enviarCorreo({ quienEspera = "nadie", ...mensaje }) {
  return conCortacircuitos({ proveedor: "resend", quienEspera }, async () => {
    const resultado = await getResend().emails.send({
      from: remitenteNesped(),
      ...mensaje,
    });

    if (resultado?.error) {
      throw new ErrorDeCorreo(
        resultado.error.message || "No se pudo enviar el correo",
        {
          name: resultado.error.name || "ResendError",
          message: resultado.error.message || "",
        }
      );
    }

    return resultado?.data?.id || resultado?.id || "";
  });
}
