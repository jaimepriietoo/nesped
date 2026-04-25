import { buildAccessCenterSnapshot, buildApiHubWorkspace } from "@/lib/portal-product";
import { buildPermissionMatrix } from "@/lib/server/portal-permissions";
import {
  getSessionSecurityProfile,
  getTwoFactorSecurityProfile,
  requiresTwoFactor,
} from "@/lib/server/auth";

export function buildBaseUrl(req) {
  const forwardedProto = req.headers.get("x-forwarded-proto") || "https";
  const forwardedHost =
    req.headers.get("x-forwarded-host") || req.headers.get("host") || "";

  if (process.env.NEXT_PUBLIC_APP_URL) {
    return String(process.env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");
  }

  if (process.env.BASE_URL) {
    return String(process.env.BASE_URL).replace(/\/$/, "");
  }

  if (!forwardedHost) {
    return "";
  }

  return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
}

export function buildPortalServices(client = {}, settings = {}) {
  return {
    ai: {
      ready: Boolean(process.env.OPENAI_API_KEY),
      detail: process.env.OPENAI_API_KEY
        ? "OpenAI configurado."
        : "Falta OPENAI_API_KEY.",
    },
    telephony: {
      ready: Boolean(
        process.env.TWILIO_ACCOUNT_SID &&
          process.env.TWILIO_AUTH_TOKEN &&
          client?.twilio_number
      ),
      detail:
        process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        client?.twilio_number
          ? "Telefonía preparada para producción."
          : "Falta número del cliente o credenciales base de Twilio.",
    },
    whatsapp: {
      ready: Boolean(
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
      ),
      detail:
        process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
          ? "Canal WhatsApp con credenciales listas."
          : "Faltan credenciales base para WhatsApp/Twilio.",
    },
    billing: {
      ready: Boolean(
        client?.stripe_customer_id ||
          process.env.STRIPE_SECRET_KEY ||
          process.env.STRIPE_WEBHOOK_SECRET
      ),
      detail: client?.stripe_customer_id
        ? "Customer de Stripe conectado."
        : "Aún no hay customer de Stripe vinculado al cliente.",
    },
    reporting: {
      ready: Boolean(
        settings?.daily_report_email || settings?.weekly_report_email
      ),
      detail:
        settings?.daily_report_email || settings?.weekly_report_email
          ? "Reporting activo."
          : "Sin reporting diario o semanal configurado.",
    },
    domains: {
      ready: Boolean(client?.custom_domain),
      detail: client?.custom_domain
        ? `Dominio conectado: ${client.custom_domain}`
        : "Aún no hay dominio propio conectado.",
    },
  };
}

export function buildAccessCenterData({
  portalUsers = [],
  authUsers = [],
  auditLogs = [],
  permissionRows = [],
} = {}) {
  const authByEmail = new Map(
    (authUsers || []).map((user) => [
      String(user.email || "").trim().toLowerCase(),
      user,
    ])
  );

  const users = (portalUsers || []).map((user) => {
    const normalizedEmail = String(user.email || "").trim().toLowerCase();
    const authUser = authByEmail.get(normalizedEmail) || null;

    return {
      ...user,
      email: normalizedEmail,
      is_active: user.is_active !== false,
      hasPassword: Boolean(authUser?.password || authUser?.password_hash),
      authRole: authUser?.role || user.role || "viewer",
      authCreatedAt: authUser?.created_at || null,
      requiresTwoFactor: requiresTwoFactor(authUser?.role || user.role || ""),
    };
  });

  const policies = {
    ...getSessionSecurityProfile(),
    twoFactor: getTwoFactorSecurityProfile(),
    rateLimit: true,
    rateLimitStrategy: process.env.UPSTASH_REDIS_REST_URL
      ? "redis"
      : "memory",
    sameOriginGuard: true,
    csp: true,
    webhookSignatureValidation: true,
  };

  const baseSnapshot = buildAccessCenterSnapshot({
    users,
    policies,
    auditLogs,
  });

  return {
    ...baseSnapshot,
    permissionMatrix: buildPermissionMatrix({
      users,
      permissionRows,
    }),
    exportUrl: "/api/portal/audit/export",
  };
}

export function buildApiHubData({
  req,
  client = {},
  settings = {},
  domainStatus = null,
} = {}) {
  const services = buildPortalServices(client, settings);
  const baseUrl = buildBaseUrl(req);

  return buildApiHubWorkspace({
    client,
    settings,
    services,
    baseUrl,
    domainStatus,
  });
}
