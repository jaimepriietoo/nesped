import { NextResponse } from "next/server";
import { getPortalContext, hasRole } from "@/lib/portal-auth";

export async function POST(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager", "agent"])) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para automatizar WhatsApp" },
        { status: 403 }
      );
    }

    const { leadId } = await req.json();
    if (!leadId) {
      return NextResponse.json(
        { success: false, message: "Falta leadId" },
        { status: 400 }
      );
    }

    const { data: lead, error } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !lead) {
      return NextResponse.json(
        { success: false, message: error?.message || "Lead no encontrado" },
        { status: 404 }
      );
    }

    let message = "";

    if (lead.status === "new") {
      message = `Hola ${lead.nombre}, vimos tu solicitud.`;
    } else if (lead.status === "contacted") {
      message = "¿Te viene bien hablar hoy 10 min?";
    } else if (lead.status === "qualified") {
      message = "Reserva aquí: https://cal.com/TU_LINK";
    } else {
      return NextResponse.json({
        success: false,
        message: "Este lead no tiene una automatización de WhatsApp aplicable.",
      });
    }

    return NextResponse.json({ success: true, message });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Error en WhatsApp autopilot" },
      { status: 500 }
    );
  }
}
