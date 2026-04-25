import OpenAI from "openai";
import { prisma } from "@/lib/prisma";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
import {
  getDefaultPlaybookWorkspace,
  parsePlaybookWorkspace,
} from "@/lib/portal-product";
import { requireSameOrigin } from "@/lib/server/security";
import { buildConversationAssistPayload } from "@/lib/server/portal-phase-four";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

async function tryAiSuggestion({ client, lead, payload, channel, goal }) {
  if (!openai) return payload;

  const prompt = `
Eres un closer premium de Nesped. Genera una respuesta breve, humana y muy vendible.

Marca: ${client?.brand_name || client?.name || "Nesped"}
Canal: ${channel}
Objetivo: ${goal}
Lead:
- nombre: ${lead?.nombre || ""}
- necesidad: ${lead?.necesidad || ""}
- status: ${lead?.status || ""}
- score: ${lead?.score || 0}
- owner: ${lead?.owner || ""}

Base sugerida:
${payload.primary}

Responde SOLO con JSON válido:
{
  "primary": "mensaje final",
  "alternatives": ["variante 1", "variante 2", "variante 3"],
  "subject": "solo si el canal es email"
}
`;

  try {
    const response = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
    });

    const text = response.output_text?.trim() || "{}";
    const parsed = JSON.parse(text);

    return {
      ...payload,
      primary: String(parsed?.primary || payload.primary).trim(),
      alternatives: Array.isArray(parsed?.alternatives) && parsed.alternatives.length
        ? parsed.alternatives.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 3)
        : payload.alternatives,
      subject:
        channel === "email"
          ? String(parsed?.subject || payload.subject || "").trim()
          : "",
    };
  } catch {
    return payload;
  }
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
        { success: false, message: "Sin permisos para pedir sugerencias IA" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const leadId = String(body?.leadId || "").trim();
    const channel = String(body?.channel || "whatsapp").trim().toLowerCase();
    const goal = String(body?.goal || "followup").trim().toLowerCase();

    if (!leadId) {
      return Response.json(
        { success: false, message: "Falta leadId" },
        { status: 400 }
      );
    }

    const [{ data: client, error: clientError }, { data: lead, error: leadError }] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select("id,name,brand_name,industry,prompt")
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("leads")
          .select("*")
          .eq("id", leadId)
          .eq("client_id", ctx.clientId)
          .single(),
      ]);

    if (clientError || !client) {
      throw new Error(clientError?.message || "No se pudo cargar el cliente");
    }

    if (leadError || !lead) {
      throw new Error(leadError?.message || "No se pudo cargar el lead");
    }

    const memory = await prisma.leadMemory.findUnique({
      where: { lead_id: leadId },
    });

    const playbook = parsePlaybookWorkspace(
      client?.prompt || "",
      getDefaultPlaybookWorkspace({
        industry: client?.industry,
        brandName: client?.brand_name || client?.name || "Nesped",
      })
    );

    const basePayload = buildConversationAssistPayload({
      client,
      lead,
      memory,
      playbook,
      channel,
      goal,
    });

    const payload = await tryAiSuggestion({
      client,
      lead,
      payload: basePayload,
      channel,
      goal,
    });

    return Response.json({
      success: true,
      data: payload,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo generar la sugerencia",
      },
      { status: 500 }
    );
  }
}
