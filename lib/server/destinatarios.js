/* =========================================================================
   A quién se le manda cada contacto.

   El owner define personas —nombre, correo, cargo, departamentos que
   atienden, si reciben copia de todo— y cuando un contacto queda
   clasificado, el aviso llega a quien toca: quienes atienden ese
   departamento, quienes reciben todo, y, si el contacto es importante,
   quienes atienden Dirección. Cada intento se apunta en notificaciones_lead,
   salga o no, con el error si lo hubo.

   En pruebas no sale ningún correo: NESPED_SIN_CORREO=si o NODE_ENV=test lo
   dejan apuntado como 'omitido' con el motivo. Que una prueba mande un
   correo real a una persona real es exactamente lo que no puede pasar.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";
import { enviarCorreo } from "@/lib/server/correo";
import { logErrorSeguro } from "@/lib/server/observability.mjs";

export function correoDesactivado(env = process.env) {
  return env.NODE_ENV === "test" || String(env.NESPED_SIN_CORREO || "").toLowerCase() === "si" || !env.RESEND_API_KEY;
}

/**
 * Quién debe recibir un contacto. Pura: se prueba sin base de datos.
 *
 * @param destinatarios filas de la tabla (activos o no)
 * @param departamento  clave del departamento del contacto (o null)
 * @param importante    si la IA lo marcó como asunto de dirección
 * @returns [{ destinatario, motivo }] sin repetidos por correo
 */
export function seleccionarDestinatarios(destinatarios, { departamento = null, importante = false } = {}) {
  const elegidos = new Map();
  const añadir = (d, motivo) => {
    const clave = String(d.email || "").trim().toLowerCase();
    if (!clave || elegidos.has(clave)) return;
    elegidos.set(clave, { destinatario: d, motivo });
  };
  for (const d of destinatarios || []) {
    if (d.activo === false) continue;
    const suyos = (d.departamentos || []).map((x) => String(x).toLowerCase());
    if (departamento && suyos.includes(String(departamento).toLowerCase())) añadir(d, `departamento:${departamento}`);
  }
  for (const d of destinatarios || []) {
    if (d.activo === false) continue;
    if (d.recibe_todo) añadir(d, "copia_de_todo");
  }
  if (importante) {
    for (const d of destinatarios || []) {
      if (d.activo === false) continue;
      const suyos = (d.departamentos || []).map((x) => String(x).toLowerCase());
      if (suyos.includes("direccion")) añadir(d, "direccion:importante");
    }
  }
  return [...elegidos.values()];
}

function escapar(t) {
  return String(t ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** El correo que recibe una persona por un contacto. Sobrio y completo. */
export function correoDeLead({ empresa, lead, clasificacion, destinatario, urlPortal }) {
  const nombreDep = clasificacion?.nombreDepartamento || clasificacion?.departamento || "Sin clasificar";
  const senales = Object.entries(clasificacion?.senales || {}).filter(([k, v]) => v === true && k !== "fuente").map(([k]) => k);
  const asunto = `${senales.includes("urgente") ? "[URGENTE] " : ""}Nuevo contacto para ${nombreDep}: ${lead.nombre || lead.telefono || "sin nombre"}`;
  const filas = [
    ["Nombre", lead.nombre], ["Teléfono", lead.telefono], ["Correo", lead.email], ["Ciudad", lead.ciudad],
    ["Necesita", lead.necesidad], ["Resumen", lead.resumen], ["Departamento", nombreDep],
    ["Por qué", clasificacion?.motivo], ["Señales", senales.join(", ") || "ninguna"],
  ].filter(([, v]) => v);
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <p style="font-size:13px;color:#666;margin:0 0 6px">${escapar(empresa)} · aviso de Nesped</p>
    <h2 style="margin:0 0 14px;font-size:20px">${escapar(asunto)}</h2>
    <p style="margin:0 0 14px">Hola ${escapar(destinatario.nombre || "")}, ha entrado un contacto que te corresponde.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${filas.map(([k, v]) => `<tr><td style="padding:6px 8px;color:#666;vertical-align:top;width:120px">${escapar(k)}</td><td style="padding:6px 8px">${escapar(v)}</td></tr>`).join("")}
    </table>
    ${urlPortal ? `<p style="margin:18px 0 0"><a href="${escapar(urlPortal)}" style="color:#111">Abrir en el portal</a></p>` : ""}
    <p style="font-size:12px;color:#999;margin-top:22px">Recibes esto porque en ${escapar(empresa)} te asignaron ${destinatario.recibe_todo ? "copia de todos los contactos" : "este departamento"}.</p>
  </div>`;
  return { asunto, html };
}

/**
 * Manda el aviso de un contacto a quien corresponda y lo apunta.
 * Nunca lanza: devuelve el resumen de lo que pasó con cada correo.
 */
export async function notificarLead({ clientId, lead, clasificacion, supabase = getSupabase() }) {
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0, destinatarios: [] };
  try {
    const [{ data: destinatarios }, { data: empresa }] = await Promise.all([
      supabase.from("destinatarios").select("*").eq("client_id", clientId),
      supabase.from("clients").select("brand_name, name").eq("id", clientId).maybeSingle(),
    ]);
    const elegidos = seleccionarDestinatarios(destinatarios || [], {
      departamento: clasificacion?.departamento,
      importante: Boolean(clasificacion?.senales?.importante || clasificacion?.senales?.oportunidad),
    });
    if (!elegidos.length) return resumen;

    const nombreEmpresa = empresa?.brand_name || empresa?.name || clientId;
    const urlPortal = `${String(process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "")}/portal`;
    const sinCorreo = correoDesactivado();

    for (const { destinatario, motivo } of elegidos) {
      const fila = { client_id: clientId, lead_id: lead?.id || null, destinatario_id: destinatario.id || null, email: destinatario.email, motivo };
      if (sinCorreo) {
        resumen.omitidos += 1;
        await supabase.from("notificaciones_lead").insert({ ...fila, estado: "omitido", error: "correo desactivado en este entorno" });
        resumen.destinatarios.push({ email: destinatario.email, estado: "omitido" });
        continue;
      }
      try {
        const { asunto, html } = correoDeLead({ empresa: nombreEmpresa, lead, clasificacion, destinatario, urlPortal });
        const id = await enviarCorreo({ to: [destinatario.email], subject: asunto, html });
        resumen.enviados += 1;
        await supabase.from("notificaciones_lead").insert({ ...fila, estado: "enviado", proveedor_id: id || null });
        resumen.destinatarios.push({ email: destinatario.email, estado: "enviado" });
      } catch (err) {
        resumen.fallidos += 1;
        const error = String(err?.message || err).slice(0, 300);
        await supabase.from("notificaciones_lead").insert({ ...fila, estado: "fallido", error });
        resumen.destinatarios.push({ email: destinatario.email, estado: "fallido", error });
        logErrorSeguro("recipients.notification_failed", new Error(error));
      }
    }
  } catch (err) {
    logErrorSeguro("recipients.lead_notification_failed", err);
  }
  return resumen;
}


/* ── Cada llamada, entera, a quien recibe copia de todo ──────────────── */

/** El correo de una llamada: quién, cuánto, qué dijo, y el contacto si lo hay. */
export function correoDeLlamada({ empresa, llamada, lead, destinatario, urlPortal }) {
  const cuando = llamada.created_at ? new Date(llamada.created_at).toLocaleString("es-ES", { timeZone: "Europe/Madrid" }) : "";
  const asunto = `Llamada en ${empresa}: ${lead?.nombre || llamada.from_number || "número oculto"} · ${Math.round(Number(llamada.duration_seconds || 0))} s`;
  const filas = [
    ["Cuándo", cuando], ["Desde", llamada.from_number || "número oculto"], ["Duración", `${Math.round(Number(llamada.duration_seconds || 0))} segundos`],
    ["Estado", llamada.status], ["Resumen", llamada.summary],
    ["Contacto", lead?.nombre], ["Teléfono", lead?.telefono], ["Correo", lead?.email], ["Localidad", lead?.ciudad],
    ["Necesita", lead?.necesidad], ["Departamento", lead?.departamento], ["Por qué", lead?.departamento_motivo],
    ["Estado del contacto", lead?.status], ["Etiquetas", Array.isArray(lead?.tags) ? lead.tags.join(", ") : ""], ["Notas", lead?.notes],
  ].filter(([, v]) => v);
  const transcripcion = String(llamada.transcript || "").trim();
  const html = `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;color:#111">
    <p style="font-size:13px;color:#666;margin:0 0 6px">${escapar(empresa)} · aviso de Nesped</p>
    <h2 style="margin:0 0 14px;font-size:20px">${escapar(asunto)}</h2>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      ${filas.map(([k, v]) => `<tr><td style="padding:6px 8px;color:#666;vertical-align:top;width:150px">${escapar(k)}</td><td style="padding:6px 8px;white-space:pre-wrap">${escapar(v)}</td></tr>`).join("")}
    </table>
    ${transcripcion ? `<h3 style="font-size:14px;margin:20px 0 8px">Transcripción</h3><pre style="white-space:pre-wrap;font:13px/1.5 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f6f6f6;padding:12px;border-radius:8px">${escapar(transcripcion.slice(0, 12000))}</pre>` : ""}
    ${urlPortal ? `<p style="margin:18px 0 0"><a href="${escapar(urlPortal)}" style="color:#111">Abrir en el portal (grabación incluida)</a></p>` : ""}
    <p style="font-size:12px;color:#999;margin-top:22px">Recibes esto porque en ${escapar(empresa)} te asignaron copia de todas las llamadas. Hola ${escapar(destinatario.nombre || "")}.</p>
  </div>`;
  return { asunto, html };
}

/**
 * Manda la llamada entera a quien tiene "copia de todo". Se llama desde la
 * cola tras guardar la llamada; si el contacto ya recibió aviso por
 * departamento en los últimos quince minutos, a esa persona no se le
 * repite. Nunca lanza.
 */
export async function notificarLlamada({ clientId, callSid, supabase = getSupabase() }) {
  const resumen = { enviados: 0, fallidos: 0, omitidos: 0, destinatarios: [] };
  try {
    const { data: llamada } = await supabase.from("calls").select("*").eq("client_id", clientId).eq("call_sid", callSid).maybeSingle();
    if (!llamada) return { ...resumen, motivo: "la llamada no existe" };
    const [{ data: destinatarios }, { data: empresa }] = await Promise.all([
      supabase.from("destinatarios").select("*").eq("client_id", clientId).eq("activo", true).eq("recibe_todo", true),
      supabase.from("clients").select("brand_name, name").eq("id", clientId).maybeSingle(),
    ]);
    if (!destinatarios?.length) return { ...resumen, motivo: "nadie recibe copia de todo" };

    let lead = null;
    if (llamada.lead_id) {
      lead = (await supabase.from("leads").select("*").eq("id", llamada.lead_id).eq("client_id", clientId).maybeSingle()).data;
    } else if (llamada.from_number) {
      lead = (await supabase.from("leads").select("*").eq("client_id", clientId).eq("telefono", llamada.from_number).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
    }
    const hace15 = new Date(Date.now() - 15 * 60e3).toISOString();
    const { data: yaAvisados } = lead
      ? await supabase.from("notificaciones_lead").select("email").eq("client_id", clientId).eq("lead_id", lead.id).eq("estado", "enviado").gte("created_at", hace15)
      : { data: [] };
    const repetidos = new Set((yaAvisados || []).map((n) => String(n.email).toLowerCase()));

    const nombreEmpresa = empresa?.brand_name || empresa?.name || clientId;
    const urlPortal = `${String(process.env.NEXT_PUBLIC_APP_URL || "https://www.nesped.com").replace(/\/+$/, "")}/portal`;
    const sinCorreo = correoDesactivado();

    for (const destinatario of destinatarios) {
      const fila = { client_id: clientId, lead_id: lead?.id || null, destinatario_id: destinatario.id, email: destinatario.email, motivo: `llamada:${callSid}` };
      if (repetidos.has(String(destinatario.email).toLowerCase())) { resumen.omitidos += 1; continue; }
      if (sinCorreo) { resumen.omitidos += 1; await supabase.from("notificaciones_lead").insert({ ...fila, estado: "omitido", error: "correo desactivado en este entorno" }); continue; }
      try {
        const { asunto, html } = correoDeLlamada({ empresa: nombreEmpresa, llamada, lead, destinatario, urlPortal });
        const id = await enviarCorreo({ to: [destinatario.email], subject: asunto, html });
        resumen.enviados += 1;
        await supabase.from("notificaciones_lead").insert({ ...fila, estado: "enviado", proveedor_id: id || null });
        resumen.destinatarios.push({ email: destinatario.email, estado: "enviado" });
      } catch (err) {
        resumen.fallidos += 1;
        const error = String(err?.message || err).slice(0, 300);
        await supabase.from("notificaciones_lead").insert({ ...fila, estado: "fallido", error });
        resumen.destinatarios.push({ email: destinatario.email, estado: "fallido", error });
      }
    }
  } catch (err) {
    logErrorSeguro("recipients.call_notification_failed", err);
  }
  return resumen;
}
