import { createClient } from "@supabase/supabase-js";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import crypto from "crypto";
import { validar } from "@/lib/server/esquemas";
import { ClienteAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { safeUpsertClientSettings } from "@/lib/client-settings";
import { getAdminContext, hashPassword } from "@/lib/server/auth";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function mapClient(row) {
  return {
    id: row.id,
    name: row.name || "",
    prompt: row.prompt || "",
    type: row.type || "",
    status: row.status || "Activo",
    tagline: row.tagline || "",
    logoText: row.logo_text || "",
    webhook: row.webhook || "",
    twilioNumber: row.twilio_number || "",
    twilio_number: row.twilio_number || "",
    plan: row.plan || "",
    callsLimit: row.calls_limit || 0,
    calls_limit: row.calls_limit || 0,

    owner_email: row.owner_email || "",
    brand_name: row.brand_name || row.name || "",
    brand_logo_url: row.brand_logo_url || "",
    primary_color: row.primary_color || "#ffffff",
    secondary_color: row.secondary_color || "#030303",
    industry: row.industry || "",
    is_active: row.is_active !== false,

    theme: {
      accent: row.accent || "bg-blue-500/20",
      accentText: row.accent_text || "text-blue-300",
      button: row.button || "bg-white text-black hover:bg-white/90",
      badge: row.badge || "bg-emerald-500/15 text-emerald-300",
    },

    createdAt: row.created_at || null,
    created_at: row.created_at || null,
  };
}

async function manejarGET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        {
          success: false,
          message: admin.message,
          data: [],
        },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json(
        {
          success: false,
          message: "No se pudo completar la operación",
          data: [],
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: (data || []).map(mapClient),
    });
  } catch (error) {
    logErrorSeguro("admin.clients_read_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error cargando clientes",
        data: [],
      },
      { status: 500 }
    );
  }
}

async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        {
          success: false,
          message: admin.message,
        },
        { status: admin.status || 401 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "admin-client-create", limit: 20, keyParts: [admin.userEmail || "admin"],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 64 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(ClienteAdmin, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const supabase = getSupabase();
    const body = entrada.datos;

    const id = body.id?.trim();
    const name = body.name?.trim();
    const prompt = body.prompt || "";
    const email = body.email?.trim()?.toLowerCase() || body.owner_email?.trim()?.toLowerCase() || "";

    const type = body.type || "";
    const status = body.status || "Activo";
    const tagline = body.tagline || "";
    const logoText = body.logoText || body.logo_text || "";
    const webhook = body.webhook || "";
    const twilioNumber = body.twilioNumber || body.twilio_number || "";

    const ownerEmail = body.owner_email?.trim() || "";
    const brandName = body.brand_name || name || "";
    const brandLogoUrl = body.brand_logo_url || "";
    const primaryColor = body.primary_color || "#ffffff";
    const secondaryColor = body.secondary_color || "#030303";
    const industry = body.industry || "";
    const isActive = body.is_active !== false;

    const { data: existingClient } = await supabase
      .from("clients")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (existingClient) {
      return Response.json(
        {
          success: false,
          message: "Ya existe un cliente con ese id",
        },
        { status: 400 }
      );
    }

    const insertPayload = {
      id,
      name,
      prompt,
      type,
      status,
      tagline,
      logo_text: logoText,
      webhook,
      twilio_number: twilioNumber,
      plan: "pro",
      calls_limit: 300,
      accent: "bg-blue-500/20",
      accent_text: "text-blue-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-emerald-500/15 text-emerald-300",
      created_at: new Date().toISOString(),

      owner_email: ownerEmail,
      brand_name: brandName,
      brand_logo_url: brandLogoUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      industry,
      is_active: isActive,
    };

    const { data, error } = await supabase
      .from("clients")
      .insert([insertPayload])
      .select()
      .single();

    if (error) {
      return Response.json(
        {
          success: false,
          message: "No se pudo completar la operación",
        },
        { status: 500 }
      );
    }

    const settingsPayload = {
      client_id: id,
      weekly_report_email: ownerEmail || null,
      daily_report_email: ownerEmail || null,
    };

    const { error: settingsError } = await safeUpsertClientSettings(
      supabase,
      settingsPayload,
      { onConflict: "client_id" }
    );

    if (settingsError) {
      logErrorSeguro("admin.client_settings_create_failed", settingsError);
    }

    let initialPassword = "";
    let userWarning = "";
    if (email) {
      const password = crypto.randomBytes(18).toString("base64url");

      const { error: userError } = await supabase.rpc("crear_usuario_administrado", {
        p_actor: admin.userEmail, p_client: id, p_email: email, p_password: hashPassword(password),
        p_role: "client", p_portal_role: "owner",
      });

      if (userError) {
        userWarning = "Cliente creado, pero el acceso no pudo crearse. Revisa si el correo ya está registrado.";
      } else {
        initialPassword = password;
        try {
          await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...getInternalApiHeaders(),
              },
              /* loginUrl ya no viaja: lo construye la propia ruta. */
              body: JSON.stringify({ email, clientName: name }),
            }
          );
        } catch (emailErr) {
          logErrorSeguro("admin.client_onboarding_email_failed", emailErr);
        }
      }
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      client_id: id, entity_type: "client", entity_id: id,
      action: "admin_client_created", actor: admin.userEmail || "admin",
      changes: { fields: Object.keys(insertPayload).filter((campo) => campo !== "created_at").sort() },
    });
    if (auditError) throw new Error("No se pudo registrar la auditoría");

    return Response.json({
      success: true,
      data: mapClient(data),
      initialPassword,
      userWarning,
      ok: true,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logErrorSeguro("admin.client_create_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error creando cliente",
      },
      { status: 500 }
    );
  }
}

async function manejarPATCH(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        {
          success: false,
          message: admin.message,
        },
        { status: admin.status || 401 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "admin-client-update", limit: 40, keyParts: [admin.userEmail || "admin"],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 64 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(ClienteAdmin, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const supabase = getSupabase();
    const body = entrada.datos;

    const id = body.id?.trim();
    const name = body.name?.trim();
    const prompt = body.prompt || "";
    const type = body.type || "";
    const status = body.status || "Activo";
    const tagline = body.tagline || "";
    const logoText = body.logoText || body.logo_text || "";
    const webhook = body.webhook || "";
    const twilioNumber = body.twilioNumber || body.twilio_number || "";

    const ownerEmail = body.owner_email?.trim() || "";
    const brandName = body.brand_name || name || "";
    const brandLogoUrl = body.brand_logo_url || "";
    const primaryColor = body.primary_color || "#ffffff";
    const secondaryColor = body.secondary_color || "#030303";
    const industry = body.industry || "";
    const isActive = body.is_active !== false;

    const updatePayload = {
      name,
      prompt,
      type,
      status,
      tagline,
      logo_text: logoText,
      webhook,
      twilio_number: twilioNumber,

      owner_email: ownerEmail,
      brand_name: brandName,
      brand_logo_url: brandLogoUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
      industry,
      is_active: isActive,
    };

    const { data, error } = await supabase
      .from("clients")
      .update(updatePayload)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return Response.json(
        {
          success: false,
          message: "No se pudo completar la operación",
        },
        { status: 500 }
      );
    }

    const settingsPayload = {
      client_id: id,
      weekly_report_email: ownerEmail || null,
      daily_report_email: ownerEmail || null,
    };

    const { error: settingsError } = await safeUpsertClientSettings(
      supabase,
      settingsPayload,
      { onConflict: "client_id" }
    );

    if (settingsError) {
      logErrorSeguro("admin.client_settings_update_failed", settingsError);
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      client_id: id, entity_type: "client", entity_id: id,
      action: "admin_client_updated", actor: admin.userEmail || "admin",
      changes: { fields: Object.keys(updatePayload).sort() },
    });
    if (auditError) throw new Error("No se pudo registrar la auditoría");

    return Response.json({
      success: true,
      data: mapClient(data),
      ok: true,
    });
  } catch (error) {
    logErrorSeguro("admin.client_update_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error actualizando cliente",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.admin.clients.get", manejarGET);
export const POST = observeRoute("api.admin.clients.post", manejarPOST);
export const PATCH = observeRoute("api.admin.clients.patch", manejarPATCH);
