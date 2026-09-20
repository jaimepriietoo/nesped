import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { campoCsvSeguro } from "@/lib/server/csv";
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

    if (!puede(ctx.role, "audit.export", ctx.permissions)) {
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
    const { error: auditError } = await ctx.datos.from("audit_logs").insert({
      client_id: ctx.clientId,
      entity_type: "export",
      entity_id: ctx.clientId,
      action: "audit_exported",
      actor: ctx.userEmail,
      changes: { rows: rows.length, format: "csv" },
    });
    if (auditError) throw new Error("No se pudo registrar la exportación");

    const csv = [
      ["id", "entity_type", "entity_id", "action", "actor", "created_at", "changes"].join(","),
      ...rows.map((row) =>
        [
          campoCsvSeguro(row.id),
          campoCsvSeguro(row.entity_type),
          campoCsvSeguro(row.entity_id),
          campoCsvSeguro(row.action),
          campoCsvSeguro(row.actor),
          campoCsvSeguro(row.created_at),
          campoCsvSeguro(
            typeof row.changes === "string"
              ? row.changes
              : JSON.stringify(row.changes || {})
          ),
        ].join(",")
      ),
    ].join("\n");

    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-${ctx.clientId}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: "No se pudo exportar la auditoría",
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.portal.audit.export.get", manejarGET);
