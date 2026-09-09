import { requireInternalRequest } from "@/lib/server/internal-api";
import { tomarTrabajos, terminar, fallar, rescatarColgados } from "@/lib/server/cola";
import { enviarInforme } from "@/lib/server/informes";

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
};

async function procesar(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    /* Antes de repartir, se recogen los que se quedaron con un trabajador
       muerto. Si no, se quedarían en 'en_curso' para siempre. */
    const rescatados = await rescatarColgados();

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
        await fallar({ ...trabajo, intentos: 99 }, `Tipo desconocido: ${trabajo.tipo}`);
        fallidos.push({ id: trabajo.id, motivo: "tipo desconocido" });
        continue;
      }

      try {
        await oficio(trabajo);
        await terminar(trabajo.id);
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
