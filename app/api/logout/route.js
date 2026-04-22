import { clearAuthCookies } from "@/lib/server/auth";

export async function POST() {
  await clearAuthCookies();

  return Response.json({ success: true });
}
