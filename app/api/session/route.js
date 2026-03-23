import { cookies } from "next/headers";
import { getClientById } from "@/lib/clients";

export async function GET() {
  const cookieStore = await cookies();

  const auth = cookieStore.get("nesped_auth")?.value;
  const clientId = cookieStore.get("nesped_client_id")?.value;

  if (auth !== "ok") {
    return Response.json({
      success: false,
      authenticated: false,
    });
  }

  const client = getClientById(clientId || "demo");

  return Response.json({
    success: true,
    authenticated: true,
    clientId: client.id,
    clientName: client.name,
    client,
  });
}