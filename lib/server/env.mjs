const FEATURE_DEFINITIONS = [
  {
    id: "core",
    label: "Core app",
    checks: [
      { label: "Supabase URL", names: ["SUPABASE_URL"], level: "required" },
      {
        label: "Supabase service role key",
        names: ["SUPABASE_SERVICE_ROLE_KEY"],
        level: "required",
      },
      {
        label: "Public app URL",
        names: ["NEXT_PUBLIC_APP_URL"],
        level: "required",
      },
      {
        label: "Dedicated session secret",
        names: ["NESPED_SESSION_SECRET"],
        level: "required",
      },
      {
        label: "Internal API token",
        names: ["INTERNAL_API_TOKEN", "CRON_SECRET"],
        level: "recommended",
      },
      {
        label: "Ops alert webhook",
        names: ["OPS_ALERT_WEBHOOK_URL"],
        level: "recommended",
      },
      {
        label: "Database URL",
        names: ["DATABASE_URL"],
        level: "recommended",
      },
    ],
  },
  {
    id: "billing",
    label: "Billing and subscriptions",
    checks: [
      { label: "Stripe secret key", names: ["STRIPE_SECRET_KEY"], level: "required" },
      {
        label: "Stripe webhook secret",
        names: ["STRIPE_WEBHOOK_SECRET"],
        level: "required",
      },
      {
        label: "Stripe basic price",
        names: ["STRIPE_PRICE_BASIC"],
        level: "recommended",
      },
      {
        label: "Stripe pro price",
        names: ["STRIPE_PRICE_PRO"],
        level: "recommended",
      },
      {
        label: "Stripe premium price",
        names: ["STRIPE_PRICE_PREMIUM"],
        level: "recommended",
      },
    ],
  },
  {
    id: "voice",
    label: "Voice and telephony",
    checks: [
      {
        label: "Twilio account SID",
        names: ["TWILIO_ACCOUNT_SID", "ACCOUNT_SID"],
        level: "required",
      },
      {
        label: "Twilio auth token",
        names: ["TWILIO_AUTH_TOKEN", "AUTH_TOKEN"],
        level: "required",
      },
      {
        label: "Twilio outbound number",
        names: ["TWILIO_PHONE_NUMBER", "TWILIO_NUMERO"],
        level: "required",
      },
      { label: "Public voice base URL", names: ["BASE_URL"], level: "required" },
      {
        label: "Internal test destination",
        names: ["TU_NUMERO"],
        level: "recommended",
      },
    ],
  },
  {
    id: "ai",
    label: "AI assistants",
    checks: [
      { label: "OpenAI API key", names: ["OPENAI_API_KEY"], level: "required" },
    ],
  },
  {
    id: "messaging",
    label: "Messaging and email",
    checks: [
      {
        label: "Twilio WhatsApp number",
        names: ["TWILIO_WHATSAPP_NUMBER"],
        level: "recommended",
      },
      {
        label: "Resend API key",
        names: ["RESEND_API_KEY"],
        level: "recommended",
      },
      {
        label: "Booking URL",
        names: ["BOOKING_URL"],
        level: "recommended",
      },
      {
        label: "Onboarding URL",
        names: ["ONBOARDING_URL"],
        level: "recommended",
      },
      {
        label: "Privacy / compliance URL",
        names: ["VOICE_PRIVACY_URL"],
        level: "recommended",
      },
      {
        label: "Recording retention days",
        names: ["RECORDING_RETENTION_DAYS"],
        level: "recommended",
      },
      {
        label: "Transcript retention days",
        names: ["TRANSCRIPT_RETENTION_DAYS"],
        level: "recommended",
      },
    ],
  },
  {
    id: "domains",
    label: "Domains and white-label",
    checks: [
      { label: "Vercel token", names: ["VERCEL_TOKEN"], level: "recommended" },
      {
        label: "Vercel project id",
        names: ["VERCEL_PROJECT_ID"],
        level: "recommended",
      },
      {
        label: "Upstash Redis URL",
        names: ["UPSTASH_REDIS_REST_URL"],
        level: "recommended",
      },
      {
        label: "Upstash Redis token",
        names: ["UPSTASH_REDIS_REST_TOKEN"],
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

  return {
    label: check.label,
    envKeys: check.names,
    level: check.level || "recommended",
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
      requiredMissing ? `${requiredMissing} required missing` : "",
      recommendedMissing ? `${recommendedMissing} recommended missing` : "",
    ]
      .filter(Boolean)
      .join(", ");

    return `- ${feature.label}: ${feature.status}${counts ? ` (${counts})` : ""}`;
  });
}
