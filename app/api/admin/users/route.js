import { createClient } from "@supabase/supabase-js";
import { getAdminContext, hashPassword } from "@/lib/server/auth";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function GET() {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        {
          success: false,
          message: admin.message,
          data: [],
        },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from("users")
      .select("id,email,role,client_id,created_at")
      .order("created_at", { ascending: true });

    if (error) {
      return Response.json(
        {
          success: false,
          message: error.message,
          data: [],
        },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error("GET /api/admin/users error:", error);

    return Response.json(
      {
        success: false,
        message: "Error cargando usuarios",
        data: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(req) {
  try {
    const admin = await getAdminContext();
    if (!admin.ok) {
      return Response.json(
        {
          success: false,
          message: admin.message,
        },
        { status: admin.status || 401 }
      );
    }

    const supabase = getSupabase();
    const body = await req.json();

    const email = body.email?.trim()?.toLowerCase();
    const password = body.password?.trim();
    const role = body.role?.trim() || "client";
    const clientId = body.clientId?.trim();

    if (!email || !password || !clientId) {
      return Response.json(
        {
          success: false,
          message: "Faltan email, password o clientId",
        },
        { status: 400 }
      );
    }

    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return Response.json(
        {
          success: false,
          message: "Ya existe un usuario con ese email",
        },
        { status: 400 }
      );
    }

    const { data: clientExists } = await supabase
      .from("clients")
      .select("id,name")
      .eq("id", clientId)
      .maybeSingle();

    if (!clientExists) {
      return Response.json(
        {
          success: false,
          message: "El cliente seleccionado no existe",
        },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("users")
      .insert([
        {
          email,
          password: hashPassword(password),
          role,
          client_id: clientId,
          created_at: new Date().toISOString(),
        },
      ])
      .select("id,email,role,client_id,created_at")
      .single();

    if (error) {
      return Response.json(
        {
          success: false,
          message: error.message,
        },
        { status: 500 }
      );
    }

    try {
      await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/onboarding-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          clientName: clientExists.name,
          password,
          loginUrl: `${process.env.NEXT_PUBLIC_APP_URL}/login`,
        }),
      });
    } catch (emailErr) {
      console.error("Error enviando onboarding email:", emailErr);
    }

    return Response.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("POST /api/admin/users error:", error);

    return Response.json(
      {
        success: false,
        message: error.message || "Error creando usuario",
      },
      { status: 500 }
    );
  }
}
