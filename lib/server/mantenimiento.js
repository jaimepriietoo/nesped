import { getSupabase } from "@/lib/supabase";
import { runComplianceRetentionSweep } from "@/lib/server/compliance.mjs";
import { verificarCadenaAuditoria } from "@/lib/server/auditoria-cadena";
import { evaluarAnomalias } from "@/lib/server/anomalias";

/**
 * El mantenimiento diario: mover lo viejo y cumplir la retención.
 *
 * Dos tablas crecen y no paran: lead_events, con una fila por cada cosa que le
 * pasa a un contacto, y audit_logs, con una por cada acción con consecuencias.
 * Nadie las borra porque nadie quiere ser quien borró el rastro.
 *
 * El problema no es el espacio, que es barato. Es que toda consulta sobre esas
 * tablas tiene que pasar por índices que cada mes son más grandes, y esos
 * índices compiten por la memoria con las consultas que sí atienden a alguien.
 *
 * Lo antiguo se mueve a una tabla gemela sin índices. No se borra: sigue ahí
 * si alguien pregunta, y consultarla es lento, que es exactamente lo que se
 * quiere de un archivo.
 *
 * Y aprovecha para pasar la retención de grabaciones y transcripciones, que
 * estaba escrita desde hace tiempo dentro de /api/nightly. Esa ruta no la
 * llama nadie —no hay ningún cron apuntando a ella—, así que esa retención
 * nunca se ha ejecutado sola. Estaba en el código y no en la realidad.
 */

/** Cuántas filas se mueven de una vez. Ver el comentario de la migración. */
const LOTE = 1000;

/**
 * Cuánto puede durar una pasada, en milisegundos.
 *
 * El trabajo se corta solo al llegar aquí y se vuelve a encolar. Así una
 * primera limpieza de diez millones de filas no depende de que una función
 * aguante diez minutos: son muchas pasadas cortas, y entre ellas caben los
 * trabajos que sí tiene alguien esperando.
 */
const PRESUPUESTO_MS = 20_000;

/** Días que una fila se queda en la tabla viva. */
function plazos() {
  const numero = (valor, porDefecto) => {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : porDefecto;
  };

  return {
    /* Medio año de historial de contacto cubre de sobra lo que se mira a
       diario: el recorrido reciente y el seguimiento en curso. */
    eventos: numero(process.env.ARCHIVO_EVENTOS_DIAS, 180),
    /* Un año para la auditoría, que es lo que se suele pedir cuando se pide. */
    auditoria: numero(process.env.ARCHIVO_AUDITORIA_DIAS, 365),
    /* Y del archivo se borra a los tres años. Es la única cifra de aquí que
       es una decisión legal y no técnica. */
    purga: numero(process.env.PURGA_ARCHIVO_DIAS, 1095),
    /* La cola es otra cosa: el histórico de "este informe salió bien hace ocho
       meses" no le sirve a nadie. Lo que importa —qué se envió y a quién— vive
       en los datos, no en la cola. Un mes basta para investigar algo raro. */
    trabajos: numero(process.env.PURGA_TRABAJOS_DIAS, 30),
  };
}

/**
 * Hace una pasada de mantenimiento.
 *
 * @returns {{quedaTrabajo: boolean, movidas: object, retencion: object|null}}
 *   `quedaTrabajo` dice si hay que volver a encolarlo.
 */
export async function pasadaDeMantenimiento() {
  const supabase = getSupabase();
  const { eventos, auditoria, purga, trabajos } = plazos();
  const hasta = Date.now() + PRESUPUESTO_MS;

  const movidas = { eventos: 0, auditoria: 0, purgadas: 0, trabajosBorrados: 0, seguridadBorrada: 0, webhooksBorrados: 0 };
  let quedaTrabajo = false;

  /* Cada llamada mueve como mucho un lote. Si devuelve el lote entero es que
     quedan más, y se sigue mientras haya tiempo. */
  const mover = async (funcion, dias, cuenta) => {
    while (Date.now() < hasta) {
      const { data, error } = await supabase.rpc(funcion, { p_dias: dias, p_lote: LOTE });
      if (error) throw new Error(error.message || `Falló ${funcion}`);

      const n = Number(data || 0);
      movidas[cuenta] += n;

      if (n < LOTE) return false;
    }
    /* Se acabó el tiempo con el lote lleno: seguro que queda. */
    return true;
  };

  quedaTrabajo = (await mover("archivar_lead_events", eventos, "eventos")) || quedaTrabajo;
  quedaTrabajo = (await mover("archivar_audit_logs", auditoria, "auditoria")) || quedaTrabajo;

  /* La purga va la última y sólo con el tiempo que sobre: es la única que
     borra de verdad, y si un día no llega a ejecutarse no pasa nada. */
  if (Date.now() < hasta) {
    for (const tabla of ["lead_events_archivo", "audit_logs_archivo"]) {
      const { data, error } = await supabase.rpc("purgar_archivo", {
        p_tabla: tabla,
        p_dias: purga,
        p_lote: LOTE,
      });
      if (error) throw new Error(error.message || `Falló la purga de ${tabla}`);
      movidas.purgadas += Number(data || 0);
    }
  }

  /* La cola también crece y nada la limpiaba. Se hizo en la fase 2 sin
     acordarse de esto, y se arregló al revisar antes de desplegar. */
  if (Date.now() < hasta) {
    const { data, error } = await supabase.rpc("purgar_trabajos", {
      p_dias: trabajos,
      p_lote: LOTE,
    });
    if (error) throw new Error(error.message || "Falló la purga de trabajos");
    movidas.trabajosBorrados = Number(data || 0);
  }

  /* Las tablas de seguridad —ventanas de límite de peticiones y retos de
     segundo factor— reciben una fila por intento y no las limpiaba nadie.
     Vencidas no valen nada; con tráfico son las que más deprisa crecen. */
  if (Date.now() < hasta) {
    const { data, error } = await supabase.rpc("purgar_seguridad_caducada", { p_lote: LOTE });
    if (error) throw new Error(error.message || "Falló la purga de seguridad");
    movidas.seguridadBorrada = Number(data || 0);
    const denegados = await supabase.rpc("purgar_accesos_denegados", { p_lote: LOTE });
    if (denegados.error) throw new Error(denegados.error.message || "Falló la purga de accesos denegados");
    movidas.denegadosBorrados = Number(denegados.data || 0);
    /* Las sesiones que llevan más de ocho días sin usarse ya no pueden valer. */
    const sesiones = await supabase.rpc("purgar_sesiones_caducadas", { p_lote: LOTE });
    if (sesiones.error) throw new Error(sesiones.error.message || "Falló la purga de sesiones");
    movidas.sesionesBorradas = Number(sesiones.data || 0);
  }

  /* La bandeja de webhooks guarda el payload entero —con teléfonos y texto
     de mensajes— porque hace falta para procesarlo. Lo procesado se va a los
     treinta días; lo que falló se queda hasta que alguien lo mire. */
  if (Date.now() < hasta) {
    const { data, error } = await supabase.rpc("purgar_webhook_events", { p_dias: 30, p_lote: LOTE });
    if (error) throw new Error(error.message || "Falló la purga de webhooks");
    movidas.webhooksBorrados = Number(data || 0);
    const entregas = await supabase.rpc("purgar_webhook_entregas", { p_dias: 30, p_lote: LOTE });
    if (entregas.error) throw new Error(entregas.error.message || "Falló la purga de entregas");
    movidas.entregasBorradas = Number(entregas.data || 0);
  }

  /* La retención de grabaciones y transcripciones. Iba dentro de /api/nightly,
     que no llama nadie. */
  let retencion = null;
  try {
    retencion = await runComplianceRetentionSweep();
  } catch (err) {
    /* No puede llevarse por delante al archivado: son cosas distintas que
       casualmente se hacen a la vez. */
    retencion = { error: String(err?.message || err).slice(0, 200) };
  }

  /* Y de paso, que nadie haya tocado la auditoría: la cadena de hashes se
     recorre entera en Postgres y las últimas filas se recalculan aquí. Si
     algo no cuadra, el error dispara la alerta operativa. */
  let cadena = null;
  try {
    cadena = await verificarCadenaAuditoria();
  } catch (err) {
    cadena = { intacta: false, error: String(err?.message || err).slice(0, 200) };
  }

  /* Y mirar la auditoría del día en busca de comportamiento raro. Nunca
     lanza: si el correo o una tabla fallan, queda en el log. */
  let anomalias = null;
  try {
    anomalias = await evaluarAnomalias();
  } catch (err) {
    anomalias = { errores: 1, error: String(err?.message || err).slice(0, 200) };
  }

  return { quedaTrabajo, movidas, retencion, cadena, anomalias };
}

export const PARA_PRUEBAS = { LOTE, PRESUPUESTO_MS, plazos };
