import { cookies } from "next/headers";
import { findUser } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const user = findUser(email, password);

    if (!user) {
      return Response.json(
        { success: false, message: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const { data } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", user.clientId)
      .single();

    const cookieStore = await cookies();

    cookieStore.set("nesped_auth", "ok", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set("nesped_client_id", user.clientId, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set("nesped_client_name", data?.name || user.clientName, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set("nesped_role", user.role || "client", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return Response.json({
      success: true,
      clientId: user.clientId,
      clientName: data?.name || user.clientName,
      role: user.role || "client",
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      { success: false, message: "Error iniciando sesión" },
      { status: 500 }
    );
  }
}