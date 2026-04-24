import { createClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/server/observability.mjs";

let cachedSupabase = null;
let hasLoggedMissingSupabase = false;

function createMissingEnvClient() {
  const message = "Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY";

  return new Proxy(
    {},
    {
      get() {
        return () => {
          throw new Error(message);
        };
      },
    }
  );
}

export function getSupabase() {
  if (cachedSupabase) return cachedSupabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    if (!hasLoggedMissingSupabase) {
      hasLoggedMissingSupabase = true;
      logEvent("warn", "supabase.missing_env", {
        hasUrl: Boolean(url),
        hasServiceRoleKey: Boolean(key),
      });
    }
    cachedSupabase = createMissingEnvClient();
    return cachedSupabase;
  }

  cachedSupabase = createClient(url, key);
  return cachedSupabase;
}
