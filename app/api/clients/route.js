import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { getSupabase } from "@/lib/supabase";
import { CLIENT_LIST, mapClientToPublicShape } from "@/lib/clients";

const supabase = getSupabase();

/** Sólo lo que una página pública puede enseñar: marca y aspecto, nada más. */
function formaPublica(cliente) {
  return {
    id: cliente.id,
    name: cliente.name,
    brandName: cliente.brand_name || cliente.name,
    brandLogoUrl: cliente.brand_logo_url || "",
    type: cliente.type,
    status: cliente.status,
    tagline: cliente.tagline,
    logoText: cliente.logo_text,
    customDomain: cliente.custom_domain || "",
    theme: {
      accent: cliente.accent,
      accentText: cliente.accent_text,
      button: cliente.button,
      badge: cliente.badge,
    },
  };
}

/**
 * GET /api/clients?id=<id>  → ese cliente, sin sesión.
 * GET /api/clients          → todos, sólo para administración.
 *
 * Antes devolvía la lista entera sin pedir nada, así que cualquiera podía
 * descargarse la cartera de clientes con un solo GET: nombres, marcas,
 * eslóganes y dominios propios. La usaba únicamente /c/[clientId], que sólo
 * necesita uno, así que ese caso pasa a ir por `id` y la lista completa
 * queda detrás de sesión.
 */
export async function GET(req) {
  try {
    const id = new URL(req.url).searchParams.get("id");

    if (id) {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (data) {
        return Response.json({ success: true, data: [formaPublica(data)] });
      }

      // Los clientes de ejemplo viven en código, no en la base de datos.
      const semilla = CLIENT_LIST.find((c) => c.id === id);
      return Response.json({
        success: true,
        data: semilla ? [mapClientToPublicShape(semilla)] : [],
      });
    }

    const ctx = await getPortalContext();
    if (!ctx.ok || !hasRole(ctx.role, ["owner", "admin", "super_admin"])) {
      return Response.json(
        { success: false, message: "Sin permisos para listar clientes", data: [] },
        { status: 403 }
      );
    }

    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json(
        { success: false, message: error.message, data: [] },
        { status: 500 }
      );
    }

    const clientes = (data || []).map(formaPublica);
    const yaEstan = new Set(clientes.map((c) => c.id));
    const semillas = CLIENT_LIST.filter((c) => !yaEstan.has(c.id)).map(mapClientToPublicShape);

    return Response.json({ success: true, data: [...clientes, ...semillas] });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error cargando clientes", data: [] },
      { status: 500 }
    );
  }
}
