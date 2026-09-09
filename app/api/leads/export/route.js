import { getPortalContext, hasRole } from "@/lib/portal-auth";

/**
 * Descarga los contactos en CSV.
 *
 * Es lo primero que pide un negocio en cuanto empieza a recibir llamadas:
 * sacar sus contactos y meterlos donde ya trabaja. Sin esto los datos que
 * capta el agente viven sólo aquí dentro, y eso convierte el portal en una
 * jaula.
 *
 * Tres cosas que esta ruta hacía mal y ahora no:
 *
 *  · Cualquiera con acceso al portal podía descargarse la lista entera,
 *    incluidos los roles de sólo lectura. Sacar todos los contactos de golpe
 *    no es lo mismo que verlos en pantalla, así que pide el mismo nivel que
 *    la auditoría.
 *  · Un campo que empiece por "=" lo ejecuta Excel como fórmula al abrir el
 *    fichero. Estos textos son lo que ha dicho por teléfono un desconocido,
 *    o sea entrada ajena, y llegaban tal cual a la hoja de cálculo.
 *  · Sin BOM, Excel en Windows abre el CSV en su codificación local y los
 *    acentos salen rotos: "MÃ¡laga" en vez de "Málaga".
 *
 * Y se exportan las columnas que sirven para llamar y saber de qué iba, no
 * las internas: puntuaciones y banderas de automatismos no significan nada
 * abiertas en un Excel y sólo estorban a quien busca un teléfono.
 */

function campoCsv(valor) {
  const texto = String(valor ?? "");
  const seguro = /^[=+\-@\t\r]/.test(texto) ? `'${texto}` : texto;

  if (/[",\n\r]/.test(seguro)) {
    return `"${seguro.replace(/"/g, '""')}"`;
  }
  return seguro;
}

const COLUMNAS = [
  ["Nombre", (l) => l.nombre],
  ["Teléfono", (l) => l.telefono],
  ["Email", (l) => l.email],
  ["Ciudad", (l) => l.ciudad],
  ["Necesidad", (l) => l.necesidad],
  ["Estado", (l) => l.status],
  ["Interés", (l) => l.interes],
  ["Origen", (l) => l.origen || l.fuente],
  ["Valor estimado", (l) => (l.valor_estimado == null ? "" : l.valor_estimado)],
  ["Resumen", (l) => l.resumen],
  ["Notas", (l) => l.notes],
  ["Responsable", (l) => l.owner],
  ["Última acción", (l) => l.ultima_accion],
  ["Próxima acción", (l) => l.proxima_accion],
  ["Último contacto", (l) => l.last_contact_at || l.last_contacted_at],
  ["Creado", (l) => l.created_at],
];

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
        { success: false, message: "Sin permisos para exportar contactos" },
        { status: 403 }
      );
    }

    const { data, error } = await ctx.supabase
      .from("leads")
      .select("*")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(error.message || "No se pudieron leer los contactos");
    }

    const csv = [
      COLUMNAS.map(([titulo]) => campoCsv(titulo)).join(","),
      ...(data || []).map((lead) =>
        COLUMNAS.map(([, leer]) => campoCsv(leer(lead))).join(",")
      ),
    ].join("\r\n");

    const hoy = new Date().toISOString().slice(0, 10);

    return new Response(`﻿${csv}`, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contactos-${hoy}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, message: error.message || "No se pudo exportar" },
      { status: 500 }
    );
  }
}
