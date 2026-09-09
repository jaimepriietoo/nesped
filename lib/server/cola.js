import { getSupabase } from "@/lib/supabase";

/**
 * La cola de trabajos: lo que no cabe en una petición.
 *
 * Hasta ahora, pedir un informe significaba que la petición se quedaba
 * esperando a que se leyera la cartera entera, se redactara el correo y el
 * proveedor lo aceptara. Si algo de eso tardaba, Vercel cortaba la función y
 * el trabajo se perdía entero: sin reintento, sin rastro, y con quien lo pidió
 * mirando un error sin saber si el correo salió.
 *
 * Aquí pedir un trabajo es escribir una fila y contestar. Quien lo ejecuta es
 * otro, por lotes y con reintentos.
 *
 * Lo que esta cola SÍ garantiza:
 *   · Un trabajo no se pierde porque se acabe el tiempo de una función.
 *   · Dos trabajadores no cogen la misma fila (lo impide la base de datos).
 *   · Un fallo se reintenta, esperando cada vez más.
 *
 * Lo que NO garantiza, y conviene tenerlo claro antes de meter aquí algo que
 * mande dinero o mensajes: un trabajo puede ejecutarse DOS VECES. Si el
 * trabajador se cae justo después de mandar el correo y antes de marcarlo
 * hecho, el rescate lo devolverá a la cola. Quien haga algo que no se pueda
 * repetir tiene que apañárselas él para que repetirlo no haga daño.
 */

/**
 * Un fallo que no se arregla esperando.
 *
 * La cola reintenta porque casi todos los fallos son pasajeros: el proveedor
 * de correo que tarda, la red que falla. Pero algunos no: una empresa que ya
 * no existe, un tipo de trabajo que nadie sabe hacer, un dato que falta.
 * Reintentar eso cinco veces no lo arregla, ocupa la cola y llena el registro
 * de errores que no significan nada.
 */
export class SinArreglo extends Error {
  constructor(mensaje) {
    super(mensaje);
    this.name = "SinArreglo";
  }
}

/** Cuántas veces se reintenta antes de darlo por perdido. */
const INTENTOS_MAXIMOS = 5;

/** Cuánto se espera tras cada fallo, en minutos. Crece a propósito. */
const ESPERA_TRAS_FALLO = [1, 5, 15, 60, 180];

/**
 * Mete un trabajo en la cola.
 *
 * @param tipo   Qué hay que hacer. Lo entiende el trabajador.
 * @param clientId  De qué empresa es. Null para trabajos de sistema.
 * @param datos  Lo que necesite el trabajo. Va tal cual a jsonb.
 * @param clave  Opcional. Con ella, encolar dos veces lo mismo no crea dos
 *   trabajos mientras el primero siga sin terminar. Es lo que evita que
 *   alguien que pulsa el botón cinco veces reciba cinco correos.
 * @param unaSolaVez  Para trabajos que deben ocurrir una vez y ya, como el
 *   mantenimiento del día. Sin esto, la clave sólo protege mientras el trabajo
 *   está pendiente o en curso: en cuanto termina, la misma clave vuelve a
 *   entrar. El mantenimiento se pedía cada cinco minutos por eso.
 */
export async function encolar({ tipo, clientId = null, datos = {}, clave = null, unaSolaVez = false }) {
  if (!tipo) throw new Error("Un trabajo necesita un tipo");

  if (unaSolaVez) {
    if (!clave) throw new Error("unaSolaVez necesita una clave");

    /* Se mira antes de insertar. No es a prueba de carreras —dos peticiones
       simultáneas podrían colarse las dos—, y no hace falta que lo sea: el
       índice único sigue tapando el caso de las que coinciden de verdad, y
       este trabajo es idempotente. Lo que se evita aquí es lo otro: pedirlo
       otra vez cinco minutos después, cuando el anterior ya terminó. */
    const { data: existente } = await getSupabase()
      .from("trabajos")
      .select("id")
      .eq("clave_unica", clave)
      .limit(1)
      .maybeSingle();

    if (existente) return { id: existente.id, yaEstaba: true };
  }

  const { data, error } = await getSupabase()
    .from("trabajos")
    .insert({ tipo, client_id: clientId, datos, clave_unica: clave })
    .select("id")
    .single();

  if (error) {
    /* 23505 es la clave única: ya había uno igual esperando. No es un fallo,
       es exactamente lo que se pidió al pasar una clave. */
    if (error.code === "23505") return { id: null, yaEstaba: true };
    throw new Error(error.message || "No se pudo encolar el trabajo");
  }

  return { id: data.id, yaEstaba: false };
}

/** Coge hasta `cuantos` trabajos. Ver tomar_trabajos() para por qué no hay carrera. */
export async function tomarTrabajos({ cuantos = 10, trabajador = "worker" } = {}) {
  const { data, error } = await getSupabase().rpc("tomar_trabajos", {
    p_cuantos: cuantos,
    p_trabajador: trabajador,
  });

  if (error) throw new Error(error.message || "No se pudieron coger trabajos");
  return data || [];
}

/** Lo da por hecho. */
export async function terminar(id) {
  await getSupabase()
    .from("trabajos")
    .update({ estado: "hecho", terminado_en: new Date().toISOString(), error: null })
    .eq("id", id);
}

/**
 * Lo devuelve a la cola con una espera, o lo abandona si ya se ha intentado
 * demasiado.
 *
 * Rendirse tras cinco intentos es a propósito. Un trabajo que falla siempre
 * —una dirección que no existe, un dato corrupto— reintentado para siempre
 * ocupa la cola y esconde a los que sí podrían salir.
 */
export async function fallar(trabajo, err) {
  const motivo = String(err?.message || err || "sin detalle").slice(0, 500);
  const intentos = Number(trabajo.intentos || 1);

  if (err instanceof SinArreglo || intentos >= INTENTOS_MAXIMOS) {
    await getSupabase()
      .from("trabajos")
      .update({ estado: "fallido", error: motivo, terminado_en: new Date().toISOString() })
      .eq("id", trabajo.id);
    return { reintenta: false };
  }

  const minutos = ESPERA_TRAS_FALLO[Math.min(intentos - 1, ESPERA_TRAS_FALLO.length - 1)];
  const cuando = new Date(Date.now() + minutos * 60_000).toISOString();

  await getSupabase()
    .from("trabajos")
    .update({ estado: "pendiente", error: motivo, no_antes_de: cuando, trabajador: null, tomado_en: null })
    .eq("id", trabajo.id);

  return { reintenta: true, enMinutos: minutos };
}

/** Devuelve a la cola los que se quedaron colgados con el trabajador muerto. */
export async function rescatarColgados(minutos = 15) {
  const { data } = await getSupabase().rpc("rescatar_trabajos_colgados", {
    p_minutos: minutos,
  });
  return Number(data || 0);
}

export const PARA_PRUEBAS = { INTENTOS_MAXIMOS, ESPERA_TRAS_FALLO };
