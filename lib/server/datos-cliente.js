/**
 * Un cliente de base de datos que no puede olvidarse la empresa.
 *
 * El aislamiento entre empresas vive entero en que cada consulta lleve su
 * `.eq("client_id", …)`. La aplicación habla con Postgres usando la clave de
 * servicio, que tiene BYPASSRLS, así que las políticas de la base de datos no
 * intervienen nunca: si una consulta se olvida el filtro, devuelve los datos
 * de todo el mundo y nadie se entera.
 *
 * No es teórico. En una sola revisión aparecieron cinco casos —eventos,
 * notas, comentarios y recordatorios de contactos— y en uno de ellos leí seis
 * eventos de otra empresa con una cuenta recién creada.
 *
 * La respuesta habitual a esto es "hay que acordarse". La disciplina funciona
 * con cinco rutas y falla con noventa, sobre todo cuando la escribe alguien
 * que no conoce el historial. Así que en vez de recordarlo, se hace imposible
 * olvidarlo: este envoltorio aplica el filtro él mismo, antes de que la
 * consulta salga.
 *
 *   ctx.datos.from("leads").select("*")
 *
 * ya viene filtrada por la empresa de la sesión. No hay parámetro que tocar
 * ni orden que respetar.
 *
 * Desde el despliegue de `nesped_app`, este envoltorio es la primera red y RLS
 * es la segunda: el JWT corto fija `app.client_id` en cada transacción de
 * PostgREST. Se conservan ambas a propósito. El filtro visible evita errores
 * y reduce trabajo; la política de Postgres contiene un olvido en código.
 */

/**
 * Tablas cuyas filas pertenecen a una empresa.
 *
 * Si una tabla nueva guarda datos de clientes tiene que entrar en esta lista.
 * La prueba `aislamiento.test.mjs` recorre las rutas y avisa si aparece una
 * consulta a una de ellas sin filtro.
 *
 * Esta lista se quedó vieja una vez y no avisó, que es lo que hacen las listas
 * escritas a mano: había cuatro tablas con client_id que no estaban aquí, y
 * una era `users`, donde viven las cuentas. Una ruta que consultara `users`
 * sin filtrar habría enseñado las cuentas de todas las empresas y la prueba no
 * habría dicho nada.
 *
 * Por eso ahora hay una segunda red: /api/ops/salud compara esta lista con lo
 * que dice el catálogo de Postgres y avisa si vuelven a separarse. Ver
 * `tablas_de_empresa()`.
 */
export const TABLAS_POR_EMPRESA = new Set([
  "leads",
  "calls",
  "lead_events",
  "lead_notes",
  "lead_comments",
  "lead_reminders",
  "audit_logs",
  "alerts",
  "ai_insights",
  "performance_snapshots",
  "client_settings",
  "portal_users",
  "weekly_reports",
  "sms_templates",
  "whatsapp_templates",
  "subscriptions",
  "invoices",
  "consumo_diario",
  "codigos_recuperacion",
  "trabajos",
  "grabaciones_pendientes",
  /* Las cuentas. Estaba fuera de la lista y es de las que más importan. */
  "users",
  /* Los archivos de la fase 3: mismos datos, otra tabla. */
  "lead_events_archivo",
  "audit_logs_archivo",
  /* Lo que vivía en Prisma sobre SQLite y ahora es de Postgres, con empresa. */
  "lead_memory",
  "upsell_events",
  "appointments",
  "message_experiment_results",
  "lead_reactivations",
  /* Las variantes de mensaje admiten client_id nulo (variante de
     plataforma), pero las de una empresa son suyas y se vigilan igual. */
  "message_variants",
  /* El reto de segundo factor: lleva la empresa del usuario que entra. */
  "auth_challenges",
  "auth_totp_factors",
  "auth_webauthn_credentials",
  /* Lo que la IA debe saber ahora: avisos con fecha de fin. */
  "conocimiento",
  /* Una fila por sesión abierta, para verlas y cerrar una sola. */
  "sesiones_activas",
  /* Países desde los que entra cada persona y los 403 del portal. */
  "paises_de_acceso",
  "accesos_denegados",
  /* Reclamos previos a envíos: una clave sólo puede salir una vez. */
  "mensajes_salientes_idempotentes",
  /* Lo que cada empresa gasta en IA, y los webhooks que le llegan. */
  "ia_llamadas",
  "webhook_events",
  "webhook_entregas",
  /* Departamentos, destinatarios y automatismos de cada empresa. */
  "departamentos",
  "destinatarios",
  "notificaciones_lead",
  "automatismos",
  "automatismos_ejecuciones",
]);

/**
 * Tablas donde la empresa ES la fila, así que el filtro va por `id`.
 */
const TABLAS_QUE_SON_LA_EMPRESA = new Set(["clients"]);

/**
 * Envuelve un cliente de Supabase para que toda consulta salga ya filtrada.
 *
 * CÓMO FUNCIONA DE VERDAD. `supabase.from(tabla)` devuelve un constructor de
 * consultas que sólo sabe hacer `select`, `insert`, `upsert`, `update` y
 * `delete`; los filtros —`.eq()` y compañía— aparecen DESPUÉS, sobre lo que
 * devuelven esos cinco. La primera versión de este envoltorio llamaba a
 * `.eq()` nada más salir de `.from()`, y con el cliente real eso es "eq is
 * not a function": reventaba en la primera consulta. La prueba no lo vio
 * porque usaba un cliente de mentira que sí tenía `.eq()` ahí. Ninguna ruta
 * lo usaba, y por eso nadie se enteró.
 *
 * Ahora se intercepta cada uno de los cinco:
 *   - select / update / delete → se llama al original y se le añade el
 *     filtro por empresa al resultado;
 *   - insert / upsert → la empresa se escribe en cada fila antes de mandarla.
 * Todo lo demás pasa tal cual.
 *
 * Las tablas que no son de empresa —catálogos, configuración global— pasan
 * sin tocar: forzarles un client_id que no tienen las rompería.
 */
export function datosDeLaEmpresa(supabase, clientId) {
  if (!supabase || !clientId) {
    throw new Error("datosDeLaEmpresa necesita un cliente de base de datos y una empresa");
  }

  const columnaDe = (tabla) =>
    TABLAS_QUE_SON_LA_EMPRESA.has(tabla) ? "id" : TABLAS_POR_EMPRESA.has(tabla) ? "client_id" : null;

  /* Escribe la empresa en una fila o en cada fila de un lote. Si la fila ya
     la trae y es OTRA, no se corrige en silencio: se lanza, porque escribir
     en la empresa equivocada es exactamente lo que esto existe para impedir. */
  const conEmpresa = (filas, columna) => {
    const poner = (fila) => {
      if (fila && typeof fila === "object" && fila[columna] !== undefined && fila[columna] !== clientId) {
        throw new Error(`Escritura en otra empresa: ${columna}=${fila[columna]} con sesión de ${clientId}`);
      }
      return { ...fila, [columna]: clientId };
    };
    return Array.isArray(filas) ? filas.map(poner) : poner(filas);
  };

  return {
    /** Igual que supabase.from(), pero ya acotado a esta empresa. */
    from(tabla) {
      const original = supabase.from(tabla);
      const columna = columnaDe(tabla);
      if (!columna) return original;

      return {
        select: (...args) => original.select(...args).eq(columna, clientId),
        update: (...args) => original.update(...args).eq(columna, clientId),
        delete: (...args) => original.delete(...args).eq(columna, clientId),
        insert: (filas, ...resto) => original.insert(conEmpresa(filas, columna), ...resto),
        upsert: (filas, ...resto) => original.upsert(conEmpresa(filas, columna), ...resto),
      };
    },

    /** Las funciones se pasan tal cual: reciben la empresa por parámetro. */
    rpc: (...args) => supabase.rpc(...args),

    /**
     * La vía sin el filtro de JavaScript, con nombre feo a propósito.
     *
     * Cuando el cliente subyacente es `nesped_app`, RLS sigue acotándolo a la
     * empresa: esto NO permite cruzarlas. Administración y trabajos
     * programados usan getSupabaseAdministrativo() fuera del portal.
     */
    sinFiltroDeEmpresa: supabase,

    /** La empresa a la que está atado este cliente. */
    clientId,
  };
}
