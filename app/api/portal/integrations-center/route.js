import { getPortalContext } from "@/lib/portal-auth";
import { buildIntegrationsCenterData } from "@/lib/server/portal-phase-four";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const [clientRes, settingsRes] = await Promise.all([
      ctx.supabase
        .from("clients")
        .select("id,name,brand_name,custom_domain,webhook,twilio_number,owner_email,industry")
        .eq("id", ctx.clientId)
        .single(),
      ctx.supabase
        .from("client_settings")
        .select("*")
        .eq("client_id", ctx.clientId)
        .maybeSingle(),
    ]);

    const errors = [clientRes.error, settingsRes.error].filter(Boolean);
    if (errors.length > 0) {
      throw new Error(errors[0].message || "No se pudo cargar Integrations Center");
    }

    return Response.json({
      success: true,
      data: buildIntegrationsCenterData({
        client: clientRes.data || {},
        settings: settingsRes.data || {},
      }),
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo cargar Integrations Center",
      },
      { status: 500 }
    );
  }
}
