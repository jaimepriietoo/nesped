import { NextResponse } from "next/server";
import { getPortalContext } from "@/lib/portal-auth";
import { getClientProductPerformance } from "@/lib/server/portal-phase-two";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const snapshot = await getClientProductPerformance({
      clientId: ctx.clientId,
      limit: 1000,
    });

    return NextResponse.json({
      success: true,
      data: snapshot.rows,
      summary: snapshot.summary,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error obteniendo rendimiento de productos",
    });
  }
}

export const GET = observeRoute("api.analytics.product-performance.get", manejarGET);
