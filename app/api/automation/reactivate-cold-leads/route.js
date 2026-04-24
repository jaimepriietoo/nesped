import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const BOOKING_URL = process.env.BOOKING_URL || "";

function normalizePhone(value = "") {
  return String(value).replace(/[^\d+]/g, "");
}

function hoursSince(date) {
  return (Date.now() - new Date(date).getTime()) / 1000 / 60 / 60;
}

function buildReactivationMessage(lead, stage) {
  const name = lead?.nombre || "";

  if (stage === "24h") {
    return `Hola ${name}, te escribo porque no quería dejar esto en el aire. Si te sigue encajando, lo vemos aquí:\n${BOOKING_URL}`;
  }

  if (stage === "3d") {
    return `Hola ${name}, sigo teniendo esto disponible para ti. Si quieres retomarlo, aquí puedes reservar directamente:\n${BOOKING_URL}`;
  }

  if (stage === "7d") {
    return `Hola ${name}, cierro seguimiento por no molestarte. Si te encaja retomarlo más adelante, aquí tienes el enlace directo:\n${BOOKING_URL}`;
  }

  return `Hola ${name}, te dejo por aquí el enlace por si quieres retomarlo:\n${BOOKING_URL}`;
}

async function getOverview() {
  const res = await fetch(`${BASE_URL}/api/portal/overview`, {
    cache: "no-store",
  });
  return await res.json();
}

async function sendWhatsapp(to, message) {
  return fetch(`${BASE_URL}/api/automation/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getInternalApiHeaders(),
    },
    body: JSON.stringify({
      to,
      message,
    }),
  });
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
        const status = String(lead?.status || "new").toLowerCase();

        if (["won", "lost"].includes(status)) continue;
        if (!lead?.telefono) continue;

        const phone = normalizePhone(lead.telefono);
        if (!phone) continue;

        const history = await prisma.leadEvent.findMany({
          where: { phone },
          orderBy: { created_at: "desc" },
          take: 50,
        });

        const reactivations = await prisma.leadReactivation.findMany({
          where: { phone },
          orderBy: { sent_at: "desc" },
          take: 20,
        });

        const lastIncoming = history.find((e) => e.type === "incoming_whatsapp");
        const lastAiReply = history.find((e) =>
          ["ai_reply", "ai_reply_with_payment", "ai_payment_recovery"].includes(String(e.type || ""))
        );

        const referenceDate =
          lastIncoming?.created_at ||
          lastAiReply?.created_at ||
          lead?.updated_at ||
          lead?.created_at;

        if (!referenceDate) continue;

        const elapsed = hoursSince(referenceDate);

        const sent24h = reactivations.some((r) => r.stage === "24h");
        const sent3d = reactivations.some((r) => r.stage === "3d");
        const sent7d = reactivations.some((r) => r.stage === "7d");

        let stage = null;

        if (elapsed >= 24 * 7 && !sent7d) {
          stage = "7d";
        } else if (elapsed >= 24 * 3 && !sent3d) {
          stage = "3d";
        } else if (elapsed >= 24 && !sent24h) {
          stage = "24h";
        }

        if (!stage) continue;

        const message = buildReactivationMessage(lead, stage);

        await sendWhatsapp(phone, message);

        await prisma.leadReactivation.create({
          data: {
            lead_id: lead.id || null,
            phone,
            stage,
            message,
          },
        });

        await prisma.leadEvent.create({
          data: {
            lead_id: lead.id || null,
            phone,
            type: "lead_reactivation",
            message: JSON.stringify({
              stage,
              message,
            }),
          },
        });

        processed.push({
          leadId: lead.id,
          phone,
          stage,
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
      message: "Error reactivando leads fríos",
    });
  }
}
