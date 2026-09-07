import { obtenerPrecios } from "@/lib/server/precios";

/**
 * Precios públicos, leídos de Stripe.
 *
 * Existe porque la portada es un componente de cliente y no puede hablar con
 * Stripe directamente. Sin esto, los importes del bloque de planes de la
 * portada estaban escritos a mano: anunciaba 97 € y 197 € mientras /pricing
 * —que sí lee de Stripe— mostraba 75 € y 150 €. La web se contradecía sola.
 *
 * No expone nada sensible: sólo el importe y la periodicidad, que es
 * exactamente lo que se enseña en la página.
 */
export const revalidate = 300;

export async function GET() {
  try {
    const precios = await obtenerPrecios();
    return Response.json(
      { success: true, data: precios },
      {
        headers: {
          // Cinco minutos en caché, y hasta una hora sirviendo el valor
          // anterior mientras se refresca: un corte de Stripe no debe dejar
          // la portada sin precios.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
        },
      }
    );
  } catch {
    // La portada ya sabe qué hacer sin precios: enseña "Consultar".
    return Response.json({ success: true, data: {} });
  }
}
