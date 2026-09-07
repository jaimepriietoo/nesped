import Stripe from "stripe";

/**
 * Precios reales para enseñar en la web.
 *
 * Antes estaban escritos a mano en la página de pricing mientras el cobro
 * salía de los price IDs de Stripe. Las dos cifras podían separarse sin que
 * nadie se enterase, y de hecho lo estaban: la página anunciaba 97 € y 197 €
 * cuando Stripe cobraba 75 € y 150 €. Anunciar un precio y cobrar otro no es
 * sólo perder margen, es un problema con el cliente.
 *
 * Ahora la única fuente es Stripe. Para cambiar un precio se cambia allí.
 */

const CLAVES = {
  starter: "STRIPE_PRICE_BASIC",
  pro: "STRIPE_PRICE_PRO",
  premium: "STRIPE_PRICE_PREMIUM",
  enterprise: "STRIPE_PRICE_ENTERPRISE",
};

const INTERVALOS = { month: "mensual", year: "anual", week: "semanal", day: "diario" };

function formatear(importe, moneda) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: (moneda || "eur").toUpperCase(),
    minimumFractionDigits: importe % 1 === 0 ? 0 : 2,
  }).format(importe);
}

/**
 * Devuelve { precio, periodo } por plan. Si Stripe no responde o el precio no
 * existe, devuelve null para ese plan: la página enseña entonces "Consultar"
 * y un enlace a ventas, que es preferible a enseñar una cifra inventada.
 */
export async function obtenerPrecios() {
  if (!process.env.STRIPE_SECRET_KEY) return {};

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const entradas = await Promise.all(
    Object.entries(CLAVES).map(async ([plan, clave]) => {
      const id = process.env[clave];
      if (!id || id.startsWith("price_...")) return [plan, null];

      try {
        const p = await stripe.prices.retrieve(id);
        if (!p?.active || p.unit_amount == null) return [plan, null];

        return [plan, {
          precio: formatear(p.unit_amount / 100, p.currency),
          periodo: INTERVALOS[p.recurring?.interval] || "pago único",
        }];
      } catch {
        // Un precio borrado en Stripe no debe tumbar la página de pricing.
        return [plan, null];
      }
    })
  );

  return Object.fromEntries(entradas);
}
