import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { sendTelnyxSms } from "@/lib/server/telnyx";

function normalizePhone(value) {
  if (!value) return "";
  return String(value).replace(/\s+/g, "").trim();
}

export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return Response.json(
        { success: false, message: "Sin permisos para enviar SMS" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      leadId,
      to,
      message,
      templateId = null,
    } = body;

    if (!leadId || !to || !message) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const cleanTo = normalizePhone(to);
    if (!cleanTo) {
      return Response.json(
        { success: false, message: "Teléfono no válido" },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (leadError || !lead) {
      return Response.json(
        { success: false, message: leadError?.message || "Lead no encontrado" },
        { status: 404 }
      );
    }

    const sms = await sendTelnyxSms({
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
            : lead.proxima_accion || "Revisar respuesta del lead",
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
        provider: "telnyx",
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
        provider: "telnyx",
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
      { success: false, message: error.message || "Error enviando SMS" },
      { status: 500 }
    );
  }
}
