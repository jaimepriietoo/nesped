import { getClients, updateClient } from "@/lib/clients-store";

export async function GET() {
  return Response.json({
    success: true,
    data: getClients(),
  });
}

export async function PATCH(req) {
  try {
    const body = await req.json();
    const { id, name, type, status, tagline, logoText } = body;

    if (!id) {
      return Response.json(
        { success: false, message: "Falta id del cliente" },
        { status: 400 }
      );
    }

    const updated = updateClient(id, {
      name,
      type,
      status,
      tagline,
      logoText,
    });

    if (!updated) {
      return Response.json(
        { success: false, message: "Cliente no encontrado" },
        { status: 404 }
      );
    }

    return Response.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error actualizando cliente" },
      { status: 500 }
    );
  }
}