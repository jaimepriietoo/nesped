import { etiqueta, NIVEL_SALUD } from "../etiquetas.js";
const FEATURE_DEFINITIONS = [
  {
    id: "core",
    label: "Aplicación base",
    checks: [
      { label: "URL de Supabase", names: ["SUPABASE_URL"], level: "required" },
      {
        label: "Clave de servicio de Supabase",
        names: ["SUPABASE_SERVICE_ROLE_KEY"],
        level: "required",
      },
      {
        label: "Modo RLS del portal",
        names: ["NESPED_RLS_PORTAL"],
        level: "recommended",
      },
      {
        label: "Clave publicable de Supabase para el RLS del portal",
        names: ["SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
        level: "recommended",
        requiredWhen: (env) => String(env.NESPED_RLS_PORTAL || "").toLowerCase() === "obligatorio",
      },
      {
        label: "Secreto JWT de Supabase para el RLS del portal",
        names: ["SUPABASE_JWT_SECRET"],
        level: "recommended",
        requiredWhen: (env) => String(env.NESPED_RLS_PORTAL || "").toLowerCase() === "obligatorio",
      },
      {
        label: "URL pública de la aplicación",
        names: ["NEXT_PUBLIC_APP_URL"],
        level: "required",
      },
      {
        label: "Secreto propio de las sesiones",
        names: ["NESPED_SESSION_SECRET"],
        level: "required",
      },
      {
        label: "Clave propia de cifrado TOTP",
        names: ["NESPED_TOTP_ENCRYPTION_KEY"],
        level: "required",
      },
      {
        label: "Token de la API interna",
        names: ["INTERNAL_API_TOKEN", "CRON_SECRET"],
        level: "recommended",
      },
      {
        label: "Webhook de alertas operativas",
        names: ["OPS_ALERT_WEBHOOK_URL"],
        level: "recommended",
      },
      {
        label: "Secreto propio de firma de los puntos de control de auditoría",
        names: ["NESPED_AUDIT_CHECKPOINT_SECRET"],
        level: "recommended",
      },
    ],
  },
  {
    id: "billing",
    label: "Cobros y suscripciones",
    checks: [
      { label: "Clave secreta de Stripe", names: ["STRIPE_SECRET_KEY"], level: "required" },
      {
        label: "Secreto del webhook de Stripe",
        names: ["STRIPE_WEBHOOK_SECRET"],
        level: "required",
      },
      {
        label: "Precio básico de Stripe",
        names: ["STRIPE_PRICE_BASIC"],
        level: "recommended",
      },
      {
        label: "Precio pro de Stripe",
        names: ["STRIPE_PRICE_PRO"],
        level: "recommended",
      },
      {
        label: "Precio premium de Stripe",
        names: ["STRIPE_PRICE_PREMIUM"],
        level: "recommended",
      },
    ],
  },
  {
    id: "voice",
    label: "Voz y telefonía",
    checks: [
      {
        label: "URL pública base de la voz",
        names: ["BASE_URL"],
        level: "required",
      },
      {
        label: "SID de la cuenta de Twilio",
        names: ["TWILIO_ACCOUNT_SID"],
        level: "recommended",
      },
      {
        label: "Token de autenticación de Twilio",
        names: ["TWILIO_AUTH_TOKEN"],
        level: "recommended",
      },
      {
        label: "Número de teléfono de Twilio",
        names: ["TWILIO_PHONE_NUMBER"],
        level: "recommended",
      },
      {
        label: "Identificador del agente de ElevenLabs",
        names: ["ELEVENLABS_AGENT_ID"],
        level: "recommended",
      },
      {
        /* El id que ElevenLabs da al número de Twilio importado en su panel.
           Sin esto no hay línea: ni entra ni sale ninguna llamada. */
        label: "Identificador del número de ElevenLabs",
        names: ["ELEVENLABS_PHONE_NUMBER_ID"],
        level: "recommended",
      },
      {
        label: "Secreto del webhook de ElevenLabs",
        names: ["ELEVENLABS_WEBHOOK_SECRET"],
        level: "recommended",
      },
      {
        label: "Clave de la API de ElevenLabs",
        names: ["ELEVENLABS_API_KEY"],
        level: "recommended",
      },
      {
        label: "Destino interno de pruebas",
        names: ["TU_NUMERO"],
        level: "recommended",
      },
    ],
  },
  {
    id: "ai",
    label: "Asistentes de IA",
    checks: [
      { label: "Clave de la API de OpenAI", names: ["OPENAI_API_KEY"], level: "required" },
    ],
  },
  {
    id: "messaging",
    label: "Mensajería y correo",
    checks: [
      {
        label: "Número de SMS de Twilio",
        names: ["TWILIO_PHONE_NUMBER"],
        level: "recommended",
      },
      {
        label: "Número de WhatsApp de Twilio",
        names: ["TWILIO_WHATSAPP_NUMBER", "TWILIO_PHONE_NUMBER"],
        level: "recommended",
      },
      {
        label: "Clave de la API de Resend",
        names: ["RESEND_API_KEY"],
        level: "recommended",
      },
      {
        label: "URL de reservas",
        names: ["BOOKING_URL"],
        level: "recommended",
      },
      {
        label: "URL de alta de clientes",
        names: ["ONBOARDING_URL"],
        level: "recommended",
      },
      {
        label: "URL de privacidad y cumplimiento",
        names: ["VOICE_PRIVACY_URL"],
        level: "recommended",
      },
      {
        label: "Días de conservación de las grabaciones",
        names: ["RECORDING_RETENTION_DAYS"],
        level: "recommended",
      },
      {
        label: "Días de conservación de las transcripciones",
        names: ["TRANSCRIPT_RETENTION_DAYS"],
        level: "recommended",
      },
    ],
  },
  {
    id: "domains",
    label: "Dominios y marca blanca",
    checks: [
      { label: "Token de Vercel", names: ["VERCEL_TOKEN"], level: "recommended" },
      {
        label: "Identificador del proyecto de Vercel",
        names: ["VERCEL_PROJECT_ID"],
        level: "recommended",
      },
      {
        label: "URL de Upstash Redis",
        names: ["UPSTASH_REDIS_REST_URL"],
        level: "recommended",
      },
      {
        label: "Token de Upstash Redis",
        names: ["UPSTASH_REDIS_REST_TOKEN"],
        level: "recommended",
      },
    ],
  },
  {
    id: "observability",
    label: "Observabilidad y respuesta a incidentes",
    checks: [
      {
        label: "DSN de Sentry del servidor",
        names: ["SENTRY_DSN", "NEXT_PUBLIC_SENTRY_DSN"],
        level: "recommended",
      },
      {
        label: "DSN de Sentry del navegador",
        names: ["NEXT_PUBLIC_SENTRY_DSN"],
        level: "recommended",
      },
      {
        label: "Token de autenticación de Sentry",
        names: ["SENTRY_AUTH_TOKEN"],
        level: "recommended",
      },
      {
        label: "Organización de Sentry",
        names: ["SENTRY_ORG"],
        level: "recommended",
      },
      {
        label: "Proyecto de Sentry",
        names: ["SENTRY_PROJECT"],
        level: "recommended",
      },
      {
        label: "Correo de contacto de privacidad",
        names: ["PRIVACY_CONTACT_EMAIL"],
        level: "recommended",
      },
    ],
  },
];

function pickEnvValue(names = [], env = process.env) {
  for (const name of names) {
    const value = env[name];
    if (value !== undefined && value !== null && String(value).trim()) {
      return {
        name,
        value: String(value),
      };
    }
  }

  return {
    name: names[0] || "",
    value: "",
  };
}

export function maskSecret(value = "") {
  const normalized = String(value || "");
  if (!normalized) return "";
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}***`;
  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function buildCheckResult(check, env = process.env) {
  const resolved = pickEnvValue(check.names, env);
  const configured = Boolean(resolved.value);
  const level = check.requiredWhen?.(env) ? "required" : check.level || "recommended";

  return {
    label: check.label,
    envKeys: check.names,
    level,
    configured,
    activeKey: configured ? resolved.name : "",
    valuePreview: configured ? maskSecret(resolved.value) : "",
  };
}

function buildFeatureResult(feature, env = process.env) {
  const checks = feature.checks.map((check) => buildCheckResult(check, env));
  const missingRequired = checks.filter(
    (check) => check.level === "required" && !check.configured
  );
  const missingRecommended = checks.filter(
    (check) => check.level !== "required" && !check.configured
  );

  const status = missingRequired.length
    ? "critical"
    : missingRecommended.length
      ? "warning"
      : "healthy";

  return {
    id: feature.id,
    label: feature.label,
    status,
    ready: missingRequired.length === 0,
    checks,
    missingRequired,
    missingRecommended,
  };
}

export function getEnvRuntimeInfo(env = process.env) {
  return {
    nodeEnv: env.NODE_ENV || "development",
    appUrl: env.NEXT_PUBLIC_APP_URL || "",
    baseUrl: env.BASE_URL || "",
    commitSha:
      env.VERCEL_GIT_COMMIT_SHA ||
      env.RAILWAY_GIT_COMMIT_SHA ||
      env.GIT_COMMIT_SHA ||
      "",
    deploymentTarget: env.VERCEL_ENV || env.RAILWAY_ENVIRONMENT || "local",
  };
}

export function buildEnvReadinessReport(env = process.env) {
  const features = FEATURE_DEFINITIONS.map((feature) =>
    buildFeatureResult(feature, env)
  );
  const critical = features.filter((feature) => feature.status === "critical");
  const warnings = features.filter((feature) => feature.status === "warning");

  return {
    runtime: getEnvRuntimeInfo(env),
    summary: {
      ready: critical.length === 0,
      status: critical.length
        ? "critical"
        : warnings.length
          ? "warning"
          : "healthy",
      featureCount: features.length,
      criticalCount: critical.length,
      warningCount: warnings.length,
      healthyCount: features.filter((feature) => feature.status === "healthy")
        .length,
    },
    features,
  };
}

export function getFeatureReport(report, featureId) {
  return report.features.find((feature) => feature.id === featureId) || null;
}

export function formatEnvReadinessLines(report) {
  return report.features.map((feature) => {
    const requiredMissing = feature.missingRequired.length;
    const recommendedMissing = feature.missingRecommended.length;
    const counts = [
      requiredMissing ? `faltan ${requiredMissing} obligatorias` : "",
      recommendedMissing ? `faltan ${recommendedMissing} recomendadas` : "",
    ]
      .filter(Boolean)
      .join(", ");

    return `- ${feature.label}: ${etiqueta(NIVEL_SALUD, feature.status)}${counts ? ` (${counts})` : ""}`;
  });
}
