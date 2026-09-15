/* =========================================================================
   Los interruptores de emergencia.

   Nesped gasta dinero en cada llamada y en cada generación de texto. Los
   cortacircuitos protegen de un proveedor caído; esto protege de lo otro:
   un fallo propio, un bucle, un cliente que dispara diez mil peticiones. Para
   eso hace falta poder parar sin desplegar nada, en segundos, y desde un
   sitio que no sea el código.

   Tres interruptores de plataforma, en una fila de ajustes_plataforma:

     pausa_global     nada que cueste dinero: ni llamadas, ni IA, ni cola
     pausa_ia         ninguna generación con OpenAI
     pausa_llamadas   ninguna llamada saliente

   Y dos por empresa, en clients: ia_pausada y llamadas_pausadas.

   Se leen con una caché de treinta segundos por instancia. Es el compromiso:
   una consulta más en cada generación sería pagar el interruptor mil veces
   al día, y treinta segundos es lo que tarda en hacerse efectivo un apagado.
   En Vercel cada instancia tiene su caché, así que el peor caso son treinta
   segundos desde que se pulsa hasta que la última instancia lo ve.

   Para activarlos:  /api/admin/interruptores (POST), o directamente en SQL:
     update ajustes_plataforma set pausa_ia = true, motivo = '...';
     update clients set ia_pausada = true where id = 'empresa';
   ========================================================================= */

import { getSupabase } from "@/lib/supabase";

const CACHE_MS = 30_000;

let cachePlataforma = { leido: 0, valor: null };
const cacheEmpresas = new Map();

export class Pausado extends Error {
  constructor(que, motivo) {
    super(motivo ? `${que}: ${motivo}` : que);
    this.name = "Pausado";
    this.status = 503;
  }
}

/** Los interruptores de plataforma, con caché. */
export async function interruptoresDePlataforma({ fresco = false } = {}) {
  const ahora = Date.now();
  if (!fresco && cachePlataforma.valor && ahora - cachePlataforma.leido < CACHE_MS) {
    return cachePlataforma.valor;
  }
  const { data, error } = await getSupabase()
    .from("ajustes_plataforma")
    .select("pausa_global, pausa_ia, pausa_llamadas, motivo, updated_at, cambiado_por")
    .eq("id", "plataforma")
    .maybeSingle();

  /* Si no se puede leer, no se para nada: un interruptor que cierra por un
     fallo de lectura es un interruptor que se activa solo, y eso es peor que
     no tenerlo. El fallo se registra y se sigue con lo último conocido o con
     todo abierto. */
  if (error) {
    console.error("[interruptores] no se pudieron leer:", error.message);
    return cachePlataforma.valor || { pausa_global: false, pausa_ia: false, pausa_llamadas: false };
  }
  const valor = data || { pausa_global: false, pausa_ia: false, pausa_llamadas: false };
  cachePlataforma = { leido: ahora, valor };
  return valor;
}

/** Los interruptores de una empresa, con caché. */
export async function interruptoresDeEmpresa(clientId, { fresco = false } = {}) {
  if (!clientId) return { ia_pausada: false, llamadas_pausadas: false };
  const ahora = Date.now();
  const cacheado = cacheEmpresas.get(clientId);
  if (!fresco && cacheado && ahora - cacheado.leido < CACHE_MS) return cacheado.valor;

  const { data, error } = await getSupabase()
    .from("clients").select("ia_pausada, llamadas_pausadas").eq("id", clientId).maybeSingle();
  if (error) {
    console.error("[interruptores] no se pudieron leer los de la empresa:", error.message);
    return cacheado?.valor || { ia_pausada: false, llamadas_pausadas: false };
  }
  const valor = { ia_pausada: Boolean(data?.ia_pausada), llamadas_pausadas: Boolean(data?.llamadas_pausadas) };
  cacheEmpresas.set(clientId, { leido: ahora, valor });
  return valor;
}

/** Lanza Pausado si no se puede generar texto con IA para esta empresa. */
export async function exigirIAPermitida(clientId) {
  const p = await interruptoresDePlataforma();
  if (p.pausa_global) throw new Pausado("La plataforma está en pausa", p.motivo);
  if (p.pausa_ia) throw new Pausado("La generación con IA está en pausa", p.motivo);
  const e = await interruptoresDeEmpresa(clientId);
  if (e.ia_pausada) throw new Pausado("La IA está en pausa para esta empresa");
}

/** Lanza Pausado si no se puede hacer una llamada saliente para esta empresa. */
export async function exigirLlamadasPermitidas(clientId) {
  const p = await interruptoresDePlataforma();
  if (p.pausa_global) throw new Pausado("La plataforma está en pausa", p.motivo);
  if (p.pausa_llamadas) throw new Pausado("Las llamadas salientes están en pausa", p.motivo);
  const e = await interruptoresDeEmpresa(clientId);
  if (e.llamadas_pausadas) throw new Pausado("Las llamadas están en pausa para esta empresa");
}

/** Si la cola de trabajos debe quedarse quieta. */
export async function colaEnPausa() {
  const p = await interruptoresDePlataforma();
  return Boolean(p.pausa_global);
}

/** La respuesta HTTP que corresponde a un Pausado; null si el error es otro. */
export function respuestaSiPausado(err) {
  if (!(err instanceof Pausado)) return null;
  return Response.json({ success: false, message: err.message, pausado: true }, {
    status: 503, headers: { "Retry-After": "60", "Cache-Control": "no-store" },
  });
}

/** Cambiar los de plataforma. Sólo desde administración. */
export async function fijarInterruptoresDePlataforma(cambios, { actor = "admin" } = {}) {
  const permitidos = {};
  for (const k of ["pausa_global", "pausa_ia", "pausa_llamadas"]) {
    if (typeof cambios[k] === "boolean") permitidos[k] = cambios[k];
  }
  if (typeof cambios.motivo === "string") permitidos.motivo = cambios.motivo.slice(0, 300);
  permitidos.cambiado_por = String(actor).slice(0, 200);
  permitidos.updated_at = new Date().toISOString();
  const { data, error } = await getSupabase()
    .from("ajustes_plataforma").update(permitidos).eq("id", "plataforma")
    .select("pausa_global, pausa_ia, pausa_llamadas, motivo, updated_at, cambiado_por").single();
  if (error) throw new Error(error.message || "No se pudieron cambiar los interruptores");
  cachePlataforma = { leido: Date.now(), valor: data };
  return data;
}

/** Cambiar los de una empresa. Sólo desde administración. */
export async function fijarInterruptoresDeEmpresa(clientId, cambios) {
  const permitidos = {};
  for (const k of ["ia_pausada", "llamadas_pausadas"]) {
    if (typeof cambios[k] === "boolean") permitidos[k] = cambios[k];
  }
  if (Object.keys(permitidos).length === 0) return interruptoresDeEmpresa(clientId, { fresco: true });
  const { error } = await getSupabase().from("clients").update(permitidos).eq("id", clientId);
  if (error) throw new Error(error.message || "No se pudieron cambiar los interruptores de la empresa");
  cacheEmpresas.delete(clientId);
  return interruptoresDeEmpresa(clientId, { fresco: true });
}

export const PARA_PRUEBAS = {
  olvidarCache() { cachePlataforma = { leido: 0, valor: null }; cacheEmpresas.clear(); },
  CACHE_MS,
};
