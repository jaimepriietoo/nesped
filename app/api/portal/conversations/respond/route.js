import { getResend } from "@/lib/resend";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";
import { sendTelnyxSms, sendTelnyxWhatsApp } from "@/lib/server/telnyx";

function normalizePhone(value = "") {
  return String(value || "").replace(/\s+/g, "").trim();
}

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return Response.json(
        { success: false, message: "Sin permisos para responder conversaciones" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const leadId = String(body?.leadId || "").trim();
    const channel = String(body?.channel || "").trim().toLowerCase();
    const message = String(body?.message || "").trim();
    const takeover = Boolean(body?.takeover);
    const subject = String(body?.subject || "").trim();

    if (!leadId || !channel || !message) {
      return Response.json(
        { success: false, message: "Faltan leadId, channel o message" },
        { status: 400 }
      );
    }

    const { data: lead, error: leadError } = await ctx.supabase
      .from("leads")
      .select("id,nombre,email,telefono,owner,status,score")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (leadError || !lead) {
      return Response.json(
        { success: false, message: leadError?.message || "Lead no encontrado" },
        { status: 404 }
      );
    }

    const actor =
      ctx.currentUser?.full_name || ctx.userEmail || "portal_user";
    const nowIso = new Date().toISOString();
    let delivery = null;

    if (channel === "sms") {
      const sms = await sendTelnyxSms({
        text: message,
        to: normalizePhone(lead.telefono),
      });
      delivery = {
        sid: sms?.id || sms?.message_id || "",
        messageId: sms?.id || sms?.message_id || "",
        channel: "sms",
        provider: "telnyx",
        to: normalizePhone(lead.telefono),
      };
    } else if (channel === "whatsapp") {
      const wa = await sendTelnyxWhatsApp({
        text: message,
        to: normalizePhone(lead.telefono),
        webhookUrl: "/api/whatsapp/webhook",
      });
      delivery = {
        sid: wa?.id || wa?.message_id || "",
        messageId: wa?.id || wa?.message_id || "",
        channel: "whatsapp",
        provider: "telnyx",
        to: normalizePhone(lead.telefono),
      };
    } else if (channel === "email") {
      if (!lead.email) {
        return Response.json(
          { success: false, message: "El lead no tiene email" },
          { status: 400 }
        );
      }

      const resend = getResend();
      const result = await resend.emails.send({
        from: process.env.RESEND_FROM || "NESPED <onboarding@updates.nesped.com>",
        to: [lead.email],
        subject: subject || "Seguimos con tu solicitud",
        text: message,
      });

      if (result?.error) {
        throw new Error(result.error.message || "No se pudo enviar el email");
      }

      delivery = { id: result?.data?.id || "", channel: "email", to: lead.email };
    } else {
      return Response.json(
        { success: false, message: "Canal no soportado" },
        { status: 400 }
      );
    }

    await ctx.supabase
      .from("leads")
      .update({
        last_contacted_at: nowIso,
        ultima_accion: `Mensaje ${channel} enviado`,
        owner: takeover ? actor : lead.owner,
      })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId);

    await ctx.supabase.from("lead_events").insert({
      lead_id: leadId,
      client_id: ctx.clientId,
      type: `${channel}_sent`,
      title: `Salida ${channel}`,
      description: message,
      meta: {
        channel,
        delivery,
        takeover,
        actor,
      },
      created_at: nowIso,
    });

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: `conversation_${channel}_sent`,
      actor,
      changes: {
        channel,
        takeover,
        delivery,
        preview: message.slice(0, 220),
      },
      created_at: nowIso,
    });

    return Response.json({
      success: true,
      message: `Mensaje ${channel} enviado`,
      data: {
        delivery,
        leadId,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo enviar la respuesta",
      },
      { status: 500 }
    );
  }
}
