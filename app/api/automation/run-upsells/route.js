import { NextResponse } from "next/server";
import { eventosPorTipo, ultimoUpsell, crearUpsell } from "@/lib/server/datos";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function normalizePhone(value = "") {
  return String(value || "").replace(/[^\d+]/g, "");
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function getNextTier(tier) {
  const current = String(tier || "").toLowerCase();
  if (current === "basic") return "pro";
  if (current === "pro") return "premium";
  return null;
}

async function sendWhatsapp(to, message) {
  const res = await fetch(`${BASE_URL}/api/automation/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getInternalApiHeaders(),
    },
    body: JSON.stringify({ to, message }),
  });

  return await res.json();
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
    const paymentEvents = await eventosPorTipo({ type: "payment_completed", cuantos: 200 });

    const processed = [];
    const failed = [];

    for (const payment of paymentEvents) {
      try {
        const parsed = safeParse(payment.message || "{}") || {};
        const fromTier = parsed.product_tier || "basic";
        const toTier = getNextTier(fromTier);
        const phone = normalizePhone(payment.phone || "");

        if (!toTier || !phone) continue;

        const existing = await ultimoUpsell({
          lead_id: payment.lead_id || null, phone, from_tier: fromTier, to_tier: toTier,
        });

        if (existing) continue;

        const paymentLink =
          toTier === "premium"
            ? process.env.PAYMENT_PREMIUM || ""
            : process.env.PAYMENT_PRO || "";

        if (!paymentLink) continue;

        const message = `Como ya has dado el primer paso, te encaja bien subir a ${toTier.toUpperCase()}. Si quieres, puedes hacerlo directamente aquí:\n${paymentLink}`;

        await sendWhatsapp(phone, message);

        await crearUpsell({
          client_id: payment.client_id || null,
          lead_id: payment.lead_id || null,
          phone,
          from_tier: fromTier,
          to_tier: toTier,
          status: "sent",
          message,
        });

        processed.push({
          phone,
          fromTier,
          toTier,
        });
      } catch (err) {
        logErrorSeguro("automation.upsell_item_failed", err);
        failed.push({
          phone: payment.phone || null,
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
    logErrorSeguro("automation.upsells_failed", err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando upsells",
    });
  }
}

export const POST = observeRoute("api.automation.run-upsells.post", manejarPOST);
