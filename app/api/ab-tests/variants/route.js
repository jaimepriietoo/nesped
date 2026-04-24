import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPortalContext, hasRole } from "@/lib/portal-auth";
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

    const rows = await prisma.messageVariant.findMany({
      orderBy: {
        created_at: "desc",
      },
    });

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

    if (!hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para crear variantes" },
        { status: 403 }
      );
    }

    const body = await req.json();

    const row = await prisma.messageVariant.create({
      data: {
        name: body.name || "",
        channel: body.channel || "whatsapp",
        stage: body.stage || "qualified",
        content: body.content || "",
        active: body.active !== false,
      },
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
