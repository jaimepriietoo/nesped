import { getPortalContext } from "@/lib/portal-auth";

function suggestNextStep(lead) {
  const score = Number(lead.score || 0);
  const status = lead.status || "new";

  if (status === "won") return "Cliente ganado. Preparar onboarding.";
  if (status === "lost") return "Cliente perdido. Revisar objeciones y reactivar más adelante.";
  if (status === "qualified") return "Llamar hoy mismo para cerrar o enviar propuesta.";
  if (status === "contacted") return "Hacer seguimiento en las próximas 24 horas.";
  if (score >= 80) return "Lead caliente: llamar en menos de 1 hora.";
  if (score >= 50) return "Hacer seguimiento hoy y validar interés real.";
  return "Intentar contacto inicial y completar más contexto.";
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

    const { data: updatedLead, error: updateError } = await ctx.supabase
      .from("leads")
      .update({
        next_step_ai: nextStep,
        proxima_accion: nextStep,
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
      type: "ai_next_step",
      title: "Siguiente paso sugerido por IA",
      description: nextStep,
      meta: {},
    });

    return Response.json({ success: true, data: updatedLead, nextStep });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error generando siguiente paso" },
      { status: 500 }
    );
  }
}