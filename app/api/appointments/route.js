import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const rows = await prisma.appointment.findMany({
      orderBy: {
        start_at: "asc",
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
      message: "Error obteniendo citas",
    });
  }
}

export async function POST(req) {
  try {
    const body = await req.json();

    const row = await prisma.appointment.create({
      data: {
        lead_id: body.lead_id || null,
        phone: body.phone || null,
        start_at: new Date(body.start_at),
        end_at: body.end_at ? new Date(body.end_at) : null,
        status: body.status || "booked",
        source: body.source || "manual",
        owner: body.owner || "",
        notes: body.notes || "",
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
      message: "Error creando cita",
    });
  }
}