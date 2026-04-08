import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

export async function getPortalContext() {
  const cookieStore = await cookies();
  const auth = cookieStore.get("nesped_auth")?.value;
  const clientId = cookieStore.get("nesped_client_id")?.value || "demo";
  const userEmail = cookieStore.get("nesped_user_email")?.value || "";

  if (auth !== "ok" && clientId !== "demo") {
    return { ok: false, message: "No autorizado" };
  }

  const supabase = getSupabase();

  let currentUser = null;

  if (userEmail) {
    const { data } = await supabase
      .from("portal_users")
      .select("*")
      .eq("client_id", clientId)
      .eq("email", userEmail)
      .maybeSingle();

    currentUser = data || null;
  }

  if (!currentUser && clientId === "demo") {
    currentUser = {
      email: "demo@nesped.com",
      full_name: "Demo Owner",
      role: "owner",
    };
  }

  return {
    ok: true,
    clientId,
    userEmail,
    role: currentUser?.role || "viewer",
    currentUser,
    supabase,
  };
}

export function hasRole(role, allowed = []) {
  return allowed.includes(role);
}