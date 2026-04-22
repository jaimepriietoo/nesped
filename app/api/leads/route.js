import { getPortalContext } from "@/lib/portal-auth";

export async function GET() {
  try {
    const ctx = await getPortalContext();
    if (!ctx.ok) {
      return Response.json(
        {
          success: false,
          message: "No autorizado",
          data: [],
        },
        { status: 401 }
      );
    }

    const clientId = ctx.clientId;

    const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      },
      body: JSON.stringify({
        limit: 20,
        properties: [
          "firstname",
          "phone",
          "city",
          "createdate",
          "nesped_need",
          "nesped_preference",
          "nesped_source",
        ],
        sorts: [
          {
            propertyName: "createdate",
            direction: "DESCENDING",
          },
        ],
      }),
      cache: "no-store",
    });

    const text = await res.text();

    if (!res.ok) {
      console.error("HubSpot API error:", text);
      return Response.json(
        {
          success: false,
          message: "Error al consultar HubSpot",
          data: [],
        },
        { status: 500 }
      );
    }

    const json = JSON.parse(text);

    const allLeads = (json.results || []).map((item, index) => ({
      id: item.id || index,
      nombre: item.properties?.firstname || "Sin nombre",
      telefono: item.properties?.phone || "",
      ciudad: item.properties?.city || "",
      necesidad: item.properties?.nesped_need || "Sin necesidad",
      preferencia: item.properties?.nesped_preference || "",
      origen: item.properties?.nesped_source || "Sin origen",
      fecha: item.properties?.createdate
        ? new Date(item.properties.createdate).toLocaleString("es-ES")
        : "Reciente",
    }));

    const filteredLeads = allLeads.filter((lead) =>
      (lead.origen || "").includes(clientId)
    );

    return Response.json({
      success: true,
      total: filteredLeads.length,
      data: filteredLeads,
    });
  } catch (error) {
    console.error("Error cargando leads reales:", error);

    return Response.json(
      {
        success: false,
        message: "Error obteniendo leads",
        data: [],
      },
      { status: 500 }
    );
  }
}
