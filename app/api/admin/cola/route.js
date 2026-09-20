import { getAdminContext } from "@/lib/server/auth";
import { getSupabase } from "@/lib/supabase";
import { validar } from "@/lib/server/esquemas";
import { ReintentoColaAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { eventosFallidos, reintentarEvento } from "@/lib/server/bandeja-webhooks";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

/**
 * Lo que no ha salido bien, y cómo volver a intentarlo.
 *
 * Un trabajo que agota sus reintentos queda en 'fallido' con su error; un
 * webhook que agota los suyos, igual. Ninguno desaparece: se ven aquí, con
 * el error, los intentos y la fecha, y se reintentan uno a uno.
 *
 * GET  → { trabajos: [...fallidos], webhooks: [...fallidos] }  (?proveedor=)
 * POST → { trabajo: id }  o  { webhook: id }  para reintentar
 *
 * Reintentar es seguro por construcción, no por cuidado: el webhook de
 * Stripe reclama su event.id, el de ElevenLabs su conversación, el de
 * WhatsApp su MessageSid. Lo que ya surtió efecto no se repite; lo que se
 * quedó a medias, sí.
 */
async function manejarGET(req) {
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });

  const proveedor = new URL(req.url).searchParams.get("proveedor") || null;
  const supabase = getSupabase();

  const [trabajosRes, webhooks] = await Promise.all([
    supabase.from("trabajos")
      .select("id, tipo, client_id, datos, estado, intentos, error, creado_en, terminado_en")
      .eq("estado", "fallido").order("terminado_en", { ascending: false }).limit(100),
    eventosFallidos({ proveedor, cuantos: 100 }),
  ]);

  if (trabajosRes.error) {
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }

  return Response.json(
    { success: true, data: { trabajos: trabajosRes.data || [], webhooks } },
    { headers: { "Cache-Control": "no-store" } },
  );
}

async function manejarPOST(req) {
  const admin = await getAdminContext();
  if (!admin.ok) return Response.json({ success: false, message: admin.message }, { status: admin.status || 401 });
  const originError = requireSameOrigin(req);
  if (originError) return originError;

  const limite = await requireRateLimitAsync(req, {
    namespace: "admin-cola-reintento",
    limit: 30,
    keyParts: [admin.userEmail || "admin"],
  });
  if (limite) return limite;
  const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
  if (cuerpo.respuesta) return cuerpo.respuesta;
  const entrada = validar(ReintentoColaAdmin, cuerpo.datos);
  if (entrada.respuesta) return entrada.respuesta;
  const body = entrada.datos;
  const actor = admin.userEmail || "admin";
  const supabase = getSupabase();

  try {
    if (body.webhook) {
      const resultado = await reintentarEvento(String(body.webhook));
      const { error: auditError } = await supabase.from("audit_logs").insert({
        client_id: null, entity_type: "webhook_events", entity_id: String(body.webhook),
        action: "webhook_reintentado", actor, changes: { reintentado: true },
      });
      if (auditError) throw new Error("No se pudo registrar la auditoría");
      return Response.json({ success: true, data: resultado });
    }

    if (body.trabajo) {
      const id = body.trabajo;
      const { data, error } = await supabase.from("trabajos")
        .update({ estado: "pendiente", intentos: 0, error: null, no_antes_de: new Date().toISOString(), trabajador: null, tomado_en: null, terminado_en: null })
        .eq("id", id).eq("estado", "fallido").select("id").maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return Response.json({ success: false, message: "Ese trabajo no está fallido" }, { status: 404 });
      const { error: auditError } = await supabase.from("audit_logs").insert({
        client_id: null, entity_type: "trabajos", entity_id: String(id),
        action: "trabajo_reintentado", actor, changes: { id },
      });
      if (auditError) throw new Error("No se pudo registrar la auditoría");
      return Response.json({ success: true, data: { reintentado: true, trabajo: id } });
    }

    return Response.json({ success: false, message: "Falta qué reintentar" }, { status: 400 });
  } catch (err) {
    logErrorSeguro("admin.cola_retry_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const GET = observeRoute("api.admin.cola.get", manejarGET);
export const POST = observeRoute("api.admin.cola.post", manejarPOST);
