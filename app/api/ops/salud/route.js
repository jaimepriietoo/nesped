import { getSupabase } from "@/lib/supabase";
import { requireInternalRequest } from "@/lib/server/internal-api";
import { observeRoute } from "@/lib/server/observability.mjs";
import { TABLAS_POR_EMPRESA } from "@/lib/server/datos-cliente";

/**
 * Los números que dicen cuándo hay que tirar de cada palanca.
 *
 * La hoja de ruta de la auditoría decía "particionar", "réplicas de lectura" y
 * "repartir por fragmentos" para cuando haya entre 50.000 y 200.000 empresas.
 * Eso no es un plan: es una lista de deseos con un número al lado que nadie
 * sabe medir.
 *
 * Un plan así se cumple tarde o pronto, y las dos son caras. Pronto es
 * complicar un producto de cinco clientes con particiones que no hacen nada.
 * Tarde es descubrir que hacía falta particionar el día que la tabla tiene
 * cien millones de filas y ya no se puede sin parar el servicio.
 *
 * Esta ruta mide, y cada aviso trae escrita la palanca que le corresponde. Lo
 * normal, y lo que contesta hoy, es que no haya nada que hacer.
 */

/**
 * Compara la lista de tablas de empresa del código con la de la base.
 *
 * Existe porque la lista del código se quedó vieja una vez y no avisó: había
 * cuatro tablas con client_id que no estaban en ella, y una era `users`, donde
 * viven las cuentas. Una ruta que consultara `users` sin filtrar habría
 * enseñado las cuentas de todas las empresas y la prueba de aislamiento no
 * habría dicho nada, porque esa prueba sólo mira las tablas que le declaran.
 *
 * Una lista escrita a mano se queda vieja. Lo único que se puede hacer es
 * notarlo pronto.
 */
async function desfaseDeTablas(supabase) {
  const { data, error } = await supabase.rpc("tablas_de_empresa");
  if (error) return { comprobado: false, motivo: error.message };

  const enLaBase = new Set(
    (data || []).map((f) => f.tabla).filter((t) => t !== "clients")
  );

  const sinVigilar = [...enLaBase].filter((t) => !TABLAS_POR_EMPRESA.has(t));
  const queYaNoExisten = [...TABLAS_POR_EMPRESA].filter((t) => !enLaBase.has(t));

  return {
    comprobado: true,
    enLaBase: enLaBase.size,
    enElCodigo: TABLAS_POR_EMPRESA.size,
    sinVigilar,
    queYaNoExisten,
    cuadra: sinVigilar.length === 0 && queYaNoExisten.length === 0,
  };
}

async function handleGet(req) {
  const errorInterno = requireInternalRequest(req);
  if (errorInterno) return errorInterno;

  const supabase = getSupabase();

  const [saludRes, crucesRes, desfase] = await Promise.all([
    supabase.rpc("salud_de_la_base"),
    supabase.rpc("referencias_que_cruzan_empresas"),
    desfaseDeTablas(supabase),
  ]);

  if (saludRes.error) {
    return Response.json(
      { success: false, message: saludRes.error.message || "No se pudo medir" },
      { status: 500 }
    );
  }

  const avisos = [...(saludRes.data?.avisos || [])];

  /* Un enlace que cruza empresas casi siempre quiere decir que alguien
     escribió una fila sin filtrar. Eso es una fuga, no un problema de
     escalar, y por eso el aviso va con las demás cosas urgentes. */
  if (crucesRes.data && !crucesRes.data.limpio) {
    avisos.push({
      que: "Hay filas que apuntan a datos de otra empresa",
      medido: `${crucesRes.data.cruces} de ${crucesRes.data.enlaces_mirados} enlaces`,
      palanca:
        "Mirarlo hoy. Casi siempre es una escritura que se olvidó el filtro por empresa, o sea una fuga de datos. De paso impide mover una empresa sola.",
    });
  }

  if (desfase.comprobado && !desfase.cuadra) {
    avisos.push({
      que: "La lista de tablas de empresa del código no cuadra con la base",
      medido: [
        desfase.sinVigilar.length ? `sin vigilar: ${desfase.sinVigilar.join(", ")}` : null,
        desfase.queYaNoExisten.length ? `ya no existen: ${desfase.queYaNoExisten.join(", ")}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      palanca:
        "Actualizar TABLAS_POR_EMPRESA en lib/server/datos-cliente.js. Mientras no cuadre, la prueba de aislamiento no mira esas tablas.",
    });
  }

  return Response.json({
    success: true,
    data: {
      ...saludRes.data,
      referencias_entre_empresas: crucesRes.error
        ? { comprobado: false, motivo: crucesRes.error.message }
        : crucesRes.data,
      tablas_de_empresa: desfase,
      avisos,
      hayQueHacerAlgo: avisos.length > 0,
    },
  });
}

export const GET = observeRoute("api.ops.salud.get", handleGet);
