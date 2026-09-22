/* =========================================================================
   Pedir y hacer la clasificación de un contacto.

   Los webhooks no clasifican: piden (pedirClasificacion) y la cola hace
   (clasificarYActuar). Así una llamada a OpenAI lenta nunca retrasa la
   respuesta a ElevenLabs o a Twilio, y si falla, la cola reintenta.

   clasificarYActuar es la secuencia entera: clasificar, y después los
   automatismos, con lead.nuevo primero si el contacto acaba de crearse y
   lead.clasificado después. Los correos a departamentos son uno de esos
   automatismos (notificar_departamentos, activo por defecto).
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { encolar } from "@/lib/server/cola";
import { clasificarLead, departamentosDeEmpresa } from "@/lib/server/departamentos";
import { ejecutarAutomatismos } from "@/lib/server/automatismos";
import { combinarDatosDeLlamada } from "@/lib/server/destinatarios";
import { logErrorSeguro } from "@/lib/server/observability.mjs";

/** Encola la clasificación. Nunca lanza: un webhook no puede caer por esto. */
export async function pedirClasificacion({
  clientId, leadId, nuevo = false, textoExtra = [], disparo = null,
  callSid = "", aislarLlamada = false,
}) {
  if (!clientId || !leadId) return null;
  try {
    const { id } = await encolar({
      tipo: "clasificar_lead",
      clientId,
      datos: {
        lead_id: leadId,
        nuevo: Boolean(nuevo),
        texto_extra: textoExtra.slice(0, 5).map((t) => String(t || "").slice(0, 2000)),
        disparo,
        call_sid: String(callSid || "").slice(0, 200),
        aislar_llamada: Boolean(aislarLlamada),
      },
    });
    return id;
  } catch (err) {
    logErrorSeguro("classification.enqueue_failed", err);
    return null;
  }
}

/** Lo hace la cola. Devuelve la clasificación y lo que hicieron los automatismos. */
export async function clasificarYActuar({
  clientId, leadId, nuevo = false, textoExtra = [], disparo = null,
  callSid = "", aislarLlamada = false, supabase = getSupabase(),
}) {
  const clasificacion = await clasificarLead({
    clientId, leadId, textoExtra, soloTextoExtra: aislarLlamada, supabase,
  });
  const { lista } = await departamentosDeEmpresa(clientId, supabase);
  clasificacion.nombreDepartamento = lista.find((d) => d.clave === clasificacion.departamento)?.nombre || clasificacion.departamento;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("client_id", clientId).maybeSingle();
  if (!lead) return { clasificacion, automatismos: [] };

  let contextoLlamada = null;
  if (aislarLlamada && callSid) {
    const [{ data: llamada }, { data: eventos }] = await Promise.all([
      supabase.from("calls").select("*").eq("client_id", clientId).eq("call_sid", callSid).maybeSingle(),
      supabase.from("lead_events").select("meta,created_at")
        .eq("client_id", clientId).eq("type", "datos_de_llamada")
        .filter("meta->>conversation_id", "eq", callSid).order("created_at", { ascending: true }),
    ]);
    contextoLlamada = {
      callSid,
      llamada: llamada || null,
      dicho: combinarDatosDeLlamada(eventos || []),
      nombreConocido: lead.nombre || "",
    };
    const { error: errorEvento } = await supabase.from("lead_events").insert({
      client_id: clientId,
      lead_id: leadId,
      type: "clasificacion_de_llamada",
      title: "Clasificación de la llamada",
      description: String(clasificacion.motivo || "").slice(0, 300),
      meta: {
        conversation_id: callSid,
        departamento: clasificacion.departamento || null,
        nombre_departamento: clasificacion.nombreDepartamento || null,
        motivo: String(clasificacion.motivo || "").slice(0, 300),
        senales: clasificacion.senales || {},
      },
    });
    if (errorEvento) logErrorSeguro("classification.call_snapshot_failed", errorEvento);
  }

  const hechos = [];
  if (nuevo) hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "lead.nuevo", lead, clasificacion, contextoLlamada, supabase }));
  if (disparo === "mensaje.entrante") hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "mensaje.entrante", lead, clasificacion, contextoLlamada, supabase }));
  if (clasificacion.fuente !== "ninguna") hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "lead.clasificado", lead, clasificacion, contextoLlamada, supabase }));
  return { clasificacion, automatismos: hechos };
}
