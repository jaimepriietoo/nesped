import twilio from "twilio";
import { getPortalContext, hasRole } from "@/lib/portal-auth";

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
    const { leadId, to, message } = body;

    if (!leadId || !to || !message) {
      return Response.json(
        { success: false, message: "Faltan datos obligatorios" },
        { status: 400 }
      );
    }

    const accountSid =
      process.env.ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
    const authToken =
      process.env.AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
    const from =
      process.env.TWILIO_NUMERO || process.env.TWILIO_PHONE_NUMBER;

    if (!accountSid || !authToken || !from) {
      return Response.json(
        { success: false, message: "Faltan credenciales de Twilio" },
        { status: 500 }
      );
    }

    const client = twilio(accountSid, authToken);

    const sms = await client.messages.create({
      body: message,
      from,
      to,
    });

    await ctx.supabase
      .from("leads")
      .update({
        followup_sms_sent: true,
        ultima_accion: "SMS de seguimiento enviado",
        last_contacted_at: new Date().toISOString(),
      })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId);

    await ctx.supabase.from("lead_events").insert({
      lead_id: leadId,
      client_id: ctx.clientId,
      type: "sms_sent",
      title: "SMS de seguimiento enviado",
      description: message,
      meta: {
        sid: sms.sid,
        to,
      },
    });

    return Response.json({ success: true, sid: sms.sid });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error enviando SMS" },
      { status: 500 }
    );
  }
}