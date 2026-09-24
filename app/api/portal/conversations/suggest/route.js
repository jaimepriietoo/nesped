import { reservarGeneracionIA } from "@/lib/server/ai-budget";
import { conRegistroIA } from "@/lib/server/ia";
import { respuestaSiPausado } from "@/lib/server/interruptores";
import OpenAI from "openai";
import { memoriaDeLead } from "@/lib/server/datos";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import {
  getDefaultPlaybookWorkspace,
  parsePlaybookWorkspace,
} from "@/lib/portal-product";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { buildConversationAssistPayload } from "@/lib/server/portal-phase-four";
import { observeRoute } from "@/lib/server/observability.mjs";
import { iaDisponible } from "@/lib/server/estado-ia";
import { bloqueDeConocimiento, conocimientoVigente } from "@/lib/server/conocimiento";
import { configIA, promptDeEmpresa } from "@/lib/server/ia-config";
import { validar } from "@/lib/server/esquemas";
import { SugerenciaConversacion } from "@/lib/server/esquemas-portal";

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 20000, maxRetries: 0 })
  : null;

async function tryAiSuggestion({ client, lead, payload, channel, goal }) {
  /* Sin IA no se finge: se devuelve la base con `iaActiva: false` y el
     motivo, y el portal lo enseña en vez de hacer pasar la plantilla por
     una sugerencia de la IA. */
  const ia = await iaDisponible(client?.id);
  if (!openai || !ia.ok) return { ...payload, iaActiva: false, motivoSinIA: ia.motivo || "No hay clave de OpenAI configurada." };
  const [configEmpresa, conocimiento] = await Promise.all([
    configIA(client?.id),
    conocimientoVigente(client?.id).catch(() => []),
  ]);
  const promptEmpresa = promptDeEmpresa(configEmpresa, {
    empresa: client?.brand_name || client?.name || "", sector: client?.industry || "",
    conocimiento: bloqueDeConocimiento(conocimiento),
  });

  const prompt = `
${promptEmpresa}

Con eso delante, genera una respuesta breve y humana para este contacto.

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
    await reservarGeneracionIA(client?.id);
    const response = await conRegistroIA({ clientId: client?.id, uso: "sugerencia", modelo: "gpt-5-mini", promptVersion: "sugerencia-v1" }, () =>
      openai.responses.create({
      max_output_tokens: 1200,
      model: "gpt-5-mini",
      input: prompt.slice(0, 16000),
    })
    );

    const text = response.output_text?.trim() || "{}";
    const parsed = JSON.parse(text);

    return {
      ...payload,
      iaActiva: true,
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
        { success: false, message: "Sin permisos para pedir sugerencias IA" },
        { status: 403 }
      );
    }

    const limitado = await requireRateLimitAsync(req, {
      namespace: "conversations:suggest", limit: 30, windowMs: 60 * 60 * 1000,
      keyParts: [ctx.clientId], includeIp: false,
    });
    if (limitado) return limitado;

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(SugerenciaConversacion, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const leadId = leido.datos.leadId;
    const channel = leido.datos.channel.toLowerCase();
    const goal = leido.datos.goal.toLowerCase();

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
      throw new Error(leadError?.message || "No se pudo cargar el contacto");
    }

    const memory = await memoriaDeLead(leadId);

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
    const pausado = respuestaSiPausado(error);
    if (pausado) return pausado;
    return Response.json(
      {
        success: false,
        message: "No se pudo generar la sugerencia",
      },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.portal.conversations.suggest.post", manejarPOST);
