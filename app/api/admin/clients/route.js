import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { getAdminContext, hashPassword } from "@/lib/server/auth";

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

export async function GET() {
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
          message: error.message,
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
    console.error("GET /api/admin/clients error:", error);

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

export async function POST(req) {
  try {
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

    const supabase = getSupabase();
    const body = await req.json();

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

    if (!id || !name) {
      return Response.json(
        {
          success: false,
          message: "Faltan id o name",
        },
        { status: 400 }
      );
    }

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
          message: error.message,
        },
        { status: 500 }
      );
    }

    const settingsPayload = {
      client_id: id,
      weekly_report_email: ownerEmail || null,
      daily_report_email: ownerEmail || null,
    };

    const { error: settingsError } = await supabase
      .from("client_settings")
      .upsert(settingsPayload, { onConflict: "client_id" });

    if (settingsError) {
      console.error("Error creando client_settings:", settingsError.message);
    }

    if (email) {
      const password = crypto.randomBytes(6).toString("base64url");

      const { error: userError } = await supabase.from("users").insert([
        {
          email,
          password: hashPassword(password),
          role: "client",
          client_id: id,
        },
      ]);

      if (userError) {
        console.error("Error creando usuario automático:", userError.message);
      } else {
        try {
          await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding-email`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email,
                clientName: name,
                password,
                loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
              }),
            }
          );
        } catch (emailErr) {
          console.error("Error enviando onboarding email:", emailErr);
        }
      }
    }

    return Response.json({
      success: true,
      data: mapClient(data),
      ok: true,
    });
  } catch (error) {
    console.error("POST /api/admin/clients error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error creando cliente",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req) {
  try {
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

    const supabase = getSupabase();
    const body = await req.json();

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

    if (!id) {
      return Response.json(
        {
          success: false,
          message: "Falta id del cliente",
        },
        { status: 400 }
      );
    }

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
          message: error.message,
        },
        { status: 500 }
      );
    }

    const settingsPayload = {
      client_id: id,
      weekly_report_email: ownerEmail || null,
      daily_report_email: ownerEmail || null,
    };

    const { error: settingsError } = await supabase
      .from("client_settings")
      .upsert(settingsPayload, { onConflict: "client_id" });

    if (settingsError) {
      console.error("Error actualizando client_settings:", settingsError.message);
    }

    return Response.json({
      success: true,
      data: mapClient(data),
      ok: true,
    });
  } catch (error) {
    console.error("PATCH /api/admin/clients error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error actualizando cliente",
      },
      { status: 500 }
    );
  }
}
