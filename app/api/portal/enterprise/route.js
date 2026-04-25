import { getPortalContext } from "@/lib/portal-auth";
import { buildEnterpriseWorkspace } from "@/lib/portal-product";
import {
  getSessionSecurityProfile,
  getTwoFactorSecurityProfile,
} from "@/lib/server/auth";
import {
  buildBaseUrl,
  buildPortalServices,
} from "@/lib/server/portal-phase-three";

export async function GET(req) {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes, portalUsersRes, authUsersRes, auditRes] =
      await Promise.all([
        ctx.supabase
          .from("clients")
          .select(
            "id,name,brand_name,custom_domain,webhook,twilio_number,stripe_customer_id,owner_email"
          )
          .eq("id", ctx.clientId)
          .single(),
        ctx.supabase
          .from("client_settings")
          .select("*")
          .eq("client_id", ctx.clientId)
          .maybeSingle(),
        ctx.supabase
          .from("portal_users")
          .select("id,client_id,full_name,email,role,phone,is_active,created_at")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: true }),
        ctx.supabase
          .from("users")
          .select("email,role,created_at,password,password_hash")
          .eq("client_id", ctx.clientId),
        ctx.supabase
          .from("audit_logs")
          .select("*")
          .eq("client_id", ctx.clientId)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

    const errors = [
      clientRes.error,
      settingsRes.error,
      portalUsersRes.error,
      authUsersRes.error,
      auditRes.error,
    ].filter(Boolean);

    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Enterprise");
    }

    let domainStatus = null;
    const client = clientRes.data || {};

    if (
      client?.custom_domain &&
      process.env.VERCEL_PROJECT_ID &&
      process.env.VERCEL_TOKEN
    ) {
      const inspectRes = await fetch(
        `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(
          client.custom_domain
        )}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          },
        }
      );

      domainStatus = await inspectRes.json().catch(() => null);
    }

    const settings = settingsRes.data || {};
    const services = buildPortalServices(client, settings);
    const sessionSecurity = getSessionSecurityProfile();
    const twoFactor = getTwoFactorSecurityProfile();

    return Response.json({
      success: true,
      data: buildEnterpriseWorkspace({
        client,
        settings,
        portalUsers: portalUsersRes.data || [],
        authUsers: authUsersRes.data || [],
        auditLogs: auditRes.data || [],
        services,
        security: {
          ...sessionSecurity,
          twoFactor,
          baseUrl: buildBaseUrl(req),
        },
        domainStatus,
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Enterprise",
      },
      { status: 500 }
    );
  }
}
