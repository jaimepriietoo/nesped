import { gestionarUsuario } from "@/lib/server/usuarios-portal";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarPATCH(req) {
  return gestionarUsuario(req, "update");
}

export const PATCH = observeRoute("api.portal.users.update.patch", manejarPATCH);
