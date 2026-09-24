import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { mismoTelefono, toE164 } from "@/lib/server/phone";
import { EnviarSms } from "@/lib/server/esquemas-portal";
import { validar } from "@/lib/server/esquemas";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { enviarSms } from "@/lib/server/twilio";
import { observeRoute } from "@/lib/server/observability.mjs";

export function destinoSmsPermitido(solicitado, registrado) {
  return mismoTelefono(solicitado, registrado) ? toE164(registrado) : "";
}

async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "inbox.reply", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para enviar SMS" },
        { status: 403 }
      );
    }

    const limited = await requireRateLimitAsync(req, {
      namespace: "followup:sms",
      limit: 30,
      windowMs: 15 * 60 * 1000,
      keyParts: [ctx.clientId, ctx.userEmail],
      includeIp: false,
      message: "Demasiados SMS. Espera unos minutos antes de volver a intentarlo.",
    });
    if (limited) return limited;

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(EnviarSms, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const {
      leadId,
      to,
      message,
      templateId = null,
    } = leido.datos;

    const { data: lead, error: leadError } = await ctx.supabase
      .from("leads")
      .select("id,telefono,status,score,proxima_accion")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (leadError || !lead) {
      return Response.json(
        { success: false, message: "Contacto no encontrado" },
        { status: 404 }
      );
    }

    /* El destino sale del contacto ya acotado a la empresa, no del cuerpo.
       Antes se podía mandar el coste y el contenido a cualquier teléfono
       conservando un leadId válido como coartada. */
    const cleanTo = destinoSmsPermitido(to, lead.telefono);
    if (!cleanTo) {
      return Response.json(
        { success: false, message: "El teléfono no coincide con el contacto" },
        { status: 400 }
      );
    }

    const sms = await enviarSms({
      to: cleanTo,
      text: String(message).trim(),
    });
    const messageId = sms?.id || sms?.message_id || "";

    const nowIso = new Date().toISOString();

    const { data: updatedLead, error: updateError } = await ctx.supabase
      .from("leads")
      .update({
        followup_sms_sent: true,
        ultima_accion: "SMS de seguimiento enviado",
        last_contacted_at: nowIso,
        proxima_accion:
          lead.status === "qualified" || Number(lead.score || 0) >= 80
            ? "Esperar respuesta del SMS y hacer seguimiento si no responde"
            : lead.proxima_accion || "Revisar respuesta del contacto",
      })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .select()
      .single();

    if (updateError) {
      return Response.json(
        { success: false, message: updateError.message },
        { status: 500 }
      );
    }

    await ctx.supabase.from("lead_events").insert({
      lead_id: leadId,
      client_id: ctx.clientId,
      type: "sms_sent",
      title: "SMS de seguimiento enviado",
      description: message,
      meta: {
        sid: messageId,
        message_id: messageId,
        to: cleanTo,
        template_id: templateId,
        sent_by: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
        provider: "twilio",
      },
    });

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: "sms_sent",
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      changes: {
        to: cleanTo,
        sid: messageId,
        message_id: messageId,
        template_id: templateId,
        preview: String(message).slice(0, 160),
        provider: "twilio",
      },
    });

    return Response.json({
      success: true,
      sid: messageId,
      messageId,
      data: updatedLead,
      message: "SMS enviado correctamente",
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error enviando SMS" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.followup.sms.post", manejarPOST);
