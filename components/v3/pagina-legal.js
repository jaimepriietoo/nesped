import { Inter } from "next/font/google";
import "./v3.css";
import "./legal.css";
import { Footer, Header } from "./chrome";
import { datosLegalesCompletos } from "@/lib/legal";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/**
 * Envoltorio de las páginas legales.
 *
 * Una sola pieza para las cuatro: comparten cabecera, ancho de lectura y
 * tipografía, y así no se desalinean entre ellas con el tiempo.
 *
 * El aviso de "faltan datos" no es decorativo. La LSSI y el RGPD obligan a
 * identificar quién presta el servicio; mientras esos datos no estén, la
 * página lo dice en alto en vez de disimularlo. Enseñar un texto legal
 * incompleto como si estuviera terminado es peor que no tenerlo.
 */
export function PaginaLegal({ titulo, actualizado, resumen, children }) {
  const completo = datosLegalesCompletos();

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="" cta="Volver a inicio" ctaHref="/" />

      <main className="v3-section v3-legal">
        <div className="v3-wrap v3-legal-wrap">
          <span className="v3-eyebrow">Legal</span>
          <h1 className="v3-h1-page">{titulo}</h1>
          {resumen ? <p className="v3-lede">{resumen}</p> : null}
          <p className="v3-legal-fecha">Última actualización: {actualizado}</p>

          {completo ? null : (
            <div className="v3-legal-aviso" role="status">
              <strong>Documento pendiente de completar.</strong> Faltan la razón
              social, el NIF y el domicilio de la empresa. La ley obliga a
              nombrarlos, así que hasta que se rellenen este texto no está
              completo y no debe considerarse definitivo.
            </div>
          )}

          <div className="v3-legal-cuerpo">{children}</div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

/** Dato identificativo. Si falta, se ve que falta en lugar de quedar en blanco. */
export function Dato({ etiqueta, valor }) {
  return (
    <div className="v3-legal-dato">
      <dt>{etiqueta}</dt>
      <dd>{valor || <span className="v3-legal-falta">pendiente de completar</span>}</dd>
    </div>
  );
}
