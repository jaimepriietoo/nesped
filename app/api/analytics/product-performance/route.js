import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const paymentEvents = await prisma.leadEvent.findMany({
      where: {
        type: "payment_completed",
      },
      orderBy: {
        created_at: "desc",
      },
      take: 500,
    });

    const productMap = new Map();

    for (const event of paymentEvents) {
      const parsed = safeParse(event.message || "{}") || {};
      const tier = parsed.product_tier || "unknown";
      const amount = Number(parsed.amount_total || 0);

      if (!productMap.has(tier)) {
        productMap.set(tier, {
          tier,
          sales: 0,
          revenue: 0,
        });
      }

      const current = productMap.get(tier);
      current.sales += 1;
      current.revenue += amount;
    }

    const rows = Array.from(productMap.values()).sort((a, b) => b.revenue - a.revenue);

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error obteniendo rendimiento de productos",
    });
  }
}