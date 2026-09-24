import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { validar } from "@/lib/server/esquemas";
import { ActualizarLead } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { emitirWebhook, EVENTOS } from "@/lib/server/webhooks-salientes";
 
async function manejarPATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(
      req,
      "Origen no permitido para actualizar contactos"
    );
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) return Response.json({ success: false, message: ctx.message }, { status: 401 });
    if (!puede(ctx.role, "crm.edit", ctx.permissions)) return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
 
    const limite = await requireRateLimitAsync(req, {
      namespace: "lead-update", limit: 120, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 32 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(ActualizarLead, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const body = entrada.datos;
    const { leadId } = body;

    /* Sólo estos campos se pueden tocar desde la ficha.
   
       Antes se hacía `const { leadId, ...updates } = body` y ese resto entero
       iba al UPDATE. El filtro por client_id protegía QUÉ fila se actualiza,
       pero no QUÉ columnas: bastaba con mandar client_id en el cuerpo para
       mover un contacto a otra empresa, y con él su teléfono y su historial.
       También se podían pisar campos que calcula el sistema, como el score. */
    const CAMPOS_EDITABLES = new Set([
      "status", "owner", "valor_estimado", "lost_reason",
      "nombre", "telefono", "email", "ciudad", "necesidad",
      "notes", "interes", "next_action", "next_action_priority",
      "proxima_accion", "ultima_accion", "tags",
    ]);

    const updates = Object.fromEntries(
      Object.entries(body).filter(([k]) => CAMPOS_EDITABLES.has(k))
    );

    if (!Object.keys(updates).length) {
      return Response.json({ success: false, message: "Nada que actualizar" }, { status: 400 });
    }
 
    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .select("*")
      .single();
 
    if (error) throw new Error(error.message);
 
    // Audit log
    const { error: auditError } = await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: "lead_updated",
      actor: ctx.currentUser?.full_name || ctx.userEmail,
      changes: { fields: Object.keys(updates).sort() },
    });
    if (auditError) throw new Error("No se pudo registrar la auditoría");
 
    void emitirWebhook({
      clientId: ctx.clientId,
      evento: EVENTOS.CONTACTO_ACTUALIZADO,
      datos: { lead_id: leadId, cambios: updates, status: lead?.status || null },
    });

    return Response.json({ success: true, data: lead });
  } catch (err) {
    logErrorSeguro("leads.update_failed", err);
    return Response.json({ success: false, message: "No se pudo completar la operación" }, { status: 500 });
  }
}

export const PATCH = observeRoute("api.leads.update.patch", manejarPATCH);
