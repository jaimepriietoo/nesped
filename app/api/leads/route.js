import { getPortalContext } from "@/lib/portal-auth";
import { logErrorSeguro, observeRoute } from "@/lib/server/observability.mjs";

async function manejarGET() {
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
        filterGroups: [{ filters: [{ propertyName: "nesped_client_id", operator: "EQ", value: clientId }] }],
        limit: 20,
        properties: [
          "firstname",
          "phone",
          "city",
          "createdate",
          "nesped_need",
          "nesped_preference",
          "nesped_source",
          "nesped_client_id",
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
      logErrorSeguro("hubspot.contacts_failed", new Error(`HubSpot respondió ${res.status}`));
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
      clientId: item.properties?.nesped_client_id || "",
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
      lead.clientId === clientId
    );

    return Response.json({
      success: true,
      total: filteredLeads.length,
      data: filteredLeads,
    });
  } catch (error) {
    logErrorSeguro("hubspot.contacts_load_failed", error);

    return Response.json(
      {
        success: false,
        message: "Error obteniendo contactos",
        data: [],
      },
      { status: 500 }
    );
  }
}

export const GET = observeRoute("api.leads.get", manejarGET);
