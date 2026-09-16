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

/** Encola la clasificación. Nunca lanza: un webhook no puede caer por esto. */
export async function pedirClasificacion({ clientId, leadId, nuevo = false, textoExtra = [], disparo = null }) {
  if (!clientId || !leadId) return null;
  try {
    const { id } = await encolar({
      tipo: "clasificar_lead",
      clientId,
      datos: { lead_id: leadId, nuevo: Boolean(nuevo), texto_extra: textoExtra.slice(0, 5).map((t) => String(t || "").slice(0, 2000)), disparo },
    });
    return id;
  } catch (err) {
    console.error("[clasificacion] no se pudo encolar:", err?.message || err);
    return null;
  }
}

/** Lo hace la cola. Devuelve la clasificación y lo que hicieron los automatismos. */
export async function clasificarYActuar({ clientId, leadId, nuevo = false, textoExtra = [], disparo = null, supabase = getSupabase() }) {
  const clasificacion = await clasificarLead({ clientId, leadId, textoExtra, supabase });
  const { lista } = await departamentosDeEmpresa(clientId, supabase);
  clasificacion.nombreDepartamento = lista.find((d) => d.clave === clasificacion.departamento)?.nombre || clasificacion.departamento;

  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).eq("client_id", clientId).maybeSingle();
  if (!lead) return { clasificacion, automatismos: [] };

  const hechos = [];
  if (nuevo) hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "lead.nuevo", lead, clasificacion, supabase }));
  if (disparo === "mensaje.entrante") hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "mensaje.entrante", lead, clasificacion, supabase }));
  if (clasificacion.fuente !== "ninguna") hechos.push(...await ejecutarAutomatismos({ clientId, disparo: "lead.clasificado", lead, clasificacion, supabase }));
  return { clasificacion, automatismos: hechos };
}
