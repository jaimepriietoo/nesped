import { getPortalContext } from "@/lib/portal-auth";
import { buildBrandLabWorkspace } from "@/lib/portal-product";
import { productos } from "@/lib/server/datos";
import { observeRoute } from "@/lib/server/observability.mjs";

function buildServices(client, settings) {
  const hayVozConfigurada = Boolean(
    /* La voz la lleva ElevenLabs sobre un número de Twilio importado en su
       panel. Hacen falta las tres: sin el id del número no hay línea. */
    process.env.ELEVENLABS_API_KEY &&
      process.env.ELEVENLABS_AGENT_ID &&
      process.env.ELEVENLABS_PHONE_NUMBER_ID
  );
  const hasTelnyxWhatsApp = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER)
  );

  return {
    telephony: {
      ready: Boolean(hayVozConfigurada && client?.twilio_number),
      detail:
        hayVozConfigurada && client?.twilio_number
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

async function manejarGET() {
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
      productos({ activos: true }),
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
        message: "No se pudo cargar Brand Lab",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.brand-lab.get", manejarGET);
