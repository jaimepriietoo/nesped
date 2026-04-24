import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "");
}

function parseEventMessage(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getEventScoreDelta(event) {
  const type = String(event?.type || "").toLowerCase();
  const raw = parseEventMessage(event?.message || "");
  const text =
    typeof raw === "string"
      ? raw.toLowerCase()
      : String(raw?.message || "").toLowerCase();

  let delta = 0;

  if (type === "incoming_whatsapp") delta += 8;
  if (type === "ai_reply") delta += 2;
  if (type === "ai_reply_with_payment") delta += 14;
  if (type === "ai_payment_recovery") delta += 6;
  if (type === "payment_followup_30m") delta += 2;
  if (type === "payment_followup_24h") delta += 1;
  if (type === "payment_completed") delta += 35;
  if (type === "lead_reactivation") delta += 4;

  if (text.includes("me interesa")) delta += 14;
  if (text.includes("quiero")) delta += 12;
  if (text.includes("cómo pago")) delta += 18;
  if (text.includes("precio")) delta += 4;
  if (text.includes("agenda")) delta += 10;
  if (text.includes("vale")) delta += 8;
  if (text.includes("ok")) delta += 5;

  if (text.includes("caro")) delta -= 8;
  if (text.includes("pensarlo")) delta -= 6;
  if (text.includes("ahora no")) delta -= 10;
  if (text.includes("más adelante")) delta -= 8;
  if (text.includes("no me interesa")) delta -= 20;

  return delta;
}

function calculateLeadBaseScore(lead) {
  let score = Number(lead?.score || 0);

  const interes = String(lead?.interes || "").toLowerCase();
  const status = String(lead?.status || "new").toLowerCase();
  const prob = Number(lead?.predicted_close_probability || 0);
  const value = Number(lead?.valor_estimado || 0);

  if (interes === "alto") score += 10;
  if (interes === "medio") score += 4;
  if (interes === "bajo") score -= 5;

  if (status === "contacted") score += 5;
  if (status === "qualified") score += 12;
  if (status === "won") score = 100;
  if (status === "lost") score = 5;

  if (prob >= 80) score += 12;
  else if (prob >= 60) score += 8;
  else if (prob >= 40) score += 3;

  if (value >= 1000) score += 8;
  else if (value >= 500) score += 4;

  if (!lead?.owner) score -= 3;

  return score;
}

function calculateFreshnessAdjustment(events) {
  if (!events?.length) return -4;

  const latest = new Date(events[0].created_at).getTime();
  const hoursAgo = (Date.now() - latest) / 1000 / 60 / 60;

  if (hoursAgo <= 1) return 10;
  if (hoursAgo <= 6) return 7;
  if (hoursAgo <= 24) return 4;
  if (hoursAgo <= 72) return 0;
  if (hoursAgo <= 24 * 7) return -6;
  return -12;
}

function calculateDynamicScore(lead, events) {
  let score = calculateLeadBaseScore(lead);

  for (const event of events) {
    score += getEventScoreDelta(event);
  }

  score += calculateFreshnessAdjustment(events);

  const bounded = clamp(Math.round(score), 0, 100);

  const predictedCloseProbability = clamp(
    Math.round(bounded * 0.9 + (Number(lead?.predicted_close_probability || 0) * 0.1)),
    0,
    100
  );

  return {
    score: bounded,
    predicted_close_probability: predictedCloseProbability,
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

export async function POST(req) {
  const access = await requirePortalRoleOrInternal(req);
  if (!access.ok) return access.response;

  try {
    const overview = await getOverview();
    const leads = Array.isArray(overview?.leads) ? overview.leads : [];

    const processed = [];
    const failed = [];

    for (const lead of leads) {
      try {
        const phone = normalizePhone(lead?.telefono || "");
        const leadId = lead?.id;

        if (!leadId) continue;

        let events = [];

        if (phone) {
          events = await prisma.leadEvent.findMany({
            where: { phone },
            orderBy: { created_at: "desc" },
            take: 30,
          });
        } else {
          events = await prisma.leadEvent.findMany({
            where: { lead_id: leadId },
            orderBy: { created_at: "desc" },
            take: 30,
          });
        }

        const dynamic = calculateDynamicScore(lead, events);

        await patchLead(leadId, {
          score: dynamic.score,
          predicted_close_probability: dynamic.predicted_close_probability,
          ultima_accion: `Score dinámico recalculado automáticamente`,
        });

        processed.push({
          leadId,
          score: dynamic.score,
          predicted_close_probability: dynamic.predicted_close_probability,
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
      message: "Error recalculando scoring dinámico",
    });
  }
}
