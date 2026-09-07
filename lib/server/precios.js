import Stripe from "stripe";

/**
 * Precios reales, leídos de Stripe.
 *
 * Histórico de por qué esto es así:
 *
 * 1. Los importes estaban escritos a mano en la página mientras el cobro
 *    salía de Stripe. Las dos cifras se separaron y la web anunciaba 97 €
 *    cobrando 75 €.
 * 2. Al pasarlo a leer de Stripe, seguía habiendo un eslabón frágil: qué
 *    precio leer se decidía por variables de entorno con el ID dentro. Y esa
 *    era la causa real del desfase: había precios nuevos creados en Stripe
 *    (95 € y 197 €) mientras las variables seguían apuntando a los viejos
 *    de 75 € y 150 €. Un ID en una variable de entorno caduca en silencio.
 *
 * Ahora se busca por `lookup_key`, que es una etiqueta estable que viaja con
 * el precio. Para cambiar una tarifa se crea el precio nuevo en Stripe con
 * `transfer_lookup_key`, y la web lo coge sola. Sin tocar código ni
 * variables, y sin posibilidad de quedarse apuntando a algo archivado.
 */

/** Etiqueta estable en Stripe → plan de la web. */
const CLAVES = {
  starter: "nesped_starter",
  pro: "nesped_pro",
  premium: "nesped_premium",
  enterprise: "nesped_enterprise",
};

/**
 * Variables de entorno de respaldo, por si un plan aún no tiene lookup_key.
 * Se consultan sólo cuando la búsqueda por etiqueta no encuentra nada.
 */
const RESPALDO_ENV = {
  starter: "STRIPE_PRICE_BASIC",
  pro: "STRIPE_PRICE_PRO",
};

/*
 * Premium y Enterprise no llevan respaldo a propósito: se venden a medida,
 * con presupuesto. Si algún día se les pone tarifa pública basta con crear
 * su precio en Stripe con lookup_key `nesped_premium` o `nesped_enterprise`
 * y aparecen solos en la web, sin tocar nada de esto.
 */

const INTERVALOS = { month: "mensual", year: "anual", week: "semanal", day: "diario" };

function formatear(importe, moneda) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: (moneda || "eur").toUpperCase(),
    minimumFractionDigits: importe % 1 === 0 ? 0 : 2,
  }).format(importe);
}

function describir(p) {
  if (!p?.active || p.unit_amount == null) return null;
  return {
    id: p.id,
    precio: formatear(p.unit_amount / 100, p.currency),
    importe: p.unit_amount / 100,
    periodo: INTERVALOS[p.recurring?.interval] || "pago único",
  };
}

/**
 * Devuelve { precio, importe, periodo, id } por plan, o null si ese plan no
 * tiene tarifa publicada. Un plan sin tarifa se enseña como "Consultar" con
 * enlace a ventas, que es preferible a inventarse una cifra.
 */
export async function obtenerPrecios() {
  if (!process.env.STRIPE_SECRET_KEY) return {};

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const resultado = {};

  try {
    // Una sola llamada para todas las etiquetas, en vez de una por plan.
    const { data } = await stripe.prices.list({
      lookup_keys: Object.values(CLAVES),
      active: true,
      limit: 20,
    });

    const porClave = new Map(data.map((p) => [p.lookup_key, p]));

    for (const [plan, clave] of Object.entries(CLAVES)) {
      resultado[plan] = describir(porClave.get(clave));
    }
  } catch {
    // Una caída de Stripe no debe tumbar la página: se sigue con el respaldo.
    for (const plan of Object.keys(CLAVES)) resultado[plan] = null;
  }

  // Respaldo por variable de entorno para lo que siga sin resolver.
  for (const [plan, variable] of Object.entries(RESPALDO_ENV)) {
    if (resultado[plan]) continue;

    const id = process.env[variable];
    if (!id || id.startsWith("price_...")) continue;

    try {
      resultado[plan] = describir(await stripe.prices.retrieve(id));
    } catch {
      // Un ID archivado o inexistente deja el plan en "Consultar".
      resultado[plan] = null;
    }
  }

  return resultado;
}

/** Id del precio vigente de un plan, para montar el checkout. */
export async function idPrecioDe(plan) {
  const precios = await obtenerPrecios();
  return precios?.[plan]?.id || "";
}
