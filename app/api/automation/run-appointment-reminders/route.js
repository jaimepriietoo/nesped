import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requireInternalRequest } from "@/lib/server/internal-api";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function hoursUntil(date) {
  return (new Date(date).getTime() - Date.now()) / 1000 / 60 / 60;
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
export async function POST(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  try {
    const rows = await prisma.appointment.findMany({
      where: {
        status: "booked",
      },
      orderBy: {
        start_at: "asc",
      },
      take: 200,
    });

    const processed = [];
    const failed = [];

    for (const row of rows) {
      try {
        if (!row.phone) continue;

        const diff = hoursUntil(row.start_at);

        let reminderType = null;

        if (diff <= 24 && diff > 23) reminderType = "appointment_reminder_24h";
        if (diff <= 1 && diff > 0) reminderType = "appointment_reminder_1h";

        if (!reminderType) continue;

        const existing = await prisma.leadEvent.findFirst({
          where: {
            lead_id: row.lead_id || null,
            phone: row.phone,
            type: reminderType,
          },
        });

        if (existing) continue;

        const message =
          reminderType === "appointment_reminder_24h"
            ? `Te recuerdo que mañana tienes tu cita con nosotros.`
            : `Te recuerdo que tu cita empieza en menos de 1 hora.`;

        await sendWhatsapp(row.phone, message);

        await prisma.leadEvent.create({
          data: {
            lead_id: row.lead_id || null,
            phone: row.phone,
            type: reminderType,
            message,
          },
        });

        processed.push({
          appointmentId: row.id,
          reminderType,
        });
      } catch (err) {
        console.error(err);
        failed.push({
          appointmentId: row.id,
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
      message: "Error enviando recordatorios de cita",
    });
  }
}
