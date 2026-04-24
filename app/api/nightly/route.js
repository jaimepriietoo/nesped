import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runComplianceRetentionSweep } from "@/lib/server/compliance.mjs";
import { requirePortalRoleOrInternal } from "@/lib/server/security";
import {
  getAllLeadsForAutomation,
  normalizePhone,
  runFunnelAutomation,
  runOnboardingAutomation,
  runVoiceCallsAutomation,
  sendWhatsAppMessage,
} from "@/lib/server/automation-service";

function hoursBetween(dateA, dateB) {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.abs(b - a) / 1000 / 60 / 60;
}

function hasEventType(history, type) {
  return (history || []).some(
    (event) => String(event?.type || "").toLowerCase() === String(type).toLowerCase()
  );
}

function selectPaymentLinkFromLead(lead) {
  const score = Number(lead?.score || 0);
  const prob = Number(lead?.predicted_close_probability || 0);

  if (prob > 80 || score > 80) {
    return process.env.PAYMENT_PREMIUM || "";
  }

  if (prob > 50 || score > 50) {
    return process.env.PAYMENT_PRO || "";
  }

  return process.env.PAYMENT_BASIC || "";
}

function buildTimedRecoveryMessage(lead, stage, paymentLink, bookingUrl) {
  const name = lead?.nombre || "";

  if (stage === "30m") {
    return `Hola ${name}, te dejo por aquí el enlace por si quieres dejarlo resuelto ahora:\n${paymentLink}\n\nSi prefieres verlo antes conmigo, aquí tienes la agenda:\n${bookingUrl}`;
  }

  if (stage === "24h") {
    return `Hola ${name}, cierro seguimiento por aquí para no molestarte. Si quieres retomarlo, puedes hacerlo directamente aquí:\n${paymentLink}\n\nY si prefieres hablarlo antes, agenda aquí:\n${bookingUrl}`;
  }

  return `Hola ${name}, te dejo el enlace directo por si quieres retomarlo:\n${paymentLink}`;
}

export async function POST(req) {
  const access = await requirePortalRoleOrInternal(req);
  if (!access.ok) return access.response;

  try {
    const bookingUrl = process.env.BOOKING_URL || "";
    const leads = await getAllLeadsForAutomation();
    const processed = [];
    const failed = [];

    const recentPaymentEvents = await prisma.leadEvent.findMany({
      where: {
        type: {
          in: ["ai_reply_with_payment", "ai_payment_push"],
        },
      },
      orderBy: {
        created_at: "desc",
      },
      take: 100,
    });

    for (const paymentEvent of recentPaymentEvents) {
      try {
        const phone = paymentEvent.phone;
        if (!phone) continue;

        const history = await prisma.leadEvent.findMany({
          where: { phone },
          orderBy: { created_at: "desc" },
          take: 50,
        });

        const latestPaymentEvent = history.find((e) =>
          ["ai_reply_with_payment", "ai_payment_push"].includes(String(e.type || ""))
        );

        if (!latestPaymentEvent) continue;

        const alreadySent30m = hasEventType(history, "payment_followup_30m");
        const alreadySent24h = hasEventType(history, "payment_followup_24h");
        const leadBought = hasEventType(history, "payment_completed");

        if (leadBought) continue;

        const lead =
          leads.find(
            (l) => normalizePhone(l.telefono || "") === normalizePhone(phone)
          ) || null;

        if (!lead) continue;

        const paymentLink = selectPaymentLinkFromLead(lead);
        if (!paymentLink) continue;

        const elapsed = hoursBetween(latestPaymentEvent.created_at, new Date());

        let stage = null;
        if (elapsed >= 24 && !alreadySent24h) {
          stage = "24h";
        } else if (elapsed >= 0.5 && !alreadySent30m) {
          stage = "30m";
        }

        if (!stage) continue;

        const message = buildTimedRecoveryMessage(
          lead,
          stage,
          paymentLink,
          bookingUrl
        );

        await sendWhatsAppMessage(normalizePhone(phone), message);

        await prisma.leadEvent.create({
          data: {
            lead_id: lead.id || null,
            phone,
            type: stage === "30m" ? "payment_followup_30m" : "payment_followup_24h",
            message,
          },
        });

        processed.push({ phone, stage });
      } catch (err) {
        console.error(err);
        failed.push({ phone: paymentEvent.phone || null });
      }
    }

    const [
      funnelResult,
      onboardingResult,
      voiceResult,
      complianceResult,
    ] = await Promise.all([
      runFunnelAutomation(),
      runOnboardingAutomation(),
      runVoiceCallsAutomation(),
      runComplianceRetentionSweep(),
    ]);

    return NextResponse.json({
      success: true,
      processed: processed.length,
      failed: failed.length,
      data: processed,
      automation: {
        funnel: funnelResult,
        onboarding: onboardingResult,
        voice: voiceResult,
        compliance: complianceResult,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando follow-up automático",
    });
  }
}
