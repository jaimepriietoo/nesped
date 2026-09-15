import { gestionarUsuario } from "@/lib/server/usuarios-portal";

export async function PATCH(req) {
  return gestionarUsuario(req, "update");
}
