import { getSupabaseAdministrativo } from "@/lib/supabase";
import { enviarCorreo } from "@/lib/server/correo";
import { logErrorSeguro, logEvent } from "@/lib/server/observability.mjs";

/**
 * Comportamiento raro, y quién se entera.
 *
 * La auditoría ya lo apunta todo; lo que faltaba era alguien que la mirase.
 * Aquí hay un catálogo de reglas, cada una con un nombre, un texto para el
 * correo y una función que devuelve hallazgos sobre las últimas 24 horas.
 * El mantenimiento diario las evalúa por empresa y avisa a los owners; el
 * hallazgo también queda en `alerts` para que se vea en el portal.
 *
 * Además hay dos comprobaciones en caliente, en el propio login: país nuevo
 * (exige segundo factor) y anotación de cada 403 del portal.
 */

const HORA_INICIO = 7;
const HORA_FIN = 22;
const ZONA = "Europe/Madrid";

function horaLocal(iso) {
  const partes = new Intl.DateTimeFormat("es-ES", { hour: "numeric", hour12: false, timeZone: ZONA })
    .formatToParts(new Date(iso));
  return Number(partes.find((p) => p.type === "hour")?.value || 0) % 24;
}

export function fueraDeHorario(iso) {
  const h = horaLocal(iso);
  return h < HORA_INICIO || h >= HORA_FIN;
}

/** Agrupa filas por una clave y devuelve las claves que superan el umbral. */
function rafagas(filas, clave, ventanaMs, umbral) {
  const porClave = new Map();
  for (const fila of filas) {
    const k = clave(fila);
    if (!porClave.has(k)) porClave.set(k, []);
    porClave.get(k).push(Date.parse(fila.created_at));
  }
  const resultado = [];
  for (const [k, tiempos] of porClave) {
    tiempos.sort((a, b) => a - b);
    for (let i = 0; i + umbral - 1 < tiempos.length; i += 1) {
      if (tiempos[i + umbral - 1] - tiempos[i] <= ventanaMs) {
        resultado.push({ clave: k, veces: tiempos.length });
        break;
      }
    }
  }
  return resultado;
}

export const REGLAS = [
  {
    id: "exportacion_fuera_de_horario",
    titulo: "Exportación de datos fuera de horario",
    severidad: "high",
    async evaluar({ auditoria }) {
      return auditoria
        .filter((a) => ["contacts_exported", "recording_access"].includes(a.action) && fueraDeHorario(a.created_at))
        .map((a) => ({ quien: a.actor, detalle: `${a.action} a las ${horaLocal(a.created_at)}h` }));
    },
  },
  {
    id: "exportaciones_masivas",
    titulo: "Muchas exportaciones en un día",
    severidad: "high",
    async evaluar({ auditoria }) {
      const exportaciones = auditoria.filter((a) => a.action === "contacts_exported");
      return rafagas(exportaciones, (a) => a.actor || "", 24 * 3600_000, 4)
        .map((r) => ({ quien: r.clave, detalle: `${r.veces} exportaciones en 24 h` }));
    },
  },
  {
    id: "permisos_en_rafaga",
    titulo: "Cambios de permisos en ráfaga",
    severidad: "medium",
    async evaluar({ auditoria }) {
      const cambios = auditoria.filter((a) => ["permissions_updated", "usuario_actualizado", "user_updated"].includes(a.action));
      return rafagas(cambios, (a) => a.actor || "", 3600_000, 5)
        .map((r) => ({ quien: r.clave, detalle: `${r.veces} cambios de permisos en una hora` }));
    },
  },
  {
    id: "lectura_probando_escritura",
    titulo: "Un usuario recibe muchos «sin permisos»",
    severidad: "high",
    async evaluar({ denegados }) {
      return rafagas(denegados, (d) => `${d.email}|${d.role}`, 3600_000, 5)
        .map((r) => {
          const [email, role] = r.clave.split("|");
          return { quien: email, detalle: `${r.veces} intentos denegados en una hora (rol ${role || "?"})` };
        });
    },
  },
];

async function ownersDe(supabase, clientId) {
  const { data } = await supabase.from("portal_users").select("email")
    .eq("client_id", clientId).eq("role", "owner").eq("is_active", true);
  return (data || []).map((u) => u.email).filter(Boolean);
}

async function avisar({ supabase, clientId, clientName, regla, hallazgos }) {
  const lineas = hallazgos.map((h) => `- ${h.quien || "?"}: ${h.detalle}`);
  const { error } = await supabase.from("alerts").insert({
    client_id: clientId, kind: `seguridad_${regla.id}`, severity: regla.severidad,
    title: regla.titulo, message: lineas.join("\n").slice(0, 2000),
  });
  if (error) logErrorSeguro("anomalias.alerta_no_guardada", error, { regla: regla.id });

  const destinatarios = await ownersDe(supabase, clientId);
  if (!destinatarios.length || !process.env.RESEND_API_KEY) return;
  try {
    await enviarCorreo({
      quienEspera: "nadie",
      to: destinatarios,
      subject: `Aviso de seguridad en ${clientName || clientId}: ${regla.titulo}`,
      text: [
        `Hemos visto en las últimas 24 horas algo que conviene que mires:`,
        "", regla.titulo, "", ...lineas, "",
        "Si lo reconoces, no hay que hacer nada. Si no, entra en el portal,",
        "revisa los usuarios y cierra sus sesiones desde Ajustes → Seguridad.",
        "", "https://www.nesped.com/portal",
      ].join("\n"),
    });
  } catch (error) {
    logErrorSeguro("anomalias.correo_fallido", error, { regla: regla.id });
  }
}

/**
 * Evalúa todas las reglas para todas las empresas sobre las últimas 24 h.
 * Nunca lanza: devuelve un resumen y deja los errores en el log.
 */
export async function evaluarAnomalias({ ahora = Date.now() } = {}) {
  const supabase = getSupabaseAdministrativo();
  const desde = new Date(ahora - 24 * 3600_000).toISOString();
  const resumen = { empresas: 0, alertas: 0, errores: 0 };

  const { data: empresas, error } = await supabase.from("clients").select("id,name").eq("is_active", true);
  if (error) {
    logErrorSeguro("anomalias.empresas_no_leidas", error);
    return { ...resumen, errores: 1 };
  }

  for (const empresa of empresas || []) {
    resumen.empresas += 1;
    try {
      const [auditoria, denegados] = await Promise.all([
        supabase.from("audit_logs").select("action,actor,created_at").eq("client_id", empresa.id).gte("created_at", desde).limit(5000),
        supabase.from("accesos_denegados").select("email,role,ruta,created_at").eq("client_id", empresa.id).gte("created_at", desde).limit(5000),
      ]);
      if (auditoria.error) throw auditoria.error;
      if (denegados.error) throw denegados.error;
      for (const regla of REGLAS) {
        const hallazgos = await regla.evaluar({ auditoria: auditoria.data || [], denegados: denegados.data || [] });
        if (!hallazgos.length) continue;
        resumen.alertas += 1;
        logEvent("warn", "anomalias.regla_disparada", { regla: regla.id, client_id: empresa.id, hallazgos: hallazgos.length });
        await avisar({ supabase, clientId: empresa.id, clientName: empresa.name, regla, hallazgos });
      }
    } catch (err) {
      resumen.errores += 1;
      logErrorSeguro("anomalias.evaluacion_fallida", err, { client_id: empresa.id });
    }
  }
  return resumen;
}

/** Cada 403 del portal deja una fila. Sin await desde quien lo llama. */
export async function anotarDenegacion({ clientId, email, role, ruta }) {
  if (!clientId || !email) return;
  const { error } = await getSupabaseAdministrativo().from("accesos_denegados")
    .insert({ client_id: clientId, email, role: role || "", ruta: String(ruta || "").slice(0, 200) });
  if (error) logErrorSeguro("anomalias.denegacion_no_anotada", error);
}

/**
 * ¿Es un país nuevo para esta cuenta? Devuelve { nuevo, conocidos }. Sin
 * cabecera de país (fuera de Vercel) no se puede saber y no se exige nada.
 */
export async function paisNuevo({ clientId, email, pais }) {
  if (!/^[A-Z]{2}$/.test(pais || "")) return { nuevo: false, conocidos: 0 };
  const { data, error } = await getSupabaseAdministrativo().from("paises_de_acceso")
    .select("pais").eq("client_id", clientId).eq("email", email);
  if (error) {
    logErrorSeguro("anomalias.paises_no_leidos", error);
    return { nuevo: false, conocidos: 0 };
  }
  const conocidos = (data || []).map((p) => p.pais);
  return { nuevo: conocidos.length > 0 && !conocidos.includes(pais), conocidos: conocidos.length };
}

export async function anotarPais({ clientId, email, pais }) {
  if (!/^[A-Z]{2}$/.test(pais || "")) return;
  const { error } = await getSupabaseAdministrativo().from("paises_de_acceso")
    .upsert({ client_id: clientId, email, pais, last_seen_at: new Date().toISOString() }, { onConflict: "client_id,email,pais" });
  if (error) logErrorSeguro("anomalias.pais_no_anotado", error);
}

export const PARA_PRUEBAS = { rafagas, HORA_INICIO, HORA_FIN };
