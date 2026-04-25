import { getPortalContext, hasRole } from "@/lib/portal-auth";

function csvEscape(value = "") {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!hasRole(ctx.role, ["owner", "admin", "manager"])) {
      return Response.json(
        { success: false, message: "Sin permisos para exportar auditoría" },
        { status: 403 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("audit_logs")
      .select("*")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(2000);

    if (error) {
      throw new Error(error.message || "No se pudo exportar la auditoría");
    }

    const rows = data || [];
    const csv = [
      ["id", "entity_type", "entity_id", "action", "actor", "created_at", "changes"].join(","),
      ...rows.map((row) =>
        [
          csvEscape(row.id),
          csvEscape(row.entity_type),
          csvEscape(row.entity_id),
          csvEscape(row.action),
          csvEscape(row.actor),
          csvEscape(row.created_at),
          csvEscape(
            typeof row.changes === "string"
              ? row.changes
              : JSON.stringify(row.changes || {})
          ),
        ].join(",")
      ),
    ].join("\n");

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${ctx.clientId}.csv"`,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo exportar la auditoría",
      },
      { status: 500 }
    );
  }
}
