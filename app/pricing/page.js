import Link from "next/link";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Footer, Header } from "@/components/v3/chrome";
import { Rev } from "@/components/v3/rev";
import { obtenerPrecios } from "@/lib/server/precios";
import { FUNCIONES, ORDEN_PLANES, PLANES, funcionesDe } from "@/lib/planes";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

export const metadata = {
  title: "Planes · Nesped",
  description:
    "Growth, Intelligence y Enterprise. La diferencia no es cuántas funciones marca cada uno, es hasta dónde llega Nesped.",
};

/*
 * Cómo se cuenta cada plan.
 *
 * Los precios salen de Stripe y la lista de funciones de lib/planes.js. Aquí
 * sólo vive el relato, que es lo único que no se puede calcular: qué cambia
 * en el negocio de quien lo contrata.
 */
const RELATO = {
  growth: {
    verbo: "Ordena",
    frase: "Nesped coge el teléfono, recoge lo que entra y no deja a nadie sin respuesta.",
    para: "Para un equipo que pierde llamadas y no sabe cuántas.",
  },
  intelligence: {
    verbo: "Entiende",
    frase: "Nesped mira tus datos y te dice dónde está el dinero y qué exige atención hoy.",
    para: "Para cuando ya entra volumen y hay que decidir a quién llamar primero.",
  },
  enterprise: {
    verbo: "Actúa",
    frase: "Nesped deja de recomendar y hace el seguimiento por su cuenta, con el control que le des.",
    para: "Para operaciones donde el cuello de botella ya no es saber, es hacer.",
  },
};

/* La comparativa se genera de la definición de planes, no se escribe a mano.
   Escrita a mano se queda desfasada al primer cambio, y una tabla de precios
   que miente es peor que no tenerla. */
function filasComparativa() {
  const porPlan = Object.fromEntries(ORDEN_PLANES.map((p) => [p, new Set(funcionesDe(p))]));

  return Object.entries(FUNCIONES).map(([clave, etiqueta]) => ({
    clave,
    etiqueta,
    incluida: Object.fromEntries(ORDEN_PLANES.map((p) => [p, porPlan[p].has(clave)])),
  }));
}

export const revalidate = 300;

export default async function Pricing() {
  const precios = await obtenerPrecios();
  const filas = filasComparativa();

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="pricing" />

      <section id="planes" className="v3-section" style={{ paddingTop: "clamp(40px, 7vh, 72px)" }}>
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Planes</span>
            <h1 className="v3-h2">Ordena. Entiende.<br />O deja que trabaje por ti.</h1>
            <p className="v3-lede">
              La diferencia entre planes no es cuántas casillas marca cada uno.
              Es hasta dónde llega Nesped en tu negocio.
            </p>
          </Rev>

          <div className="v3-grid" data-c="3">
            {ORDEN_PLANES.map((id, i) => {
              const def = PLANES[id];
              const relato = RELATO[id];
              const real = precios?.[id];
              const importe = real?.precio || `${def.precio} €`;
              const porVentas = def.hablarConVentas;

              return (
                <Rev
                  as="article"
                  key={id}
                  d={i * 0.09}
                  className={`v3-card v3-plan ${def.recomendado ? "v3-plan--hi" : ""}`}
                >
                  <span className="v3-card-meta">
                    {def.recomendado ? "El que recomendamos" : "Plan"}
                  </span>
                  <h2 className="v3-h3">{def.nombre}</h2>
                  <p className="v3-plan-verbo">{relato.verbo}</p>
                  <p className="v3-p">{relato.frase}</p>

                  <div className="v3-price">
                    {def.desde ? <span className="v3-desde">desde </span> : null}
                    {importe}
                  </div>
                  <div className="v3-billing">{real?.periodo || "al mes"}</div>

                  <p className="v3-plan-para">{relato.para}</p>

                  <ul className="v3-feats">
                    {funcionesDe(id)
                      .filter((f) => (def.funciones || []).includes(f))
                      .map((f) => (
                        <li key={f}><span className="v3-tick">/</span>{FUNCIONES[f]}</li>
                      ))}
                  </ul>

                  {def.hereda ? (
                    <p className="v3-plan-hereda">
                      Y todo lo de {PLANES[def.hereda].nombre}.
                    </p>
                  ) : null}

                  <a
                    className={`v3-btn ${def.recomendado ? "v3-btn--white" : "v3-btn--dark"}`}
                    href={
                      porVentas
                        ? `mailto:ventas@nesped.com?subject=${encodeURIComponent("Nesped Enterprise")}`
                        : `/registro?plan=${id}`
                    }
                  >
                    {porVentas ? "Hablar con nosotros" : `Empezar con ${def.nombre}`}
                  </a>
                </Rev>
              );
            })}
          </div>
        </div>
      </section>

      <section className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Comparativa</span>
            <h2 className="v3-h2">Qué incluye cada uno, sin letra pequeña.</h2>
          </Rev>

          <Rev d={0.1}>
            <div className="v3-tablewrap">
              <table className="v3-table v3-tabla-planes">
                <thead>
                  <tr>
                    <th />
                    {ORDEN_PLANES.map((id) => (
                      <th key={id} data-hi={PLANES[id].recomendado ? "1" : undefined}>
                        {PLANES[id].nombre}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.clave}>
                      <td className="v3-td-feat">{f.etiqueta}</td>
                      {ORDEN_PLANES.map((id) => (
                        <td key={id} data-hi={PLANES[id].recomendado ? "1" : undefined}>
                          {f.incluida[id] ? (
                            <span className="v3-si" aria-label="incluido">/</span>
                          ) : (
                            <span className="v3-no" aria-label="no incluido">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Rev>
        </div>
      </section>

      <section className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Antes de decidir</span>
            <h2 className="v3-h2">Escúchalo antes de pagarlo.</h2>
            <p className="v3-lede">
              En la portada hay una llamada de muestra entera. Es lo que oiría
              alguien que llame a tu empresa, y se juzga mejor en treinta
              segundos que en cualquier página de precios.
            </p>
            <div className="v3-cta-row" style={{ justifyContent: "flex-start" }}>
              <Link className="v3-btn v3-btn--white" href="/#demo">Escuchar la demo</Link>
              <a className="v3-btn v3-btn--ghost" href="/portal">Entrar al portal</a>
            </div>
          </Rev>
        </div>
      </section>

      <Footer />
    </div>
  );
}
