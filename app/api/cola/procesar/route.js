import { requireInternalRequest } from "@/lib/server/internal-api";
import { encolar, tomarTrabajos, terminar, fallar, rescatarColgados, latidoDeLaCola, SinArreglo } from "@/lib/server/cola";
import { colaEnPausa } from "@/lib/server/interruptores";
import { logEvent } from "@/lib/server/observability.mjs";
import { conContexto } from "@/lib/server/contexto.mjs";
import { enviarInforme } from "@/lib/server/informes";
import { pasadaDeMantenimiento } from "@/lib/server/mantenimiento";
import { copiarGrabacion } from "@/lib/server/grabaciones";
import { procesarEvento } from "@/lib/server/bandeja-webhooks";
import { entregarWebhook } from "@/lib/server/webhooks-salientes";
import { clasificarYActuar } from "@/lib/server/clasificacion";
import { barridoDeAutomatismos } from "@/lib/server/automatismos";
import { notificarLlamada } from "@/lib/server/destinatarios";
import { getSupabase } from "@/lib/supabase";

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

  /* Un webhook guardado en la bandeja: ElevenLabs al colgar, un WhatsApp.
     El endpoint sólo verificó la firma y lo guardó; el trabajo de verdad es
     éste, con los reintentos de la cola. */
  webhook: (t) => procesarEvento(t.datos?.evento_id),
  webhook_saliente: (t) => entregarWebhook(t.datos?.entrega_id),
  clasificar_lead: (t) =>
    clasificarYActuar({
      clientId: t.client_id,
      leadId: t.datos?.lead_id,
      nuevo: Boolean(t.datos?.nuevo),
      textoExtra: Array.isArray(t.datos?.texto_extra) ? t.datos.texto_extra : [],
      disparo: t.datos?.disparo || null,
    }),
  automatismos_barrido: () => barridoDeAutomatismos(),
  notificar_llamada: (t) => notificarLlamada({ clientId: t.client_id, callSid: t.datos?.callSid }),

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
  const { error } = await getSupabase().rpc("purgar_seguridad_caducada", { p_lote: 5000 });
  if (error) throw new Error("No se pudo limpiar el estado de seguridad caducado");
  const hoy = new Date().toISOString().slice(0, 10);
  await encolar({
    tipo: "mantenimiento",
    clave: `mantenimiento:${hoy}`,
    unaSolaVez: true,
  });
}

/**
 * El barrido de automatismos se pide cada quince minutos, también solo: la
 * clave lleva el cuarto de hora, así que por muchas pasadas que haya en ese
 * rato entra un barrido. Con el latido de Railway son quince minutos de
 * verdad; con sólo el cron diario de Vercel, uno al día.
 */
async function pedirBarridoDeAutomatismos() {
  const cuarto = Math.floor(Date.now() / (15 * 60 * 1000));
  await encolar({ tipo: "automatismos_barrido", clave: `automatismos_barrido:${cuarto}`, unaSolaVez: true });
}

async function procesar(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    /* Con la plataforma en pausa la cola se queda quieta: los trabajos
       siguen ahí, pendientes, y se procesan cuando se levante la pausa. */
    if (await colaEnPausa()) {
      return Response.json({ success: true, pausado: true, procesados: 0 });
    }

    /* Antes de repartir, se recogen los que se quedaron con un trabajador
       muerto. Si no, se quedarían en 'en_curso' para siempre. */
    const rescatados = await rescatarColgados();

    /* Y se mira si esta pasada llega tarde. Si hay trabajos vencidos desde
       hace más de quince minutos, las pasadas anteriores no ocurrieron: el
       latido de Railway está caído y sólo el cron diario de Vercel ha
       llegado hasta aquí. Se avisa a operaciones —logEvent en nivel error
       manda al webhook— y se sigue procesando, que es lo urgente. */
    const latido = await latidoDeLaCola();
    if (latido.comprobado && latido.pendientesViejos > 0) {
      logEvent("error", "cola.sin_latido", {
        pendientesViejos: latido.pendientesViejos,
        masAntiguoMin: latido.masAntiguoMin,
        palanca: "Mirar el latido en Railway (voice-server.js) y CRON_SECRET",
      });
    }

    /* El mantenimiento no necesita su propio cron: se apunta él mismo, y la
       clave con la fecha hace que sólo entre uno al día por mucho que esta
       ruta se llame cada cinco minutos. */
    await pedirMantenimientoDelDia();
    await pedirBarridoDeAutomatismos();

    const trabajos = await tomarTrabajos({
      cuantos: POR_PASADA,
      trabajador: `vercel-${process.env.VERCEL_REGION || "local"}`,
    });

    const hechos = [];
    const fallidos = [];

    /* Cada trabajo por su cuenta: uno que revienta no se lleva por delante a
       los demás del lote, y uno que se retrasa tampoco los retrasa. */
    const ejecutar = (trabajo) => conContexto(
      { job_id: trabajo.id, job_tipo: trabajo.tipo, client_id: trabajo.client_id || null },
      () => ejecutarTrabajo(trabajo),
    );

    const ejecutarTrabajo = async (trabajo) => {
      const oficio = OFICIOS[trabajo.tipo];

      if (!oficio) {
        /* Un tipo que nadie sabe hacer no se reintenta: reintentarlo cinco
           veces no hará que aparezca la función que falta. */
        await fallar(trabajo, new SinArreglo(`Tipo desconocido: ${trabajo.tipo}`));
        fallidos.push({ id: trabajo.id, motivo: "tipo desconocido", reintenta: false });
        return;
      }

      try {
        /* Un oficio puede devolver un aviso: terminó, pero algo no salió del
           todo bien y hay que poder verlo. */
        const resultado = await oficio(trabajo);
        await terminar(trabajo.id, resultado?.aviso || null);
        hechos.push(trabajo.id);
      } catch (err) {
        const resultado = await fallar(trabajo, err);
        fallidos.push({
          id: trabajo.id,
          motivo: String(err?.message || err).slice(0, 200),
          reintenta: resultado.reintenta,
        });
      }
    };

    /* De tres en tres, no de uno en uno ni los diez a la vez.

       Los trabajos son casi todos espera de red —un informe por correo, una
       copia de grabación, un webhook que habla con OpenAI—, así que en serie
       la pasada tardaba la suma de todas las esperas: Sentry lo marcaba como
       "Consecutive HTTP". Todos a la vez sería peor de otra manera: diez
       trabajos de la misma empresa golpeando al mismo proveedor a la vez es
       justo lo que abre los cortacircuitos. Tres es el punto en que la pasada
       cabe en el tiempo de una función y ningún proveedor lo nota. */
    const A_LA_VEZ = 3;
    for (let i = 0; i < trabajos.length; i += A_LA_VEZ) {
      await Promise.all(trabajos.slice(i, i + A_LA_VEZ).map(ejecutar));
    }

    return Response.json({
      success: true,
      rescatados,
      cogidos: trabajos.length,
      hechos: hechos.length,
      fallidos,
    });
  } catch (error) {
    /* Se registra: una pasada que falla en silencio es una cola parada sin
       que nadie sepa por qué. logEvent en error avisa a operaciones. */
    logEvent("error", "cola.pasada_fallida", { error: String(error?.message || error).slice(0, 300) });
    return Response.json(
      { success: false, message: "Error procesando la cola" },
      { status: 500 }
    );
  }
}

/* Vercel Cron llama con GET y su propio token; los avisos internos con POST.
   El guardia es el mismo para los dos. */
export const GET = procesar;
export const POST = procesar;
