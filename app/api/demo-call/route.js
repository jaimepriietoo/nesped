import twilio from "twilio";

export async function POST(req) {
  try {
    const body = await req.json();
    const telefono = body.telefono?.trim();
    const clientId = body.client_id || "demo";

    if (!telefono) {
      return Response.json(
        { success: false, message: "Falta teléfono" },
        { status: 400 }
      );
    }

    const accountSid =
      process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID;
    const authToken =
      process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN;
    const fromNumber =
      process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_NUMERO;

    const cleanBaseUrl = (process.env.BASE_URL || "").replace(/\/+$/, "");

    const client = twilio(accountSid, authToken);

    const call = await client.calls.create({
      url: `${cleanBaseUrl}/voice?client_id=${clientId}`,
      to: telefono,
      from: fromNumber,
      method: "POST",
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
        message: error?.message || "Error iniciando llamada",
      },
      { status: 500 }
    );
  }
}