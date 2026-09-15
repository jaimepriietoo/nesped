import { getPortalContext } from "@/lib/portal-auth";
import { llamadasDeVoz } from "@/lib/server/datos";
import { scoreVoiceCallQA } from "@/lib/portal-product";
import { observeRoute } from "@/lib/server/observability.mjs";

function normalizePhone(phone = "") {
  return String(phone || "").replace(/[^\d+]/g, "").trim();
}

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    const { data: leads, error } = await ctx.supabase
      .from("leads")
      .select("id,nombre,telefono")
      .eq("client_id", ctx.clientId)
      .limit(500);

    if (error) {
      throw new Error(error.message);
    }

    const leadMap = new Map();
    const phoneMap = new Map();
    const leadIds = [];
    const phones = [];

    (leads || []).forEach((lead) => {
      if (lead?.id) {
        leadIds.push(lead.id);
        leadMap.set(lead.id, lead);
      }

      const normalizedPhone = normalizePhone(lead?.telefono);
      if (normalizedPhone) {
        phones.push(normalizedPhone);
        phoneMap.set(normalizedPhone, lead);
      }
    });

    if (leadIds.length === 0 && phones.length === 0) {
      return Response.json({
        success: true,
        data: {
          summary: {
            total: 0,
            avgScore: 0,
            bestCalls: 0,
            needsAttention: 0,
          },
          calls: [],
        },
      });
    }

    /* Las llamadas ya son de esta empresa por client_id: no hace falta
       reconstruir el filtro por contactos y teléfonos que necesitaba SQLite,
       donde las llamadas no sabían de qué empresa eran. */
    const calls = await llamadasDeVoz({ client_id: ctx.clientId, cuantos: 30 });

    const scoredCalls = calls.map((call) => {
      const normalizedPhone = normalizePhone(call.phone);
      const lead =
        leadMap.get(call.lead_id) || phoneMap.get(normalizedPhone) || null;
      const qa = scoreVoiceCallQA(call);

      return {
        id: call.id,
        created_at: call.created_at,
        leadName: lead?.nombre || "Lead sin identificar",
        phone: call.phone || lead?.telefono || "",
        result: call.result || call.status || "unknown",
        summary: call.summary || call.summary_long || "",
        duration_seconds: call.duration_seconds || 0,
        qa,
      };
    });

    const avgScore =
      scoredCalls.length > 0
        ? Math.round(
            scoredCalls.reduce((acc, item) => acc + item.qa.overall, 0) /
              scoredCalls.length
          )
        : 0;

    return Response.json({
      success: true,
      data: {
        summary: {
          total: scoredCalls.length,
          avgScore,
          bestCalls: scoredCalls.filter((item) => item.qa.overall >= 75).length,
          needsAttention: scoredCalls.filter((item) => item.qa.overall < 55).length,
        },
        calls: scoredCalls,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "No se pudo cargar la QA de voz",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.voice-qa.get", manejarGET);
