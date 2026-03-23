import { getClients } from "@/lib/clients-store";

export async function GET() {
  return Response.json({
    success: true,
    data: getClients(),
  });
}