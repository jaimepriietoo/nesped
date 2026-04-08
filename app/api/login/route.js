import { cookies } from "next/headers";
import { getSupabase } from "@/lib/supabase";

const supabase = getSupabase();

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const { data: user, error } = await supabase
      .from("users")
      .select("email,password,role,client_id")
      .eq("email", email)
      .single();

    if (error || !user || user.password !== password) {
      return Response.json(
        { success: false, message: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const { data: client } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", user.client_id)
      .single();

    const cookieStore = await cookies();

    cookieStore.set("nesped_auth", "ok", {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set("nesped_client_id", user.client_id, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    cookieStore.set("nesped_client_name", client?.name || user.client_id, {
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

    cookieStore.set("nesped_user_email", email, {
  httpOnly: true,
  sameSite: "lax",
  secure: true,
  path: "/",
});

    return Response.json({
      success: true,
      clientId: user.client_id,
      clientName: client?.name || user.client_id,
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