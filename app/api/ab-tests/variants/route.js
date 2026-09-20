import { NextResponse } from "next/server";
import { variantes, crearVariante } from "@/lib/server/datos";
import { getPortalContext } from "@/lib/portal-auth";
import { puede } from "@/lib/server/permisos";
import { validar } from "@/lib/server/esquemas";
import { CrearVarianteMensaje } from "@/lib/server/esquemas-operaciones";
import { leerJsonLimitado, requireRateLimitAsync, requireSameOrigin } from "@/lib/server/security";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    const rows = await variantes({ client_id: ctx.clientId, activas: false });

    return NextResponse.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    logErrorSeguro("experiments.variants_read_failed", err);
    return NextResponse.json({
      success: false,
      message: "Error obteniendo variantes",
    });
  }
}

async function manejarPOST(req) {
  try {
    const sameOriginError = requireSameOrigin(req);
    if (sameOriginError) {
      return sameOriginError;
    }

    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return NextResponse.json(
        { success: false, message: ctx.message || "No autorizado" },
        { status: 401 }
      );
    }

    if (!puede(ctx.role, "experiments.manage", ctx.permissions)) {
      return NextResponse.json(
        { success: false, message: "Sin permisos para crear variantes" },
        { status: 403 }
      );
    }

    const limite = await requireRateLimitAsync(req, {
      namespace: "experiment-variant-create", limit: 30, keyParts: [ctx.clientId, ctx.userEmail],
    });
    if (limite) return limite;
    const cuerpo = await leerJsonLimitado(req, { maxBytes: 16 * 1024 });
    if (cuerpo.respuesta) return cuerpo.respuesta;
    const entrada = validar(CrearVarianteMensaje, cuerpo.datos);
    if (entrada.respuesta) return entrada.respuesta;
    const body = entrada.datos;

    const row = await crearVariante({
      client_id: ctx.clientId,
      name: body.name || "",
      channel: body.channel || "whatsapp",
      stage: body.stage || "qualified",
      content: body.content || "",
      active: body.active !== false,
    });

    return NextResponse.json({
      success: true,
      data: row,
    });
  } catch (err) {
    logErrorSeguro("experiments.variant_create_failed", err);
    return NextResponse.json({
      success: false,
      message: "Error creando variante",
    });
  }
}

export const GET = observeRoute("api.ab-tests.variants.get", manejarGET);
export const POST = observeRoute("api.ab-tests.variants.post", manejarPOST);
