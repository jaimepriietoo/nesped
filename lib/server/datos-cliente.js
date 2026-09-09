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
 * NO sustituye a RLS con contexto de sesión, que sería la red de verdad, por
 * debajo de la aplicación. Eso exige dejar de usar la clave de servicio y
 * firmar un token por petición: es un cambio grande y con riesgo de romperlo
 * todo, y merece su propia ventana. Esto cubre el mismo fallo desde arriba y
 * se puede probar.
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
]);

/**
 * Tablas donde la empresa ES la fila, así que el filtro va por `id`.
 */
const TABLAS_QUE_SON_LA_EMPRESA = new Set(["clients"]);

/**
 * Envuelve un cliente de Supabase para que toda consulta salga ya filtrada.
 *
 * Se apoya en que el constructor de consultas de Supabase encadena: `.from()`
 * devuelve un objeto sobre el que se sigue llamando a `.select()`, `.eq()`,
 * etc. Aplicando el filtro nada más llamar a `.from()`, todo lo que venga
 * después se suma al que ya está puesto.
 *
 * Las tablas que no son de empresa —catálogos, configuración global— pasan
 * tal cual: forzarles un client_id que no tienen las rompería.
 */
export function datosDeLaEmpresa(supabase, clientId) {
  if (!supabase || !clientId) {
    throw new Error("datosDeLaEmpresa necesita un cliente de base de datos y una empresa");
  }

  return {
    /** Igual que supabase.from(), pero ya acotado a esta empresa. */
    from(tabla) {
      const consulta = supabase.from(tabla);

      if (TABLAS_QUE_SON_LA_EMPRESA.has(tabla)) {
        return consulta.eq("id", clientId);
      }

      if (TABLAS_POR_EMPRESA.has(tabla)) {
        return consulta.eq("client_id", clientId);
      }

      return consulta;
    },

    /** Las funciones se pasan tal cual: reciben la empresa por parámetro. */
    rpc: (...args) => supabase.rpc(...args),

    /**
     * La vía de escape, con nombre feo a propósito.
     *
     * Hay operaciones legítimas que cruzan empresas: el panel de
     * administración, los trabajos programados. Que haya que escribir esto
     * para conseguirlas obliga a pararse un segundo, y hace que salten a la
     * vista al leer el código o al revisar un cambio.
     */
    sinFiltroDeEmpresa: supabase,

    /** La empresa a la que está atado este cliente. */
    clientId,
  };
}
