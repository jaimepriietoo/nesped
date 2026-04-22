import { getPortalSessionContext } from "@/lib/server/auth";

export async function getPortalContext() {
  return getPortalSessionContext();
}

export function hasRole(role, allowed = []) {
  return allowed.map((item) => String(item || "").toLowerCase()).includes(
    String(role || "").toLowerCase()
  );
}
