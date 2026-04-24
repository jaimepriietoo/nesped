import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

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

export async function POST(req) {
  const access = await requirePortalRoleOrInternal(req);
  if (!access.ok) return access.response;

  try {
    const paymentEvents = await prisma.leadEvent.findMany({
      where: {
        type: "payment_completed",
      },
      orderBy: {
        created_at: "desc",
      },
      take: 200,
    });

    const processed = [];
    const failed = [];

    for (const payment of paymentEvents) {
      try {
        const parsed = safeParse(payment.message || "{}") || {};
        const fromTier = parsed.product_tier || "basic";
        const toTier = getNextTier(fromTier);
        const phone = normalizePhone(payment.phone || "");

        if (!toTier || !phone) continue;

        const existing = await prisma.upsellEvent.findFirst({
          where: {
            lead_id: payment.lead_id || null,
            phone,
            from_tier: fromTier,
            to_tier: toTier,
          },
        });

        if (existing) continue;

        const paymentLink =
          toTier === "premium"
            ? process.env.PAYMENT_PREMIUM || ""
            : process.env.PAYMENT_PRO || "";

        if (!paymentLink) continue;

        const message = `Como ya has dado el primer paso, te encaja bien subir a ${toTier.toUpperCase()}. Si quieres, puedes hacerlo directamente aquí:\n${paymentLink}`;

        await sendWhatsapp(phone, message);

        await prisma.upsellEvent.create({
          data: {
            lead_id: payment.lead_id || null,
            phone,
            from_tier: fromTier,
            to_tier: toTier,
            status: "sent",
            message,
          },
        });

        processed.push({
          phone,
          fromTier,
          toTier,
        });
      } catch (err) {
        console.error(err);
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
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error ejecutando upsells",
    });
  }
}
