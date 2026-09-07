export const metadata = {
  title: "Portal",
  robots: { index: false, follow: false },
};

/**
 * El portal se renderiza en cada petición, no una vez al compilar.
 *
 * Hace falta para la política de contenido: el nonce que autoriza los
 * scripts se genera por petición, y una página prerenderizada no puede
 * llevarlo. Aquí compensa de sobra —es la pantalla donde se pintan datos
 * que escriben terceros: nombres de leads, resúmenes de llamadas,
 * transcripciones— que es justo donde un XSS haría daño.
 */
export const dynamic = "force-dynamic";

export default function PortalLayout({ children }) {
  return children;
}
