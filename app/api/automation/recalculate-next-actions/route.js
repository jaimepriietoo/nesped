import { createClient } from "@supabase/supabase-js";
import { getInternalApiHeaders } from "@/lib/server/internal-api";
import { requirePortalRoleOrInternal } from "@/lib/server/security";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  const access = await requirePortalRoleOrInternal(req);
  if (!access.ok) return access.response;

  try {
    const body = await req.json().catch(() => ({}));
    const onlyClientId = body?.clientId || null;

    const supabase = getSupabase();

    let query = supabase
      .from("leads")
      .select("id, client_id, status")
      .not("status", "in", '("won","lost")');

    if (onlyClientId) {
      query = query.eq("client_id", onlyClientId);
    }

    const { data: leads, error } = await query.limit(1000);

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const lead of leads || []) {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/next-best-action/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getInternalApiHeaders(),
          },
          body: JSON.stringify({
            leadId: lead.id,
            clientId: lead.client_id,
            useAI: true,
          }),
        });

        const json = await res.json();

        if (json.success) processed += 1;
        else failed += 1;
      } catch (err) {
        failed += 1;
      }
    }

    return Response.json({
      success: true,
      processed,
      failed,
      total: (leads || []).length,
    });
  } catch (error) {
    console.error("POST /api/automation/recalculate-next-actions error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error recalculando acciones recomendadas",
      },
      { status: 500 }
    );
  }
}
