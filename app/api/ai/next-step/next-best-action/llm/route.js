import { createAdminSupabase, generateNextBestActionLlmRecommendation } from "@/lib/server/next-best-action-service";
import { getNextBestActionRules } from "@/lib/next-best-action";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { leerJsonLimitado } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";
import { validar } from "@/lib/server/esquemas";
import { AccionRecomendadaInterna } from "@/lib/server/esquemas-operaciones";

function predictCloseProbability(lead) {
  const score = Number(lead?.score || 0);
  const status = String(lead?.status || "new");

  let base = score;
  if (status === "contacted") base += 10;
  if (status === "qualified") base += 20;
  if (status === "won") base = 100;
  if (status === "lost") base = 0;
  if (lead?.followup_sms_sent) base += 5;
  if (lead?.next_step_ai) base += 5;
  if (lead?.owner) base += 5;

  return Math.max(0, Math.min(100, base));
}

async function manejarPOST(req) {
  const unauthorized = requireInternalRequest(req);
  if (unauthorized) return unauthorized;

  try {
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(AccionRecomendadaInterna, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { leadId, clientId, brandName } = leido.datos;

    if (!leadId || !clientId) {
      return Response.json(
        { success: false, message: "Faltan leadId o clientId" },
        { status: 400 }
      );
    }

    const supabase = createAdminSupabase();
    const { data: lead, error } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", clientId)
      .single();

    if (error || !lead) {
      return Response.json(
        { success: false, message: "Lead no encontrado" },
        { status: 404 }
      );
    }

    const hydratedLead = {
      ...lead,
      predicted_close_probability:
        lead.predicted_close_probability ?? predictCloseProbability(lead),
    };
    const fallback = getNextBestActionRules(hydratedLead, brandName);
    const data = await generateNextBestActionLlmRecommendation({
      lead: hydratedLead,
      brandName,
      fallback,
    });

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    logErrorSeguro("ai.next_step_llm_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error generando NBA con IA",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.ai.next-step.next-best-action.llm.post", manejarPOST);
