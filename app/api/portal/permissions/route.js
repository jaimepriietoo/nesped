import { filasDePermisos, fijarPermisosDeUsuario } from "@/lib/server/datos";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { requireSameOrigin } from "@/lib/server/security";
import {
  buildPermissionMatrix,
  getPermissionCatalog,
} from "@/lib/server/portal-permissions";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const { data: portalUsers, error } = await ctx.supabase
      .from("portal_users")
      .select("id,email,role,permissions,updated_at")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new Error(error.message || "No se pudieron cargar permisos");
    }

    const permissionRows = filasDePermisos(portalUsers || []);

    return Response.json({
      success: true,
      data: buildPermissionMatrix({
        users: portalUsers || [],
        permissionRows,
      }),
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "No se pudieron cargar permisos" },
      { status: 500 }
    );
  }
}

async function manejarPATCH(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) return sameOriginError;

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "users.manage")) {
      return Response.json(
        { success: false, message: "Sin permisos para editar permisos finos" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const userId = String(body?.userId || "").trim();
    const scopes = Array.isArray(body?.scopes) ? body.scopes.map((item) => String(item || "").trim()) : [];

    if (!userId) {
      return Response.json(
        { success: false, message: "Falta userId" },
        { status: 400 }
      );
    }

    const allowedScopes = new Set(getPermissionCatalog().map((item) => item.id));
    const safeScopes = scopes.filter((scope) => allowedScopes.has(scope));

    const { data: target, error: targetError } = await ctx.supabase.from("portal_users")
      .select("id,role").eq("id", userId).eq("client_id", ctx.clientId).maybeSingle();
    if (targetError || !target) return Response.json({ success: false, message: "Usuario no disponible" }, { status: 404 });
    if (target.role === "owner" && ctx.role !== "owner") return Response.json({ success: false, message: "Sin permisos" }, { status: 403 });

    /* Los permisos viven en la propia fila del usuario, así que cambiarlos es
       una escritura y no una transacción de borrar-y-crear. Y va atada a la
       empresa: no se puede tocar un usuario de otra por su id. */
    await fijarPermisosDeUsuario(target.id, safeScopes, ctx.clientId);

    await ctx.supabase.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "permission",
      entity_id: userId,
      action: "permissions_updated",
      actor: ctx.userEmail,
      changes: { scopes: safeScopes },
      created_at: new Date().toISOString(),
    });

    return Response.json({
      success: true,
      message: "Permisos finos actualizados",
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "No se pudieron guardar los permisos" },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.permissions.get", manejarGET);
export const PATCH = observeRoute("api.portal.permissions.patch", manejarPATCH);
