import { createClient } from "@supabase/supabase-js";
import { logEvent } from "@/lib/server/observability.mjs";
import { clienteDeDatosActual } from "@/lib/server/contexto.mjs";
import { envolverConCifrado } from "@/lib/server/cifrado-datos";

let cachedSupabase = null;
let cachedCrudo = null;
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

/**
 * `crudo: true` devuelve el cliente sin el envoltorio de cifrado: sólo para
 * el trabajo que rellena los sobres de las filas antiguas y los scripts de
 * rotación, que necesitan ver las columnas tal cual están.
 */
export function getSupabaseAdministrativo({ crudo = false } = {}) {
  if (crudo && cachedCrudo) return cachedCrudo;
  if (!crudo && cachedSupabase) return cachedSupabase;

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
    cachedCrudo = cachedSupabase;
    return cachedSupabase;
  }

  cachedCrudo = createClient(url, key);
  cachedSupabase = envolverConCifrado(cachedCrudo);
  return crudo ? cachedCrudo : cachedSupabase;
}

/**
 * Dentro de una petición del portal devuelve el cliente RLS de esa empresa.
 * Fuera —login, webhooks, administración y cron— conserva el cliente interno
 * explícitamente privilegiado. Las operaciones cruzadas pueden pedirlo por
 * nombre con getSupabaseAdministrativo(), para que la excepción sea visible.
 */
export function getSupabase() {
  return clienteDeDatosActual() || getSupabaseAdministrativo();
}
