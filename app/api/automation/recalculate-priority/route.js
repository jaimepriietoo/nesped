import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "");
}

function priorityRank(bucket) {
  if (bucket === "urgente") return 4;
  if (bucket === "alta") return 3;
  if (bucket === "media") return 2;
  return 1;
}

function calculatePriorityForLead(lead, events = [], memory = null) {
  const score = Number(lead?.score || 0);
  const probability = Number(lead?.predicted_close_probability || 0);
  const value = Number(lead?.valor_estimado || 0);
  const status = String(lead?.status || "new").toLowerCase();
  const objection = String(memory?.last_objection || "").toLowerCase();
  const intent = String(memory?.last_intent || "").toLowerCase();
  const temperature = String(memory?.temperature || "").toLowerCase();

  if (status === "won") {
    return {
      priority_bucket: "baja",
      priority_reason: "Lead ganado, prioridad comercial cerrada",
    };
  }

  if (status === "lost") {
    return {
      priority_bucket: "baja",
      priority_reason: "Lead perdido, no requiere atención inmediata",
    };
  }

  const latestEvent = events?.[0] || null;
  const hoursSinceLastEvent = latestEvent
    ? (Date.now() - new Date(latestEvent.created_at).getTime()) / 1000 / 60 / 60
    : 999;

  if (
    status === "qualified" &&
    (probability >= 85 || score >= 85 || intent === "comprar" || temperature === "caliente")
  ) {
    return {
      priority_bucket: "urgente",
      priority_reason: "Lead listo para cierre con alta probabilidad",
    };
  }

  if (
    value >= 1000 ||
    probability >= 75 ||
    score >= 75 ||
    intent === "agenda" ||
    intent === "precio"
  ) {
    return {
      priority_bucket: "alta",
      priority_reason: "Lead valioso o cerca de conversión",
    };
  }

  if (
    hoursSinceLastEvent >= 24 ||
    objection === "pensarlo" ||
    objection === "tiempo" ||
    status === "contacted"
  ) {
    return {
      priority_bucket: "media",
      priority_reason: "Lead activo que necesita seguimiento",
    };
  }

  return {
    priority_bucket: "baja",
    priority_reason: "Lead frío o todavía poco cualificado",
  };
}

async function getOverview() {
  const res = await fetch(`${BASE_URL}/api/portal/overview`, {
    cache: "no-store",
  });
  return await res.json();
}

async function patchLead(leadId, changes) {
  const res = await fetch(`${BASE_URL}/api/leads/update`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      leadId,
      ...changes,
    }),
  });

  return await res.json();
}

export async function POST() {
  try {
    const overview = await getOverview();
    const leads = Array.isArray(overview?.leads) ? overview.leads : [];

    const processed = [];
    const failed = [];

    for (const lead of leads) {
      try {
        const leadId = lead?.id;
        const phone = normalizePhone(lead?.telefono || "");

        if (!leadId) continue;

        const events = await prisma.leadEvent.findMany({
          where: phone
            ? {
                OR: [{ lead_id: leadId }, { phone }],
              }
            : { lead_id: leadId },
          orderBy: {
            created_at: "desc",
          },
          take: 20,
        });

        const memory = await prisma.leadMemory.findUnique({
          where: { lead_id: leadId },
        });

        const priority = calculatePriorityForLead(lead, events, memory);

        await patchLead(leadId, {
          priority_bucket: priority.priority_bucket,
          priority_reason: priority.priority_reason,
        });

        processed.push({
          leadId,
          ...priority,
        });
      } catch (err) {
        console.error(err);
        failed.push({
          leadId: lead?.id || null,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: processed.length,
      failed: failed.length,
      data: processed,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error recalculando prioridad",
    });
  }
}