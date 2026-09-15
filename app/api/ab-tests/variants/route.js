import { NextResponse } from "next/server";
import { variantes, crearVariante } from "@/lib/server/datos";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireSameOrigin } from "@/lib/server/security";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const rows = await variantes({ client_id: ctx.clientId, activas: false });

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error obteniendo variantes",
    });
  }
}

export async function POST(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) {
      return sameOriginError;
    }

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "experiments.manage")) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para crear variantes" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const row = await crearVariante({
      client_id: ctx.clientId,
      name: body.name || "",
      channel: body.channel || "whatsapp",
      stage: body.stage || "qualified",
      content: body.content || "",
      active: body.active !== false,
    });

    return NextResponse.json({
      success: true,
      data: row,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      success: false,
      message: "Error creando variante",
    });
  }
}
