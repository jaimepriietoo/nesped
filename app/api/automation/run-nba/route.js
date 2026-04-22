import { createClient } from "@supabase/supabase-js";
import { getInternalApiHeaders } from "@/lib/server/internal-api";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST() {
  try {
    const supabase = getSupabase();

    const { data: leads, error } = await supabase
      .from("leads")
      .select("*")
      .eq("auto_mode", true);

    if (error) {
      return Response.json(
        { success: false, message: error.message },
        { status: 500 }
      );
    }

    // De momento solo recalcula, no ejecuta automáticamente.
    for (const lead of leads || []) {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/ai/next-best-action/save`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
        body: JSON.stringify({
          leadId: lead.id,
          clientId: lead.client_id,
          brandName: "Nesped",
        }),
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "Error ejecutando automatización NBA" },
      { status: 500 }
    );
  }
}
