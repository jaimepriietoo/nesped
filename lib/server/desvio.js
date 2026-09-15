/* =========================================================================
   Desviar el número al teléfono del cliente.

   La única mitigación real cuando ElevenLabs se cae: el teléfono suena y
   nadie contesta, y eso el cliente lo nota al instante. Hasta ahora era
   "entrar en la consola de Twilio y cambiarlo a mano"; ahora es un botón
   en administración que hace lo mismo con la API y se acuerda de cómo
   estaba para deshacerlo.

   Cómo: el número de Twilio de la empresa (clients.twilio_number) pasa a
   apuntar a /api/voice/desvio?empresa=…, que contesta un TwiML con
   <Dial>telefono_desvio</Dial>. Se guarda la URL anterior en la empresa y
   al quitar el desvío se restaura tal cual. Todo queda en audit_logs.

   Hoy no hay ningún número contratado, así que `desviar()` sólo tiene
   sentido cuando lo haya; el código está para que ese día sea un botón y
   no una madrugada en la consola de Twilio.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { normalizePhone, numeroDeTwilio, apuntarNumeroDeTwilio } from "@/lib/server/twilio";

function urlBase() {
  return String(process.env.BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "");
}

export function urlDeDesvio(clientId) {
  return `${urlBase()}/api/voice/desvio?empresa=${encodeURIComponent(clientId)}`;
}

/** El estado del desvío de una empresa. */
export async function estadoDelDesvio(clientId) {
  const { data, error } = await getSupabase().from("clients")
    .select("id, twilio_number, telefono_desvio, desvio_activo, desvio_cambiado_en").eq("id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("La empresa no existe");
  return data;
}

/**
 * Activa el desvío. Comprueba que hay número y teléfono, apunta el número
 * de Twilio a nuestro TwiML y guarda cómo estaba.
 */
export async function desviar(clientId, { telefono = null, actor = "admin" } = {}) {
  const supabase = getSupabase();
  const empresa = await estadoDelDesvio(clientId);
  const destino = normalizePhone(telefono || empresa.telefono_desvio || "");
  if (!destino) throw new Error("La empresa no tiene teléfono de desvío");
  if (!empresa.twilio_number) throw new Error("La empresa no tiene número de Twilio");

  const numero = await numeroDeTwilio(empresa.twilio_number);
  if (!numero) throw new Error(`El número ${empresa.twilio_number} no está en la cuenta de Twilio`);

  const nuestra = urlDeDesvio(clientId);
  /* Si ya apuntaba a nosotros (desvío activo), no se pisa la URL anterior. */
  const anterior = numero.voiceUrl === nuestra ? undefined : numero.voiceUrl;

  await apuntarNumeroDeTwilio(numero.sid, { voiceUrl: nuestra, voiceMethod: "POST" });

  const cambios = { telefono_desvio: destino, desvio_activo: true, desvio_cambiado_en: new Date().toISOString() };
  if (anterior !== undefined) cambios.desvio_voice_url_anterior = anterior;
  const { error } = await supabase.from("clients").update(cambios).eq("id", clientId);
  if (error) throw new Error(error.message);

  await supabase.from("audit_logs").insert({
    client_id: clientId, entity_type: "desvio", entity_id: empresa.twilio_number,
    action: "desvio_activado", actor, changes: { a: destino, anterior: anterior ?? "(ya desviado)" },
  });
  return { activo: true, telefono: destino };
}

/** Quita el desvío: el número vuelve a apuntar a donde apuntaba. */
export async function quitarDesvio(clientId, { actor = "admin" } = {}) {
  const supabase = getSupabase();
  const { data: empresa, error } = await supabase.from("clients")
    .select("id, twilio_number, desvio_activo, desvio_voice_url_anterior").eq("id", clientId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!empresa) throw new Error("La empresa no existe");
  if (!empresa.desvio_activo) return { activo: false, motivo: "no estaba desviado" };

  const numero = empresa.twilio_number ? await numeroDeTwilio(empresa.twilio_number) : null;
  if (numero) {
    await apuntarNumeroDeTwilio(numero.sid, { voiceUrl: empresa.desvio_voice_url_anterior || "", voiceMethod: "POST" });
  }
  await supabase.from("clients").update({ desvio_activo: false, desvio_cambiado_en: new Date().toISOString() }).eq("id", clientId);
  await supabase.from("audit_logs").insert({
    client_id: clientId, entity_type: "desvio", entity_id: empresa.twilio_number || "",
    action: "desvio_quitado", actor, changes: { restaurado: empresa.desvio_voice_url_anterior || "" },
  });
  return { activo: false, restaurado: empresa.desvio_voice_url_anterior || "" };
}

/** El TwiML que atiende una llamada desviada. */
export function twimlDeDesvio(telefono) {
  const seguro = String(telefono || "").replace(/[^\d+]/g, "");
  if (!seguro) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-ES">Ahora mismo no podemos atender la llamada. Inténtelo más tarde.</Say></Response>`;
  }
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Dial timeout="25">${seguro}</Dial></Response>`;
}
