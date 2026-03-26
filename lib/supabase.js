import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error("SUPABASE_URL no configurada");
  }

  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY no configurada");
  }

  return createClient(url, key);
}