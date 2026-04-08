import { getPortalContext } from "@/lib/portal-auth";

function escapeCsv(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return new Response("No autorizado", { status: 401 });
    }

    const { data: leads, error } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(error.message, { status: 500 });
    }

    const headers = [
      "id",
      "created_at",
      "nombre",
      "telefono",
      "ciudad",
      "necesidad",
      "score",
      "status",
      "owner",
      "interes",
      "valor_estimado",
      "resumen",
    ];

    const rows = [
      headers.join(","),
      ...(leads || []).map((lead) =>
        headers.map((h) => escapeCsv(lead[h])).join(",")
      ),
    ];

    return new Response(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="leads-${ctx.clientId}.csv"`,
      },
    });
  } catch (error) {
    return new Response(error.message || "Error exportando CSV", { status: 500 });
  }
}