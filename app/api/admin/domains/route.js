import { createClient } from "@supabase/supabase-js";
import { getAdminContext } from "@/lib/server/auth";
import { validar } from "@/lib/server/esquemas";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { observeRoute } from "@/lib/server/observability.mjs";
import { z } from "zod";

const DominioAdmin = z.object({
  clientId: z.string().trim().min(1).max(200),
  domain: z.string().trim().toLowerCase().max(253)
    .regex(/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Dominio inválido"),
});

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

async function manejarPOST(req) {
  try {
    const originError = requireSameOrigin(req);
    if (originError) return originError;

    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        { success: false, message: admin.message },
        { status: admin.status || 401 }
      );
    }

    const limited = await requireRateLimitAsync(req, {
      namespace: "admin:domains",
      limit: 10,
      keyParts: [admin.userEmail],
      includeIp: false,
    });
    if (limited) return limited;

    const cuerpo = await leerJsonLimitado(req, { maxBytes: 4 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const leido = validar(DominioAdmin, cuerpo.datos);
    if (leido.respuesta) return leido.respuesta;
    const { clientId, domain } = leido.datos;

    if (/(^|\.)(nesped\.com|vercel\.app)$/.test(domain)) {
      return Response.json({ success: false, message: "Ese dominio está reservado" }, { status: 400 });
    }
    if (!process.env.VERCEL_PROJECT_ID || !process.env.VERCEL_TOKEN) {
      return Response.json({ success: false, message: "La conexión de dominios no está disponible" }, { status: 503 });
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

    const addJson = await addRes.json().catch(() => null);
    if (!addRes.ok) {
      return Response.json({ success: false, message: "Vercel rechazó el dominio" }, { status: 502 });
    }

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

    const inspectJson = await inspectRes.json().catch(() => null);
    if (!inspectRes.ok) {
      return Response.json({ success: false, message: "No se pudo comprobar el dominio" }, { status: 502 });
    }

    const supabase = getSupabase();
    const { data: updated, error: updateError } = await supabase
      .from("clients")
      .update({ custom_domain: domain })
      .eq("id", clientId)
      .select("id,custom_domain")
      .maybeSingle();

    if (updateError) throw new Error("No se pudo guardar el dominio");
    if (!updated) return Response.json({ success: false, message: "Empresa no encontrada" }, { status: 404 });

    return Response.json({
      success: true,
      added: addJson,
      inspect: inspectJson,
    });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error conectando dominio" },
      { status: 500 }
    );
  }
}

export const POST = observeRoute("api.admin.domains.post", manejarPOST);
