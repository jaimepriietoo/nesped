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
        { success: false, message: "Sin permisos" },
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
      .select("id, telefono, nombre, necesidad, status")
      .eq("id", leadId)
      .eq("client_id", ctx.clientId)
      .single();

    if (error || !lead?.telefono) {
      return NextResponse.json(
        { success: false, message: error?.message || "Lead sin teléfono" },
        { status: 404 }
      );
    }

    let message = "";

    if (lead.status === "new") {
      message = `Hola ${lead.nombre}, soy del equipo. ¿Sigues interesado en ${lead.necesidad}?`;
    } else if (lead.status === "contacted") {
      message = `Perfecto ${lead.nombre}, ¿te viene bien una llamada de 10 minutos para ayudarte?`;
    } else if (lead.status === "qualified") {
      message = "Te dejo aquí mi agenda para ayudarte: https://cal.com/TU_LINK";
    } else {
      message = "Seguimos disponibles para ayudarte.";
    }

    const phone = String(lead.telefono || "").replace(/[^\d+]/g, "");
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;

    return NextResponse.json({
      success: true,
      url,
      message,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { success: false, message: "Error IA" },
      { status: 500 }
    );
  }
}
