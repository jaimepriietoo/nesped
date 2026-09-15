import { gestionarUsuario } from "@/lib/server/usuarios-portal";
import { observeRoute } from "@/lib/server/observability.mjs";

async function manejarPOST(req) {
  return gestionarUsuario(req, "create");
}

export const POST = observeRoute("api.portal.users.create.post", manejarPOST);
