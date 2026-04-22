import { getSupabase } from "@/lib/supabase";
import { setAuthCookies, verifyPassword } from "@/lib/server/auth";
import { findUser } from "@/lib/auth";

export async function POST(req) {
  try {
    const supabase = getSupabase();
    const body = await req.json();
    const email = String(body?.email || "").trim().toLowerCase();
    const password = String(body?.password || "");
    const nextPath = String(body?.next || "").trim();

    if (!email || !password) {
      return Response.json(
        { success: false, message: "Faltan email o contraseña" },
        { status: 400 }
      );
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("email,password,password_hash,role,client_id")
      .eq("email", email)
      .limit(1)
      .maybeSingle();

    let authenticatedUser = null;

    const storedPassword = user?.password || user?.password_hash || "";

    if (!error && user && verifyPassword(password, storedPassword)) {
      authenticatedUser = {
        email,
        client_id: user.client_id,
        role: user.role || "client",
      };
    } else {
      const legacyUser = findUser(email, password);

      if (legacyUser) {
        authenticatedUser = {
          email: legacyUser.email,
          client_id: legacyUser.clientId,
          role: legacyUser.role || "client",
        };
      }
    }

    if (!authenticatedUser) {
      return Response.json(
        { success: false, message: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", authenticatedUser.client_id)
      .single();

    await setAuthCookies({
      email,
      clientId: authenticatedUser.client_id,
      role: authenticatedUser.role || "client",
      clientName: client?.name || authenticatedUser.client_id,
    });

    return Response.json({
      success: true,
      clientId: authenticatedUser.client_id,
      clientName: client?.name || authenticatedUser.client_id,
      role: authenticatedUser.role || "client",
      redirectTo:
        nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")
          ? nextPath
          : "/portal",
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error iniciando sesión" },
      { status: 500 }
    );
  }
}
