import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();

  const auth = cookieStore.get("nesped_auth")?.value;
  const clientId = cookieStore.get("nesped_client_id")?.value;
  const clientName = cookieStore.get("nesped_client_name")?.value;

  if (auth !== "ok") {
    return Response.json({
      success: false,
      authenticated: false,
    });
  }

  return Response.json({
    success: true,
    authenticated: true,
    clientId,
    clientName,
  });
}