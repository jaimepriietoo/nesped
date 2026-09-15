import { gestionarUsuario } from "@/lib/server/usuarios-portal";

export async function POST(req) {
  return gestionarUsuario(req, "password");
}
