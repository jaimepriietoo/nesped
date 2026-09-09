import { limitesDe } from "@/lib/planes";

/**
 * Cuánto lleva consumido una empresa este mes, y si se ha pasado.
 *
 * Cada llamada cuesta dinero real: minutos de teléfono y caracteres de voz
 * sintética. Sin un tope, un solo cliente puede consumir el presupuesto de
 * todos —una centralita mal desviada, un bucle de rellamada, o sencillamente
 * un negocio que crece más de lo previsto— y con un cliente eso se ve en la
 * factura del proveedor, pero con mil no.
 *
 * La decisión que importa aquí: pasarse NO corta el servicio.
 *
 * Cortar el teléfono de una empresa por superar una cuota interna es el peor
 * momento posible para descubrir que la cuota estaba mal calculada, y el daño
 * —clientes finales que llaman y no les coge nadie— es mucho mayor que el de
 * un mes caro. Se avisa, se registra, y se decide con una persona delante.
 */

/**
 * El cálculo, sin base de datos.
 *
 * Está separado a propósito. El portal ya pide el consumo en el mismo lote de
 * consultas que todo lo demás, y volver a pedirlo desde aquí serviría para
 * hacer el doble de trabajo y, sobre todo, para tener dos sitios donde se
 * decide qué cuenta como "pasarse". Uno de los dos se habría quedado atrás.
 *
 * @param consumo Lo que devuelve la función consumo_del_mes(), o null.
 * @param plan    El plan de la empresa, tal cual está en la base de datos.
 */
export function evaluarConsumo({ consumo, plan }) {
  const limites = limitesDe(plan);

  if (!consumo) {
    /* Sin dato no se puede afirmar que alguien se ha pasado. Se devuelve
       "dentro" a propósito: acusar a un cliente de consumo excesivo porque
       una consulta falló sería peor que no avisar. */
    return { medido: false, dentro: true, cerca: false, proporcion: 0, limites };
  }

  const llamadas = Number(consumo.llamadas || 0);
  const minutos = Number(consumo.minutos || 0);

  /* Manda el que vaya más adelantado de los dos. Una empresa con llamadas
     cortísimas se pasa de llamadas sin acercarse a los minutos, y otra con
     llamadas largas al revés; mirar solo una de las dos deja fuera la mitad
     de los casos que esto viene a detectar. */
  const proporcion = Math.max(
    limites.llamadasMes ? llamadas / limites.llamadasMes : 0,
    limites.minutosMes ? minutos / limites.minutosMes : 0
  );

  return {
    medido: true,
    consumo: { llamadas, minutos, caracteresVoz: Number(consumo.caracteresVoz || 0) },
    limites,
    proporcion,
    /* Se avisa al 80% y no al 100%: enterarse cuando ya te has pasado no
       sirve para decidir nada. */
    cerca: proporcion >= 0.8 && proporcion < 1,
    dentro: proporcion < 1,
  };
}

/** El mismo cálculo, pidiendo el dato. Para quien no lo tenga ya a mano. */
export async function estadoDeCuota({ supabase, clientId, plan }) {
  const { data, error } = await supabase.rpc("consumo_del_mes", {
    p_client_id: clientId,
  });

  return evaluarConsumo({ consumo: error ? null : data, plan });
}
