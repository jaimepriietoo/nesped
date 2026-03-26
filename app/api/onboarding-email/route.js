import { getResend } from "@/lib/resend";

export async function POST(req) {
  try {
    const resend = getResend();
    const body = await req.json();

    const { email, clientName, password, loginUrl } = body;

    if (!email || !clientName) {
      return Response.json(
        { success: false, message: "Faltan datos" },
        { status: 400 }
      );
    }

    const { error } = await resend.emails.send({
      from: "NESPED <onboarding@updates.nesped.com>",
      to: [email],
      subject: `Acceso a ${clientName}`,
      html: `
        <div style="font-family: Arial; background:#0a0a0a; color:#fff; padding:32px;">
          <h1>Bienvenido a ${clientName}</h1>
          <p>Tu acceso ya está listo.</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Contraseña:</strong> ${password}</p>
          <p style="margin-top:20px;">
            <a href="${loginUrl}" style="background:#fff;color:#000;padding:12px 18px;border-radius:10px;text-decoration:none;">
              Entrar al panel
            </a>
          </p>
        </div>
      `,
    });

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("Email error:", error);

    return Response.json(
      { success: false, message: error.message || "Error enviando email" },
      { status: 500 }
    );
  }
}