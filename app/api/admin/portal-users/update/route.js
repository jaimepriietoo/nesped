import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";
import { requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function manejarPATCH(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();
    const body = await req.json();

    const { id, full_name, email, role, phone, is_active } = body;

    if (!id) {
      return Response.json(
        { success: false, message: "Falta id" },
        { status: 400 }
      );
    }

    const { data: target, error: targetError } = await supabase.from("portal_users")
      .select("email,client_id").eq("id", id).maybeSingle();
    if (targetError || !target) return Response.json({ success: false, message: "Usuario no disponible" }, { status: 404 });
    if (email !== undefined && String(email).trim().toLowerCase() !== target.email) {
      return Response.json({ success: false, message: "El cambio de correo requiere verificación" }, { status: 400 });
    }
    if (role !== undefined && !["owner", "admin", "manager", "agent", "viewer"].includes(role)) {
      return Response.json({ success: false, message: "Rol no válido" }, { status: 400 });
    }
    const { data: authUser, error: authError } = await supabase.from("users").select("role")
      .eq("email", target.email).eq("client_id", target.client_id).maybeSingle();
    if (authError || !authUser || (["admin", "super_admin"].includes(authUser.role) && admin.role !== "super_admin")) {
      return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });
    }
    if (target.email === admin.userEmail && is_active === false) {
      return Response.json({ success: false, message: "No puedes desactivar tu propio acceso" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("portal_users")
      .update({
        full_name,
        role,
        phone,
        is_active,
      })
      .eq("id", id)
      .select("id,email,full_name,role,phone,is_active,client_id")
      .single();

    if (error) {
      return Response.json(
        { success: false, message: "No se pudo completar la operación" },
        { status: 500 }
      );
    }

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error actualizando usuario" },
      { status: 500 }
    );
  }
}

export const PATCH = observeRoute("api.admin.portal-users.update.patch", manejarPATCH);
