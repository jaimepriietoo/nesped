import { getPortalContext } from "@/lib/portal-auth";
import { encolar } from "@/lib/server/cola";

/**
 * Pedir el informe semanal.
 *
 * Antes esta ruta hacía el informe entero mientras el navegador esperaba:
 * leía la cartera completa de la empresa, la contaba en memoria, redactaba el
 * correo y aguardaba a que Resend lo aceptara. Si algo tardaba, Vercel cortaba
 * la función y el informe se perdía: sin reintento, sin rastro, y con quien lo
 * pidió mirando un error sin saber si el correo había salido.
 *
 * Ahora sólo lo apunta en la cola. El trabajo lo hace /api/cola/procesar, que
 * cuenta en la base de datos y reintenta si el proveedor falla.
 */
export async function POST() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });

    /* La clave lleva la fecha: pulsar el botón cinco veces la misma mañana no
       manda cinco correos, y mañana sí se puede volver a pedir. */
    const hoy = new Date().toISOString().slice(0, 10);

    const { yaEstaba } = await encolar({
      tipo: "informe_semanal",
      clientId: ctx.clientId,
      datos: { paraSiNoHay: ctx.userEmail || null },
      clave: `informe_semanal:${ctx.clientId}:${hoy}`,
    });

    return Response.json({
      success: true,
      message: yaEstaba
        ? "Ya lo tenías pedido: te llegará en unos minutos."
        : "Informe pedido. Te llega al correo en unos minutos.",
    });
  } catch (err) {
    return Response.json({ success: false, message: err.message }, { status: 500 });
  }
}
