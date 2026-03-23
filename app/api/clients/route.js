import { CLIENT_LIST } from "@/lib/clients";

export async function GET() {
  return Response.json({
    success: true,
    data: CLIENT_LIST,
  });
}