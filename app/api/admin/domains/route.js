import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function POST(req) {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const body = await req.json();
    const { clientId, domain } = body;

    if (!clientId || !domain) {
      return Response.json(
        { success: false, message: "Faltan clientId o domain" },
        { status: 400 }
      );
    }

    const addRes = await fetch(
      `https://api.vercel.com/v10/projects/${process.env.VERCEL_PROJECT_ID}/domains`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: domain }),
      }
    );

    const addJson = await addRes.json();

    const inspectRes = await fetch(
      `https://api.vercel.com/v9/projects/${process.env.VERCEL_PROJECT_ID}/domains/${encodeURIComponent(
        domain
      )}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
        },
      }
    );

    const inspectJson = await inspectRes.json();

    const supabase = getSupabase();
    await supabase
      .from("clients")
      .update({ custom_domain: domain })
      .eq("id", clientId);

    return Response.json({
      success: true,
      added: addJson,
      inspect: inspectJson,
    });
  } catch (error) {
    console.error("admin domains error:", error);
    return Response.json(
      { success: false, message: "Error conectando dominio" },
      { status: 500 }
    );
  }
}
