import { NextResponse } from "next/server";
import { crearEventoLead, eventosDeLead, eventosPorTipo } from "@/lib/server/datos";
import { runComplianceRetentionSweep } from "@/lib/server/compliance.mjs";
import { requireInternalRequest } from "@/lib/server/internal-api";
import {
  getAllLeadsForAutomation,
  normalizePhone,
  runFunnelAutomation,
  runOnboardingAutomation,
  runVoiceCallsAutomation,
  sendWhatsAppMessage,
} from "@/lib/server/automation-service";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

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

/*
 * Tarea de sistema: sólo se lanza desde dentro, con el token interno.
 *
 * Antes valía también una sesión de portal con rol owner, admin o manager, y
 * eso era un problema serio: estas tareas recorren los contactos de TODAS las
 * empresas —getAllLeadsForAutomation() no filtra por cliente— y desde ahí
 * mandan mensajes, hacen llamadas y escriben en sus fichas.
 *
 * O sea que cualquier cliente podía disparar mensajería saliente a los
 * contactos de todos los demás. No hay ninguna pantalla que las llame: son
 * trabajos programados, y como tales se cierran.
 */
async function manejarPOST(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    const bookingUrl = process.env.BOOKING_URL || "";
    const leads = await getAllLeadsForAutomation();
    const processed = [];
    const failed = [];

    const recentPaymentEvents = [
      ...(await eventosPorTipo({ type: "ai_reply_with_payment", cuantos: 100 })),
      ...(await eventosPorTipo({ type: "ai_payment_push", cuantos: 100 })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 100);

    for (const paymentEvent of recentPaymentEvents) {
      try {
        const phone = paymentEvent.phone;
        if (!phone) continue;

        const history = await eventosDeLead({ phone, cuantos: 50 });

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

        await crearEventoLead({
          client_id: lead.client_id || paymentEvent.client_id || null,
          lead_id: lead.id || null,
          phone,
          type: stage === "30m" ? "payment_followup_30m" : "payment_followup_24h",
          message,
        });

        processed.push({ phone, stage });
      } catch (err) {
        logErrorSeguro("nightly.payment_item_failed", err);
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
    logErrorSeguro("nightly.failed", err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando follow-up automático",
    });
  }
}

export const POST = observeRoute("api.nightly.post", manejarPOST);
