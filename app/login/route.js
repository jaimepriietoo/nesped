import { cookies } from "next/headers";

export async function POST(req) {
  try {
    const body = await req.json();
    const { email, password } = body;

    const validEmail = process.env.LOGIN_EMAIL;
    const validPassword = process.env.LOGIN_PASSWORD;

    if (email !== validEmail || password !== validPassword) {
      return Response.json(
        { success: false, message: "Credenciales incorrectas" },
        { status: 401 }
      );
    }

    const cookieStore = await cookies();
    cookieStore.set("nesped_auth", "ok", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json(
      { success: false, message: "Error iniciando sesión" },
      { status: 500 }
    );
  }
}