/* =========================================================================
   La bandeja de webhooks.

   Hasta ahora cada webhook —ElevenLabs al colgar, Twilio con un WhatsApp—
   ejecutaba toda su lógica dentro de la petición: buscar el contacto, leer
   el historial, llamar a OpenAI, escribir cuatro tablas, mandar la
   respuesta. Un proveedor lento en medio era un timeout, y un timeout era un
   reintento, y un reintento era más carga sobre lo mismo que ya iba lento.

   Ahora el endpoint hace lo mínimo que exige el proveedor —verificar la
   firma, guardar el evento tal cual, contestar 2xx— y lo demás lo hace la
   cola de trabajos, con sus reintentos y su espera creciente. Un evento que
   agota los reintentos queda en 'fallido' con su error y se ve y se
   reintenta desde administración: nunca desaparece en silencio.

   La idempotencia vive en dos capas: (proveedor, evento_id) es único aquí,
   así que la misma entrega dos veces es una fila; y el procesado reclama el
   evento con reclamar_webhook() antes de tener efectos, así que reprocesar
   un evento desde administración no repite lo que ya surtió efecto.

   Stripe NO pasa por aquí todavía. Su webhook activa el plan de quien acaba
   de pagar y eso tiene que ser inmediato; ya es idempotente y ya prioriza lo
   esencial. Cuando haya volumen, se traerá.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { encolar } from "@/lib/server/cola";

/**
 * Guarda un evento verificado y lo pone en la cola.
 *
 * Devuelve { id, encolado }. Si el mismo (proveedor, evento_id) ya estaba,
 * devuelve la fila existente y encolado=false: es una entrega repetida.
 */
export async function guardarEvento({ proveedor, tipo = null, eventoId = null, clientId = null, payload = {} }) {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("webhook_events")
    .upsert(
      { proveedor, tipo, evento_id: eventoId, client_id: clientId, payload },
      { onConflict: "proveedor,evento_id", ignoreDuplicates: true },
    )
    .select("id, estado")
    .maybeSingle();

  if (error) throw new Error(error.message || "No se pudo guardar el evento");

  /* Con ignoreDuplicates, una fila repetida no devuelve nada: se busca. */
  if (!data) {
    const { data: existente } = await supabase
      .from("webhook_events").select("id, estado").eq("proveedor", proveedor).eq("evento_id", eventoId).maybeSingle();
    return { id: existente?.id || null, encolado: false, repetido: true };
  }

  const trabajo = await encolar({
    tipo: "webhook",
    clientId,
    datos: { evento_id: data.id, proveedor },
    clave: `webhook:${data.id}`,
    unaSolaVez: true,
  });

  await supabase.from("webhook_events").update({ trabajo_id: trabajo?.id || null }).eq("id", data.id);
  return { id: data.id, encolado: true };
}

/** Quién procesa cada proveedor. Se importa en diferido para no arrastrar
    el módulo entero de WhatsApp —con su cliente de OpenAI— a la cola cuando
    no toca. */
const PROCESADORES = {
  elevenlabs: async (payload) => {
    const { persistElevenLabsCall } = await import("@/lib/server/elevenlabs");
    return persistElevenLabsCall({ payload });
  },
  "twilio-whatsapp": async (payload) => {
    const { procesarMensajeEntrante } = await import("@/app/api/whatsapp/webhook/route");
    return procesarMensajeEntrante(payload);
  },
};

/**
 * Procesa un evento guardado. Lo llama la cola.
 *
 * Marca en_curso → procesado, o deja el error y el número de intentos si
 * falla, y vuelve a lanzar para que la cola decida si reintenta.
 */
export async function procesarEvento(eventoId) {
  const supabase = getSupabase();
  const { data: evento, error } = await supabase
    .from("webhook_events").select("*").eq("id", eventoId).maybeSingle();
  if (error) throw new Error(error.message || "No se pudo leer el evento");
  if (!evento) throw new Error(`El evento ${eventoId} no existe`);
  if (evento.estado === "procesado") return { yaProcesado: true };

  const procesar = PROCESADORES[evento.proveedor];
  if (!procesar) throw new Error(`Sin procesador para el proveedor ${evento.proveedor}`);

  await supabase.from("webhook_events")
    .update({ estado: "en_curso", intentos: (evento.intentos || 0) + 1 })
    .eq("id", eventoId);

  try {
    const resultado = await procesar(evento.payload);
    await supabase.from("webhook_events")
      .update({ estado: "procesado", procesado_en: new Date().toISOString(), ultimo_error: null })
      .eq("id", eventoId);
    return resultado;
  } catch (err) {
    await supabase.from("webhook_events")
      .update({ estado: "fallido", ultimo_error: String(err?.message || err).slice(0, 500) })
      .eq("id", eventoId);
    throw err;
  }
}

/** Devuelve un evento fallido a la cola. Desde administración. */
export async function reintentarEvento(eventoId) {
  const supabase = getSupabase();
  const { data: evento, error } = await supabase
    .from("webhook_events").select("id, proveedor, client_id, estado").eq("id", eventoId).maybeSingle();
  if (error || !evento) throw new Error(error?.message || "El evento no existe");
  if (evento.estado === "procesado") return { reintentado: false, motivo: "ya procesado" };

  await supabase.from("webhook_events").update({ estado: "pendiente", ultimo_error: null }).eq("id", eventoId);
  const trabajo = await encolar({
    tipo: "webhook",
    clientId: evento.client_id,
    datos: { evento_id: evento.id, proveedor: evento.proveedor, reintento: true },
    clave: `webhook:${evento.id}`,
    unaSolaVez: true,
  });
  await supabase.from("webhook_events").update({ trabajo_id: trabajo?.id || null }).eq("id", eventoId);
  return { reintentado: true, trabajo: trabajo?.id || null };
}

/** Los eventos que no han salido bien, para la vista de administración. */
export async function eventosFallidos({ proveedor = null, cuantos = 100 } = {}) {
  let q = getSupabase().from("webhook_events")
    .select("id, proveedor, tipo, evento_id, client_id, estado, intentos, recibido_en, procesado_en, ultimo_error")
    .in("estado", ["fallido", "muerto"]);
  if (proveedor) q = q.eq("proveedor", proveedor);
  const { data, error } = await q.order("recibido_en", { ascending: false }).limit(cuantos);
  if (error) throw new Error(error.message || "No se pudieron leer los eventos");
  return data || [];
}
