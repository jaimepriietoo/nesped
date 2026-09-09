import { requireInternalRequest } from "@/lib/server/internal-api";
import { encolar, tomarTrabajos, terminar, fallar, rescatarColgados, SinArreglo } from "@/lib/server/cola";
import { enviarInforme } from "@/lib/server/informes";
import { pasadaDeMantenimiento } from "@/lib/server/mantenimiento";
import { copiarGrabacion } from "@/lib/server/grabaciones";

/**
 * El que ejecuta la cola.
 *
 * Se llama desde fuera cada pocos minutos y hace un lote. No intenta vaciar la
 * cola de una vez a propósito: una función de Vercel tiene el tiempo contado,
 * y un lote pequeño que termina siempre vale más que uno grande que a veces
 * se corta a la mitad. Lo que quede sigue ahí para la siguiente pasada.
 *
 * Sólo desde dentro, con el token interno: aquí se manda correo.
 */

/** Cuántos trabajos por pasada. Cabe de sobra en el tiempo de una función. */
const POR_PASADA = 10;

/**
 * Qué sabe hacer el trabajador.
 *
 * Cada tipo es una función que recibe el trabajo y hace lo suyo. Si lanza, la
 * cola lo reintenta con espera; si vuelve, queda hecho.
 */
const OFICIOS = {
  informe_diario: (t) =>
    enviarInforme({
      tipo: "diario",
      clientId: t.client_id,
      paraSiNoHay: t.datos?.paraSiNoHay || null,
    }),

  informe_semanal: (t) =>
    enviarInforme({
      tipo: "semanal",
      clientId: t.client_id,
      paraSiNoHay: t.datos?.paraSiNoHay || null,
    }),

  /**
   * Traerse una grabación a casa.
   *
   * No se hace en el aviso del proveedor porque descargar un audio y volver a
   * subirlo tarda, y el proveedor espera una respuesta rápida a su webhook: si
   * tarda, lo reintenta, y la grabación se copia dos veces.
   */
  copiar_grabacion: (t) =>
    copiarGrabacion({
      callSid: t.datos?.callSid,
      clientId: t.client_id,
    }),

  /**
   * Mover lo viejo al archivo y pasar la retención.
   *
   * Se corta solo a los veinte segundos y, si queda trabajo, se vuelve a
   * encolar. Así una primera limpieza de millones de filas no depende de que
   * una función aguante diez minutos: son muchas pasadas cortas, y entre
   * ellas caben los trabajos que sí tiene alguien esperando.
   *
   * La continuación va SIN clave a propósito. Con clave chocaría contra el
   * trabajo que la está encolando, que en ese momento sigue en curso, y la
   * cadena se cortaría en silencio en la primera vuelta.
   */
  mantenimiento: async () => {
    const { quedaTrabajo, retencion } = await pasadaDeMantenimiento();
    if (quedaTrabajo) await encolar({ tipo: "mantenimiento" });

    /* La retención no puede tumbar el archivado —son cosas distintas que
       casualmente se hacen a la vez—, pero si falla tiene que verse. Un
       trabajo verde que esconde que la mitad no se hizo es peor que uno rojo:
       nadie mira lo que ya está en verde. */
    if (retencion?.error) return { aviso: `La retención falló: ${retencion.error}` };
    return null;
  },
};

/** El mantenimiento se pide una vez al día, y se pide solo. */
async function pedirMantenimientoDelDia() {
  const hoy = new Date().toISOString().slice(0, 10);
  await encolar({
    tipo: "mantenimiento",
    clave: `mantenimiento:${hoy}`,
    unaSolaVez: true,
  });
}

async function procesar(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    /* Antes de repartir, se recogen los que se quedaron con un trabajador
       muerto. Si no, se quedarían en 'en_curso' para siempre. */
    const rescatados = await rescatarColgados();

    /* El mantenimiento no necesita su propio cron: se apunta él mismo, y la
       clave con la fecha hace que sólo entre uno al día por mucho que esta
       ruta se llame cada cinco minutos. */
    await pedirMantenimientoDelDia();

    const trabajos = await tomarTrabajos({
      cuantos: POR_PASADA,
      trabajador: `vercel-${process.env.VERCEL_REGION || "local"}`,
    });

    const hechos = [];
    const fallidos = [];

    for (const trabajo of trabajos) {
      const oficio = OFICIOS[trabajo.tipo];

      if (!oficio) {
        /* Un tipo que nadie sabe hacer no se reintenta: reintentarlo cinco
           veces no hará que aparezca la función que falta. */
        await fallar(trabajo, new SinArreglo(`Tipo desconocido: ${trabajo.tipo}`));
        fallidos.push({ id: trabajo.id, motivo: "tipo desconocido", reintenta: false });
        continue;
      }

      try {
        /* Un oficio puede devolver un aviso: terminó, pero algo no salió del
           todo bien y hay que poder verlo. */
        const resultado = await oficio(trabajo);
        await terminar(trabajo.id, resultado?.aviso || null);
        hechos.push(trabajo.id);
      } catch (err) {
        /* Un trabajo que revienta no puede llevarse por delante a los demás
           del lote. Se anota y se sigue. */
        const resultado = await fallar(trabajo, err);
        fallidos.push({
          id: trabajo.id,
          motivo: String(err?.message || err).slice(0, 200),
          reintenta: resultado.reintenta,
        });
      }
    }

    return Response.json({
      success: true,
      rescatados,
      cogidos: trabajos.length,
      hechos: hechos.length,
      fallidos,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error?.message || "Error procesando la cola" },
      { status: 500 }
    );
  }
}

/* Vercel Cron llama con GET y su propio token; los avisos internos con POST.
   El guardia es el mismo para los dos. */
export const GET = procesar;
export const POST = procesar;
