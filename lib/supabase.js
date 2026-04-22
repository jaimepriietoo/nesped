import { createClient } from "@supabase/supabase-js";

let cachedSupabase = null;

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
    cachedSupabase = createMissingEnvClient();
    return cachedSupabase;
  }

  cachedSupabase = createClient(url, key);
  return cachedSupabase;
}
