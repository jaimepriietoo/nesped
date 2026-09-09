import { getPortalContext } from "@/lib/portal-auth";
import { safeLoadClientSettings } from "@/lib/client-settings";
import { prisma } from "@/lib/prisma";
import {
  buildEnvReadinessReport,
  getFeatureReport,
} from "@/lib/server/env.mjs";
import { observeRoute } from "@/lib/server/observability.mjs";

function getFreshnessLevel(dateValue, maxAgeHours) {
  if (!dateValue) {
    return { ready: false, level: "warning", ageHours: null };
  }

  const ageHours =
    (Date.now() - new Date(dateValue).getTime()) / (1000 * 60 * 60);

  if (ageHours <= maxAgeHours) {
    return { ready: true, level: "healthy", ageHours };
  }

  if (ageHours <= maxAgeHours * 3) {
    return { ready: false, level: "warning", ageHours };
  }

  return { ready: false, level: "critical", ageHours };
}

async function handleGet() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message },
        { status: 401 }
      );
    }

    const [
      clientRes,
      settingsRes,
      leadRes,
      callRes,
      alertsRes,
      billingRes,
    ] = await Promise.all([
      ctx.supabase
        .from("clients")
        .select("id,brand_name,name,twilio_number,webhook,stripe_customer_id")
        .eq("id", ctx.clientId)
        .single(),
      safeLoadClientSettings(ctx.supabase, ctx.clientId),
      ctx.supabase
        .from("leads")
        .select("id,created_at")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from("calls")
        .select("id,created_at")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      ctx.supabase
        .from("alerts")
        .select("id,severity,created_at")
        .eq("client_id", ctx.clientId)
        .order("created_at", { ascending: false })
        .limit(10),
      ctx.supabase
        .from("subscriptions")
        .select("*")
        .eq("client_id", ctx.clientId)
        .in("status", ["trialing", "active", "past_due", "unpaid", "incomplete"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const client = clientRes.data || null;
    const settings = settingsRes?.data || null;
    const latestLead = leadRes.data || null;
    const latestCall = callRes.data || null;
    const alerts = alertsRes.data || [];
    const envReport = buildEnvReadinessReport();
    const aiEnv = getFeatureReport(envReport, "ai");
    const billingEnv = getFeatureReport(envReport, "billing");
    const hayVozConfigurada = Boolean(
    /* La voz la lleva ElevenLabs sobre un número de Twilio importado en su
       panel. Hacen falta las tres: sin el id del número no hay línea. */
    process.env.ELEVENLABS_API_KEY &&
      process.env.ELEVENLABS_AGENT_ID &&
      process.env.ELEVENLABS_PHONE_NUMBER_ID
  );
    const hayWhatsApp = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        (process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER)
    );
    const hasClientVoiceNumber = Boolean(client?.twilio_number);

    /* Ya no hay dos modos de telefonía que comparar. Antes había el camino
       viejo —Telnyx pasando audio a OpenAI en tiempo real— y el híbrido con
       ElevenLabs. El viejo se ha retirado: la conversación la lleva ElevenLabs
       sobre un número de Twilio, y punto. */
    const hayTelefonia = Boolean(
      process.env.ELEVENLABS_API_KEY &&
        process.env.ELEVENLABS_AGENT_ID &&
        process.env.ELEVENLABS_PHONE_NUMBER_ID &&
        process.env.INTERNAL_API_TOKEN &&
        hasClientVoiceNumber
    );

    const services = {
      auth: {
        ready: true,
        level: "healthy",
        detail: "Sesión y permisos del portal operativos.",
      },
      ai: {
        ready: Boolean(aiEnv?.ready),
        level: aiEnv?.status || "critical",
        detail: process.env.OPENAI_API_KEY
          ? "OpenAI configurado."
          : "Falta OPENAI_API_KEY.",
      },
      telephony: {
        ready: hayTelefonia,
        level: hayTelefonia ? "healthy" : "warning",
        detail: hayTelefonia
          ? "Telefonía lista: ElevenLabs atiende las llamadas sobre Twilio."
          : !hasClientVoiceNumber
            ? "Falta el número de voz de la empresa."
            : "Falta conectar el número de Twilio al agente de ElevenLabs.",
      },
      whatsapp: {
        ready: hayWhatsApp,
        level: hayWhatsApp ? "healthy" : "warning",
        detail: hayWhatsApp
          ? "Canal de WhatsApp listo con las credenciales de Twilio."
          : "Faltan credenciales de Twilio para WhatsApp.",
      },
      billing: {
        ready: Boolean(client?.stripe_customer_id || billingRes),
        level:
          client?.stripe_customer_id || billingRes
            ? "healthy"
            : billingEnv?.status === "critical"
              ? "critical"
              : "warning",
        detail:
          client?.stripe_customer_id || billingRes
            ? "Billing conectado a Stripe."
            : "Aún no hay customer o suscripción gestionada en Stripe.",
      },
      reporting: {
        ready: Boolean(
          settings?.daily_report_email || settings?.weekly_report_email
        ),
        level:
          settings?.daily_report_email || settings?.weekly_report_email
            ? "healthy"
            : "warning",
        detail:
          settings?.daily_report_email || settings?.weekly_report_email
            ? "Reporting por email activo."
            : "No hay emails de reporting configurados.",
      },
    };

    const leadFreshness = getFreshnessLevel(latestLead?.created_at, 72);
    const callFreshness = getFreshnessLevel(latestCall?.created_at, 72);
    const highAlerts = alerts.filter((item) => item.severity === "high").length;

    let summaryLevel = "healthy";
    let summaryMessage = "El sistema está operativo y sin señales críticas.";

    if (
      Object.values(services).some((item) => item.level === "critical") ||
      highAlerts > 0
    ) {
      summaryLevel = "critical";
      summaryMessage =
        "Hay señales críticas o alertas altas. Conviene revisar operaciones.";
    } else if (
      Object.values(services).some((item) => item.level === "warning") ||
      leadFreshness.level !== "healthy" ||
      callFreshness.level !== "healthy"
    ) {
      summaryLevel = "warning";
      summaryMessage =
        "La base está bien, pero hay piezas que conviene completar o vigilar.";
    }

    return Response.json({
      success: true,
      data: {
        summary: {
          level: summaryLevel,
          message: summaryMessage,
          highAlerts,
        },
        services,
        freshness: {
          leads: leadFreshness,
          calls: callFreshness,
        },
        env: {
          summary: envReport.summary,
          features: envReport.features.map((feature) => ({
            id: feature.id,
            label: feature.label,
            status: feature.status,
            requiredMissing: feature.missingRequired.length,
            recommendedMissing: feature.missingRecommended.length,
          })),
        },
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar la salud del sistema",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.health.get", handleGet);
