import { createClient } from "@supabase/supabase-js";
import { getAdminContext, hashPassword } from "@/lib/server/auth";
import { validar } from "@/lib/server/esquemas";
import { CrearUsuarioAdmin } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { validarPassword } from "@/lib/server/passwords";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
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
    logErrorSeguro("admin.users_read_failed", error);

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
      namespace: "admin-user-create", limit: 30, keyParts: [admin.userEmail || "admin"],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 8 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(CrearUsuarioAdmin, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const supabase = getSupabase();
    const body = entrada.datos;

    const email = body.email?.trim()?.toLowerCase();
    const password = body.password;
    const role = body.role?.trim() || "client";
    const clientId = body.clientId?.trim();

    const passwordCheck = validarPassword(password, { email });
    if (!passwordCheck.ok) return Response.json({ success: false, message: passwordCheck.message }, { status: 400 });
    if (["admin", "super_admin"].includes(role) && admin.role !== "super_admin") {
      return Response.json({ success: false, message: "Sólo un superadministrador puede crear administradores" }, { status: 403 });
    }

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
      logErrorSeguro("admin.user_onboarding_email_failed", emailErr);
    }

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    logErrorSeguro("admin.user_create_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error creando usuario",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.admin.users.get", manejarGET);
export const POST = observeRoute("api.admin.users.post", manejarPOST);
