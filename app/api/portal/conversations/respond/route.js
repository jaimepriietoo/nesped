import crypto from "node:crypto";
import { enviarCorreo } from "@/lib/server/correo";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { enviarSms, enviarWhatsApp } from "@/lib/server/twilio";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { ResponderConversacion } from "@/lib/server/esquemas-portal";

function normalizePhone(value = "") {
  return String(value || "").replace(/\s+/g, "").trim();
}

function hashDeEnvio({ clientId, leadId, channel, message, takeover, subject }) {
  return crypto.createHash("sha256").update(JSON.stringify({
    clientId, leadId, channel, message, takeover, subject,
  })).digest("hex");
}

function entregaPersistible(delivery) {
  return {
    id: delivery?.id || "",
    sid: delivery?.sid || "",
    messageId: delivery?.messageId || "",
    provider: delivery?.provider || "",
    channel: delivery?.channel || "",
  };
}

async function manejarPOST(req) {
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

    if (!puede(ctx.role, "inbox.reply", ctx.permissions)) {
      return Response.json(
        { success: false, message: "Sin permisos para responder conversaciones" },
        { status: 403 }
      );
    }

    const limited = await requireRateLimitAsync(req, {
      namespace: "portal:conversation-response",
      limit: 30,
      keyParts: [ctx.clientId, ctx.userEmail],
      includeIp: false,
    });
    if (limited) return limited;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(ResponderConversacion, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { leadId, requestId, channel, message, takeover, subject } = leido.datos;

    const { data: lead, error: leadError } = await ctx.supabase
      .from("leads")
      .select("id,nombre,email,telefono,owner,status,score")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (leadError || !lead) {
      return Response.json(
        { success: false, message: "Lead no encontrado" },
        { status: 404 }
      );
    }

    const actor =
      ctx.currentUser?.full_name || ctx.userEmail || "portal_user";
    const nowIso = new Date().toISOString();
    let delivery = null;

    if ((channel === "sms" || channel === "whatsapp") && !normalizePhone(lead.telefono)) {
      return Response.json(
        { success: false, message: "El lead no tiene teléfono" },
        { status: 400 },
      );
    }
    if (channel === "email" && !lead.email) {
      return Response.json(
        { success: false, message: "El lead no tiene email" },
        { status: 400 },
      );
    }

    const payloadHash = hashDeEnvio({
      clientId: ctx.clientId, leadId, channel, message, takeover, subject,
    });
    const { error: claimError } = await ctx.datos
      .from("mensajes_salientes_idempotentes")
      .insert({ request_id: requestId, lead_id: leadId, channel, payload_hash: payloadHash });

    if (claimError) {
      const { data: anterior, error: lookupError } = await ctx.datos
        .from("mensajes_salientes_idempotentes")
        .select("payload_hash,status,delivery")
        .eq("request_id", requestId)
        .maybeSingle();
      if (lookupError || !anterior) throw new Error("No se pudo comprobar el envío anterior");
      if (anterior.payload_hash !== payloadHash) {
        return Response.json(
          { success: false, message: "La clave de envío ya pertenece a otro mensaje" },
          { status: 409 },
        );
      }
      if (anterior.status === "enviado") {
        return Response.json({
          success: true,
          message: `Mensaje ${channel} ya enviado`,
          data: { delivery: anterior.delivery || {}, leadId, duplicate: true },
        });
      }
      return Response.json(
        { success: false, message: "Este envío ya está en curso o pendiente de revisión" },
        { status: 409 },
      );
    }

    try {
      if (channel === "sms") {
        const sms = await enviarSms({
          text: message,
          to: normalizePhone(lead.telefono),
        });
        delivery = {
          sid: sms?.id || sms?.message_id || "",
          messageId: sms?.id || sms?.message_id || "",
          channel: "sms",
          provider: "twilio",
          to: normalizePhone(lead.telefono),
        };
      } else if (channel === "whatsapp") {
        const wa = await enviarWhatsApp({
          text: message,
          to: normalizePhone(lead.telefono),
          webhookUrl: "/api/whatsapp/webhook",
        });
        delivery = {
          sid: wa?.id || wa?.message_id || "",
          messageId: wa?.id || wa?.message_id || "",
          channel: "whatsapp",
          provider: "twilio",
          to: normalizePhone(lead.telefono),
        };
      } else if (channel === "email") {
        /* Hay alguien pulsando el botón y esperando a ver si sale. Se intenta
           aunque el circuito de Resend esté abierto. */
        const id = await enviarCorreo({
          quienEspera: "persona",
          to: [lead.email],
          subject: subject || "Seguimos con tu solicitud",
          text: message,
        });

        delivery = { id, channel: "email", to: lead.email };
      }
    } catch (error) {
      await ctx.datos
        .from("mensajes_salientes_idempotentes")
        .update({ status: "fallido" })
        .eq("request_id", requestId);
      throw error;
    }

    const { error: sentError } = await ctx.datos
      .from("mensajes_salientes_idempotentes")
      .update({
        status: "enviado",
        delivery: entregaPersistible(delivery),
        sent_at: new Date().toISOString(),
      })
      .eq("request_id", requestId)
      .eq("payload_hash", payloadHash);
    if (sentError) {
      logErrorSeguro("portal.conversation_delivery_state_failed", sentError, { channel });
    }

    const { error: updateError } = await ctx.supabase
      .from("leads")
      .update({
        last_contacted_at: nowIso,
        ultima_accion: `Mensaje ${channel} enviado`,
        owner: takeover ? actor : lead.owner,
      })
      .eq("id", leadId)
      .eq("client_id", ctx.clientId);
    if (updateError) logErrorSeguro("portal.conversation_lead_update_failed", updateError, { channel });

    const { error: eventError } = await ctx.supabase.from("lead_events").insert({
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
    if (eventError) logErrorSeguro("portal.conversation_event_failed", eventError, { channel });

    const referenciaEntrega = delivery?.messageId || delivery?.sid || delivery?.id || "";
    const { error: auditError } = await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: `conversation_${channel}_sent`,
      actor,
      changes: {
        channel,
        takeover,
        provider: delivery?.provider || channel,
        delivery_id: referenciaEntrega,
      },
      created_at: nowIso,
    });
    if (auditError) logErrorSeguro("portal.conversation_audit_failed", auditError, { channel });

    return Response.json({
      success: true,
      message: `Mensaje ${channel} enviado`,
      data: {
        delivery,
        leadId,
      },
    });
  } catch (error) {
    logErrorSeguro("portal.conversation_response_failed", error);
    return Response.json(
      {
        success: false,
        message: "No se pudo enviar la respuesta",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.portal.conversations.respond.post", manejarPOST);
