export async function GET() {
  try {
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

    if (!res.ok) {
      const text = await res.text();
      console.error("HubSpot error:", text);
      return Response.json(
        {
          success: false,
          message: "Error al consultar HubSpot",
          data: [],
        },
        { status: 500 }
      );
    }

    const json = await res.json();

    const leads = (json.results || []).map((item, index) => ({
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

    return Response.json({
      success: true,
      total: leads.length,
      data: leads,
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