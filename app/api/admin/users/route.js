import { createClient } from "@supabase/supabase-js";
import { getAdminContext, hashPassword } from "@/lib/server/auth";
import { requireSameOrigin } from "@/lib/server/security";
import { validarPassword } from "@/lib/server/passwords";
import { getInternalApiHeaders } from "@/lib/server/internal-api";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
      .from("users")
      .select("id,email,role,client_id,created_at")
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
      data: data || [],
    });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);

    return Response.json(
      {
        success: false,
        message: "Error cargando usuarios",
        data: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
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

    const supabase = getSupabase();
    const body = await req.json();

    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const role = body.role?.trim() || "client";
    const clientId = body.clientId?.trim();

    if (!email || !password || !clientId) {
      return Response.json(
        {
          success: false,
          message: "Faltan email, password o clientId",
        },
        { status: 400 }
      );
    }

    const passwordCheck = validarPassword(password, { email });
    if (!passwordCheck.ok) return Response.json({ success: false, message: passwordCheck.message }, { status: 400 });
    if (!["client","admin","super_admin"].includes(role)) return Response.json({ success: false, message: "Rol no válido" }, { status: 400 });

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return Response.json(
        {
          success: false,
          message: "Ya existe un usuario con ese email",
        },
        { status: 400 }
      );
    }

    const { data: clientExists } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientExists) {
      return Response.json(
        {
          success: false,
          message: "El cliente seleccionado no existe",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.rpc("crear_usuario_administrado", {
      p_actor: admin.userEmail, p_client: clientId, p_email: email,
      p_password: hashPassword(password), p_role: role, p_portal_role: role === "client" ? "agent" : "admin",
    });

    if (error) {
      return Response.json(
        {
          success: false,
          message: "No se pudo completar la operación",
        },
        { status: 500 }
      );
    }

    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
        /* loginUrl ya no viaja: lo construye la propia ruta. Aceptarlo del
           cuerpo permitía que el botón del correo apuntara a cualquier sitio. */
        body: JSON.stringify({ email, clientName: clientExists.name }),
      });
    } catch (emailErr) {
      console.error("Error enviando onboarding email:", emailErr);
    }

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("POST /api/admin/users error:", error);

    return Response.json(
      {
        success: false,
        message: "Error creando usuario",
      },
      { status: 500 }
    );
  }
}
