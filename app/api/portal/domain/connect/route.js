import { getPortalContext, hasRole } from "@/lib/portal-auth";
import { requireSameOrigin, requireRateLimitAsync } from "@/lib/server/security";
import { resolveTxt } from "node:dns/promises";

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

    if (/(^|\.)(nesped\.com|vercel\.app)$/.test(domain)) {
      return Response.json({ success: false, message: "Ese dominio está reservado." }, { status: 400 });
    }
    const limited = await requireRateLimitAsync(req, { namespace: "domain:connect", limit: 10, keyParts: [ctx.clientId], includeIp: false });
    if (limited) return limited;
    const verification = `nesped-verification=${ctx.clientId}`;
    const records = await resolveTxt(`_nesped.${domain}`).catch(() => []);
    if (!records.some(record => record.join("") === verification)) {
      return Response.json({ success: false, message: "Verifica primero la propiedad del dominio con este registro DNS TXT.",
        verification: { name: `_nesped.${domain}`, value: verification } }, { status: 409 });
    }
    const { data: existing, error: existingError } = await ctx.supabase.from("clients")
      .select("id").eq("custom_domain", domain).neq("id", ctx.clientId).maybeSingle();
    if (existingError || existing) return Response.json({ success: false, message: "Dominio no disponible." }, { status: 409 });

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
      if (!addRes.ok) throw new Error("No se pudo conectar el dominio");

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
      if (!inspectRes.ok || inspectJson?.verified !== true) throw new Error("Dominio pendiente de verificación");
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
        message: "No se pudo conectar el dominio",
      },
      { status: 500 }
    );
  }
}
