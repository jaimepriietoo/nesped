export async function GET() {
  try {
    const voiceServerUrl = process.env.VOICE_SERVER_URL || "http://localhost:3001";

    const res = await fetch(`${voiceServerUrl}/call`);

    if (!res.ok) {
      throw new Error(`Voice server error: ${res.status}`);
    }

    const text = await res.text();

    return Response.json({
      success: true,
      message: text,
    });

  } catch (error) {
    console.error("❌ Error lanzando demo:", error);

    return Response.json(
      {
        success: false,
        message: "No se pudo lanzar la llamada",
      },
      { status: 500 }
    );
  }
}

import twilio from "twilio";

export async function POST(req) {
  try {
    const body = await req.json();
    const telefono = body.telefono;

    if (!telefono) {
      return Response.json(
        { success: false, message: "Falta teléfono" },
        { status: 400 }
      );
    }

    const client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );

    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/voice`,
      to: telefono,
      from: process.env.TWILIO_PHONE_NUMBER,
    });

    return Response.json({
      success: true,
      callSid: call.sid,
      message: "Llamada iniciada correctamente",
    });
  } catch (error) {
    console.error("Error llamada demo:", error);

    return Response.json(
      {
        success: false,
        message: "Error iniciando llamada",
      },
      { status: 500 }
    );
  }
}