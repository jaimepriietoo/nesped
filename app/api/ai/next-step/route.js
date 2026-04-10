import { getPortalContext, hasRole } from "@/lib/portal-auth";

function suggestNextStep(lead) {
  const score = Number(lead.score || 0);
  const status = String(lead.status || "new");
  const hasPhone = !!String(lead.telefono || "").trim();
  const hasNeed = !!String(lead.necesidad || "").trim();
  const hasOwner = !!String(lead.owner || "").trim();
  const smsSent = !!lead.followup_sms_sent;
  const lastContactedAt = lead.last_contacted_at
    ? new Date(lead.last_contacted_at).getTime()
    : null;

  const now = Date.now();
  const hoursSinceLastContact =
    lastContactedAt ? (now - lastContactedAt) / (1000 * 60 * 60) : null;

  if (status === "won") {
    return "Cliente ganado. Preparar onboarding, confirmación y siguientes pasos.";
  }

  if (status === "lost") {
    return "Cliente perdido. Revisar objeciones, documentar motivo y programar reactivación futura si tiene sentido.";
  }

  if (!hasPhone) {
    return "Falta teléfono. Intentar conseguir un canal directo de contacto antes de avanzar.";
  }

  if (!hasNeed) {
    return "Completar contexto del lead y aclarar exactamente qué necesita antes de proponer nada.";
  }

  if (!hasOwner) {
    return "Asignar este lead a un comercial cuanto antes para no perder velocidad.";
  }

  if (status === "qualified") {
    if (!smsSent) {
      return "Lead cualificado: enviar follow-up inmediato y llamar hoy para intentar cierre.";
    }
    return "Lead cualificado: revisar respuesta del follow-up y hacer llamada de cierre hoy mismo.";
  }

  if (status === "contacted") {
    if (hoursSinceLastContact !== null && hoursSinceLastContact > 24) {
      return "Han pasado más de 24 horas desde el último contacto. Recontactar hoy.";
    }
    if (!smsSent) {
      return "Enviar follow-up por SMS y mantener seguimiento en las próximas 24 horas.";
    }
    return "Esperar respuesta del lead y, si no responde, volver a contactar mañana.";
  }

  if (score >= 85) {
    return "Lead muy caliente: llamar en menos de 1 hora y tratar de cerrar interés real.";
  }

  if (score >= 70) {
    return "Lead caliente: contacto prioritario hoy, validar necesidad y mover a qualified si encaja.";
  }

  if (score >= 50) {
    return "Hacer seguimiento hoy, resolver dudas y recoger más contexto antes de cualificar.";
  }

  return "Intentar contacto inicial, completar información clave y medir interés real.";
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
        { success: false, message: "Sin permisos para generar siguiente paso" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta leadId" },
        { status: 400 }
      );
    }

    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !lead) {
      return Response.json(
        { success: false, message: error?.message || "Lead no encontrado" },
        { status: 404 }
      );
    }

    const nextStep = suggestNextStep(lead);

    const updatedFields = {
      next_step_ai: nextStep,
      proxima_accion: nextStep,
      ultima_accion: "Siguiente paso IA generado",
    };

    const { data: updatedLead, error: updateError } = await ctx.supabase
      .from("leads")
      .update(updatedFields)
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
      type: "ai_next_step",
      title: "Siguiente paso sugerido por IA",
      description: nextStep,
      meta: {
        generated_by: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
        score: lead.score || 0,
        status: lead.status || "new",
      },
    });

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "lead",
      entity_id: leadId,
      action: "ai_next_step_generated",
      actor: ctx.currentUser?.full_name || ctx.userEmail || "portal_user",
      changes: {
        next_step_ai: nextStep,
      },
    });

    return Response.json({
      success: true,
      data: updatedLead,
      nextStep,
      message: "Siguiente paso generado correctamente",
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error generando siguiente paso" },
      { status: 500 }
    );
  }
}