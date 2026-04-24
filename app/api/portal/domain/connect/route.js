import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin } from "@/lib/server/security";

function isValidDomain(value = "") {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(value || "").trim());
}

export async function POST(req) {
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

    if (!hasRole(ctx.role, ["owner", "admin"])) {
      return Response.json(
        { success: false, message: "Sin permisos para conectar dominio" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const domain = String(body?.domain || "").trim().toLowerCase();

    if (!domain || !isValidDomain(domain)) {
      return Response.json(
        { success: false, message: "Dominio inválido" },
        { status: 400 }
      );
    }

    let addJson = null;
    let inspectJson = null;

    if (process.env.VERCEL_PROJECT_ID && process.env.VERCEL_TOKEN) {
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

      addJson = await addRes.json().catch(() => null);

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

      inspectJson = await inspectRes.json().catch(() => null);
    }

    const { error } = await ctx.supabase
      .from("clients")
      .update({
        custom_domain: domain,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.clientId);

    if (error) {
      throw new Error(error.message);
    }

    return Response.json({
      success: true,
      message:
        process.env.VERCEL_PROJECT_ID && process.env.VERCEL_TOKEN
          ? "Dominio guardado y enviado a Vercel para su conexión."
          : "Dominio guardado. La conexión automática con Vercel no está activa en este entorno.",
      data: {
        domain,
        added: addJson,
        inspect: inspectJson,
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        message: error.message || "No se pudo conectar el dominio",
      },
      { status: 500 }
    );
  }
}
