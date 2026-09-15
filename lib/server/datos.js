/* =========================================================================
   Datos de negocio que vivían en Prisma sobre SQLite, ahora en Postgres.

   POR QUÉ EXISTE ESTE MÓDULO. lib/prisma.js abría un fichero SQLite con
   DATABASE_URL. En Vercel el sistema de ficheros es efímero: cada escritura a
   la memoria de un contacto, a una cita, a un permiso o a un evento de pago
   fallaba si el fichero no existía o se perdía en el siguiente arranque en
   frío. Sin ruido en Sentry porque no había tráfico; el día que lo hubiera,
   se perdían datos en silencio.

   Y ninguno de aquellos modelos llevaba client_id: iban atados a un lead o
   a un teléfono. Aquí toda escritura de datos de cliente lleva su empresa, y
   si quien llama no la conoce se resuelve desde el contacto. Una fila sin
   empresa no se escribe.

   LA FORMA DE LO QUE DEVUELVE es la que devolvía Prisma —`lead_id`, `phone`,
   `type`, `message`, `created_at`— para que los treinta sitios que leen
   historiales con hasAnyEvent() y compañía no tengan que cambiar. La tabla
   lead_events guarda el mensaje en `description` y el teléfono en `meta`;
   la traducción se hace aquí y en ningún otro sitio.
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const esUuid = (v) => typeof v === "string" && UUID.test(v);

function fallo(error, que) {
  const e = new Error(`${que}: ${error?.message || "error de base de datos"}`);
  e.causa = error;
  return e;
}

/**
 * La empresa a la que pertenece un contacto. Es lo que permite que un
 * proceso por lotes —que recorre contactos de todas las empresas— escriba
 * cada fila en la empresa correcta sin que nadie se lo diga.
 */
export async function clientIdDeLead(leadId) {
  if (!esUuid(leadId)) return null;
  const { data, error } = await getSupabase()
    .from("leads").select("client_id").eq("id", leadId).maybeSingle();
  if (error) throw fallo(error, "No se pudo resolver la empresa del contacto");
  return data?.client_id || null;
}

async function empresaObligatoria({ client_id, lead_id }, que) {
  const id = client_id || (await clientIdDeLead(lead_id));
  if (!id) throw new Error(`${que}: no se sabe de qué empresa es y no se escribe sin empresa`);
  return id;
}

/* ── Eventos de contacto ─────────────────────────────────────────────── */

function eventoDesdeFila(f) {
  return {
    id: f.id,
    lead_id: f.lead_id || f.meta?.lead_ref || null,
    phone: f.meta?.phone || null,
    type: f.type,
    message: f.description ?? "",
    created_at: f.created_at,
    client_id: f.client_id,
  };
}

/** El filtro "de este contacto o de este teléfono", como lo hacía Prisma con OR. */
function filtroContacto(consulta, { lead_id, phone }) {
  const partes = [];
  if (esUuid(lead_id)) partes.push(`lead_id.eq.${lead_id}`);
  if (phone) partes.push(`meta->>phone.eq.${phone}`);
  if (partes.length === 0) return consulta.eq("lead_id", "00000000-0000-0000-0000-000000000000");
  return partes.length === 1 ? consulta.or(partes[0]) : consulta.or(partes.join(","));
}

export async function crearEventoLead({ client_id, lead_id, phone, type, message }) {
  const empresa = await empresaObligatoria({ client_id, lead_id }, "Evento de contacto");
  const meta = {};
  if (phone) meta.phone = phone;
  if (lead_id && !esUuid(lead_id)) meta.lead_ref = String(lead_id);
  const fila = {
    client_id: empresa,
    lead_id: esUuid(lead_id) ? lead_id : null,
    type,
    title: type,
    description: message ?? "",
    meta,
  };
  const { data, error } = await getSupabase().from("lead_events").insert(fila).select("*").single();
  if (error) throw fallo(error, "No se pudo guardar el evento del contacto");
  return eventoDesdeFila(data);
}

export async function eventosDeLead({ lead_id, phone, cuantos = 50, tipos = null }) {
  let q = getSupabase().from("lead_events").select("*");
  q = filtroContacto(q, { lead_id, phone });
  if (tipos?.length) q = q.in("type", tipos);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudo leer el historial del contacto");
  return (data || []).map(eventoDesdeFila);
}

export async function ultimoEventoDeLead({ lead_id, phone, tipos = null, desde = null }) {
  let q = getSupabase().from("lead_events").select("*");
  q = filtroContacto(q, { lead_id, phone });
  if (tipos?.length) q = q.in("type", tipos);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer el último evento del contacto");
  return data ? eventoDesdeFila(data) : null;
}

/** Eventos de un tipo en toda la plataforma: para los procesos por lotes. */
export async function eventosPorTipo({ type, cuantos = 100, client_id = null, desde = null }) {
  let q = getSupabase().from("lead_events").select("*").eq("type", type);
  if (client_id) q = q.eq("client_id", client_id);
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer los eventos");
  return (data || []).map(eventoDesdeFila);
}

/* ── Memoria del contacto ────────────────────────────────────────────── */

export async function memoriaDeLead(leadId) {
  if (!esUuid(leadId)) return null;
  const { data, error } = await getSupabase().from("lead_memory").select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer la memoria del contacto");
  return data || null;
}

export async function memoriasDeLeads(leadIds) {
  const ids = (leadIds || []).filter(esUuid);
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("lead_memory").select("*").in("lead_id", ids);
  if (error) throw fallo(error, "No se pudieron leer las memorias");
  return data || [];
}

export async function guardarMemoriaLead(leadId, payload = {}, client_id = null) {
  if (!esUuid(leadId)) throw new Error("Memoria de contacto: identificador no válido");
  const empresa = await empresaObligatoria({ client_id, lead_id: leadId }, "Memoria de contacto");
  const fila = { ...payload, lead_id: leadId, client_id: empresa, updated_at: new Date().toISOString() };
  const { data, error } = await getSupabase()
    .from("lead_memory").upsert(fila, { onConflict: "lead_id" }).select("*").single();
  if (error) throw fallo(error, "No se pudo guardar la memoria del contacto");
  return data;
}

/* ── Llamadas de voz (en la tabla calls, que ya tenía sus columnas) ──── */

export async function ultimaLlamadaDeLead({ lead_id, phone }) {
  let q = getSupabase().from("calls").select("id, lead_id, phone, status, result, created_at");
  const partes = [];
  if (esUuid(lead_id)) partes.push(`lead_id.eq.${lead_id}`);
  if (phone) partes.push(`phone.eq.${phone}`, `from_number.eq.${phone}`);
  if (partes.length === 0) return null;
  q = q.or(partes.join(","));
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer la última llamada");
  return data || null;
}

export async function crearLlamada({ client_id, lead_id, phone, status = "queued", ...resto }) {
  const empresa = await empresaObligatoria({ client_id, lead_id }, "Llamada");
  const fila = {
    client_id: empresa,
    lead_id: esUuid(lead_id) ? lead_id : null,
    phone: phone || null,
    from_number: phone || null,
    status,
    ...resto,
  };
  const { data, error } = await getSupabase().from("calls").insert(fila).select("id").single();
  if (error) throw fallo(error, "No se pudo crear la llamada");
  return data;
}

export async function actualizarLlamada(id, cambios) {
  const { error } = await getSupabase().from("calls").update(cambios).eq("id", id);
  if (error) throw fallo(error, "No se pudo actualizar la llamada");
}

export async function llamadasDeVoz({ client_id, cuantos = 50, conTranscripcion = false }) {
  let q = getSupabase().from("calls")
    .select("id, lead_id, phone, from_number, status, result, summary, summary_long, transcript, recording_url, duration_seconds, detected_intent, created_at")
    .eq("client_id", client_id);
  if (conTranscripcion) q = q.not("transcript", "is", null);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer las llamadas");
  return (data || []).map((c) => ({ ...c, phone: c.phone || c.from_number }));
}

/* ── Catálogo ────────────────────────────────────────────────────────── */

export async function productos({ activos = true, cuantos = 100 } = {}) {
  let q = getSupabase().from("products").select("*");
  if (activos) q = q.eq("active", true);
  const { data, error } = await q.order("price", { ascending: true }).limit(cuantos);
  if (error) throw fallo(error, "No se pudo leer el catálogo");
  return (data || []).map((p) => ({ ...p, price: Number(p.price) }));
}

export async function productoPorId(id) {
  if (!esUuid(id)) return null;
  const { data, error } = await getSupabase().from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer el producto");
  return data ? { ...data, price: Number(data.price) } : null;
}

export async function playbooksPorSector({ cuantos = 50 } = {}) {
  const { data, error } = await getSupabase().from("industry_playbooks").select("*").order("industry").limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer los guiones");
  return data || [];
}

/* ── Ventas adicionales, citas, reactivaciones ───────────────────────── */

export async function ultimoUpsell({ lead_id, phone, from_tier = null, to_tier = null, desde = null }) {
  let q = getSupabase().from("upsell_events").select("*");
  if (from_tier) q = q.eq("from_tier", from_tier);
  if (to_tier) q = q.eq("to_tier", to_tier);
  const partes = [];
  if (esUuid(lead_id)) partes.push(`lead_id.eq.${lead_id}`);
  if (phone) partes.push(`phone.eq.${phone}`);
  if (partes.length === 0) return null;
  q = q.or(partes.join(","));
  if (desde) q = q.gte("created_at", desde);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw fallo(error, "No se pudo leer la última venta adicional");
  return data || null;
}

export async function crearUpsell({ client_id, lead_id, ...resto }) {
  const empresa = await empresaObligatoria({ client_id, lead_id }, "Venta adicional");
  const { data, error } = await getSupabase().from("upsell_events")
    .insert({ client_id: empresa, lead_id: esUuid(lead_id) ? lead_id : null, ...resto }).select("*").single();
  if (error) throw fallo(error, "No se pudo guardar la venta adicional");
  return data;
}

export async function citasPorEstado({ estado = "booked", cuantos = 200 } = {}) {
  const { data, error } = await getSupabase().from("appointments").select("*")
    .eq("status", estado).order("start_at", { ascending: true }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer las citas");
  return data || [];
}

export async function citasEntre({ desde, hasta, estados = ["scheduled", "pending", "confirmed"], cuantos = 200 }) {
  const { data, error } = await getSupabase().from("appointments").select("*")
    .gte("start_at", desde).lte("start_at", hasta).in("status", estados)
    .order("start_at", { ascending: true }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer las citas");
  return data || [];
}

export async function reactivacionesDeLead({ lead_id, phone, cuantos = 20 }) {
  let q = getSupabase().from("lead_reactivations").select("*");
  const partes = [];
  if (esUuid(lead_id)) partes.push(`lead_id.eq.${lead_id}`);
  if (phone) partes.push(`phone.eq.${phone}`);
  if (partes.length === 0) return [];
  q = q.or(partes.join(","));
  const { data, error } = await q.order("sent_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer las reactivaciones");
  return data || [];
}

export async function crearReactivacion({ client_id, lead_id, ...resto }) {
  const empresa = await empresaObligatoria({ client_id, lead_id }, "Reactivación");
  const { data, error } = await getSupabase().from("lead_reactivations")
    .insert({ client_id: empresa, lead_id: esUuid(lead_id) ? lead_id : null, ...resto }).select("*").single();
  if (error) throw fallo(error, "No se pudo guardar la reactivación");
  return data;
}

/* ── Variantes de mensaje ────────────────────────────────────────────── */

export async function variantes({ client_id = null, channel = null, stage = null, activas = true, cuantos = 100 } = {}) {
  let q = getSupabase().from("message_variants").select("*");
  /* Las de la empresa y las de plataforma (client_id nulo). */
  q = client_id ? q.or(`client_id.eq.${client_id},client_id.is.null`) : q.is("client_id", null);
  if (channel) q = q.eq("channel", channel);
  if (stage) q = q.eq("stage", stage);
  if (activas) q = q.eq("active", true);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer las variantes");
  return data || [];
}

export async function crearVariante({ client_id = null, ...resto }) {
  const { data, error } = await getSupabase().from("message_variants").insert({ client_id, ...resto }).select("*").single();
  if (error) throw fallo(error, "No se pudo crear la variante");
  return data;
}

export async function resultadosDeVariantes(variantIds, { cuantos = 2000 } = {}) {
  const ids = (variantIds || []).filter(esUuid);
  if (ids.length === 0) return [];
  const { data, error } = await getSupabase().from("message_experiment_results").select("*")
    .in("variant_id", ids).order("created_at", { ascending: false }).limit(cuantos);
  if (error) throw fallo(error, "No se pudieron leer los resultados");
  return data || [];
}

/* ── Permisos finos: viven en portal_users.permissions ───────────────── */

/** Las filas {user_id, scope} que esperaba el código, a partir de los usuarios ya leídos. */
export function filasDePermisos(portalUsers = []) {
  const filas = [];
  for (const u of portalUsers) {
    const scopes = Array.isArray(u?.permissions) ? u.permissions : [];
    for (const scope of scopes) filas.push({ user_id: u.id, scope: String(scope), created_at: u.updated_at || null });
  }
  return filas;
}

export async function permisosDeUsuario(portalUserId) {
  if (!esUuid(portalUserId)) return [];
  const { data, error } = await getSupabase().from("portal_users").select("permissions").eq("id", portalUserId).maybeSingle();
  if (error) throw fallo(error, "No se pudieron leer los permisos");
  return Array.isArray(data?.permissions) ? data.permissions.map(String) : [];
}

export async function fijarPermisosDeUsuario(portalUserId, scopes, client_id) {
  if (!esUuid(portalUserId)) throw new Error("Permisos: usuario no válido");
  if (!client_id) throw new Error("Permisos: no se cambian sin saber de qué empresa es el usuario");
  const limpios = [...new Set((scopes || []).map((s) => String(s).trim()).filter(Boolean))];
  const { error } = await getSupabase().from("portal_users")
    .update({ permissions: limpios, updated_at: new Date().toISOString() })
    .eq("id", portalUserId).eq("client_id", client_id);
  if (error) throw fallo(error, "No se pudieron guardar los permisos");
  return limpios;
}

export const PARA_PRUEBAS = { esUuid, eventoDesdeFila };
