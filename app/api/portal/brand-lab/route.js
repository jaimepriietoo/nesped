import { getPortalContext } from "@/lib/portal-auth";
import { buildBrandLabWorkspace } from "@/lib/portal-product";
import { prisma } from "@/lib/prisma";

function buildServices(client, settings) {
  const hasTelnyxVoice = Boolean(
    process.env.TELNYX_API_KEY &&
      process.env.TELNYX_PHONE_NUMBER &&
      (process.env.TELNYX_TEXML_APPLICATION_ID ||
        process.env.TELNYX_APPLICATION_SID)
  );
  const hasTelnyxWhatsApp = Boolean(
    process.env.TELNYX_API_KEY &&
      (process.env.TELNYX_WHATSAPP_NUMBER || process.env.TELNYX_PHONE_NUMBER)
  );

  return {
    telephony: {
      ready: Boolean(hasTelnyxVoice && client?.twilio_number),
      detail:
        hasTelnyxVoice && client?.twilio_number
          ? "Telefonía preparada para producción con Telnyx."
          : "Falta número o configuración base de Telnyx.",
    },
    whatsapp: {
      ready: hasTelnyxWhatsApp,
      detail:
        hasTelnyxWhatsApp
          ? "Canal WhatsApp con credenciales listas en Telnyx."
          : "Faltan credenciales base de Telnyx para WhatsApp.",
    },
    billing: {
      ready: Boolean(client?.stripe_customer_id),
      detail: client?.stripe_customer_id
        ? "Billing ya está vinculado a Stripe."
        : "Aún no hay customer de Stripe asociado.",
    },
    reporting: {
      ready: Boolean(
        settings?.daily_report_email || settings?.weekly_report_email
      ),
      detail:
        settings?.daily_report_email || settings?.weekly_report_email
          ? "Reporting operativo configurado."
          : "Activa reporting para dejar la experiencia ejecutiva cerrada.",
    },
  };
}

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, products] = await Promise.all([
      ctx.supabase
        .from("clients")
        .select(
          "id,name,brand_name,brand_logo_url,primary_color,secondary_color,logo_text,custom_domain,accent,accent_text,button,badge,tagline,webhook,twilio_number,stripe_customer_id"
        )
        .eq("id", ctx.clientId)
        .single(),
      ctx.supabase
        .from("client_settings")
        .select("*")
        .eq("client_id", ctx.clientId)
        .maybeSingle(),
      prisma.product.findMany({
        where: { active: true },
        orderBy: { price: "asc" },
      }),
    ]);

    const errors = [clientRes.error, settingsRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Brand Lab");
    }

    const client = clientRes.data || {};
    const settings = settingsRes.data || {};
    const services = buildServices(client, settings);

    return Response.json({
      success: true,
      data: buildBrandLabWorkspace({
        client,
        settings,
        products,
        services,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Brand Lab",
      },
      { status: 500 }
    );
  }
}
