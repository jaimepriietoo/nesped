import Link from "next/link";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Footer, Header } from "@/components/v3/chrome";
import { Rev } from "@/components/v3/rev";
import { obtenerPrecios } from "@/lib/server/precios";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/**
 * Los importes NO están aquí: se leen de Stripe en cada carga, que es lo
 * único que se cobra de verdad. Aquí queda sólo lo que Stripe no sabe.
 */
const PLANES = [
  {
    name: "Starter",
    plan: "starter",
    sub: "Entrada rápida para validar experiencia y captación.",
    feats: ["Recepción IA básica", "Captura de leads", "Resumen por llamada", "Panel inicial"],
    hi: false,
  },
  {
    name: "Pro",
    plan: "pro",
    sub: "La versión más seria para mostrar valor y cerrar clientes.",
    feats: ["Voz más natural", "Portal premium", "Métricas y resúmenes", "Soporte prioritario"],
    hi: true,
  },
  {
    name: "Enterprise",
    plan: "enterprise",
    sub: "Despliegues multi-cliente, integraciones y rollouts premium.",
    feats: ["Branding avanzado", "Automatizaciones custom", "Mayor control operativo", "Onboarding dedicado"],
    hi: false,
  },
];

const COMPARATIVA = [
  { f: "Atención de llamadas", s: "Básica", p: "Voz natural", e: "A medida" },
  { f: "Captura de leads", s: "Sí", p: "Con scoring", e: "Con reglas propias" },
  { f: "Portal de cliente", s: "Inicial", p: "Premium", e: "Marca blanca" },
  { f: "Métricas y resúmenes", s: "Por llamada", p: "Completas", e: "Completas + export" },
  { f: "Automatizaciones", s: "—", p: "Estándar", e: "Custom" },
  { f: "Soporte", s: "Email", p: "Prioritario", e: "Dedicado" },
];

/*
 * Los precios se guardan en caché cinco minutos.
 *
 * Sin caché la página llamaba a Stripe en cada visita: el visitante pagaba
 * esa latencia y una caída de Stripe se llevaba por delante la página de
 * precios. Cinco minutos es margen de sobra para que un cambio de tarifa se
 * vea enseguida sin convertir cada carga en una llamada a un tercero.
 */
export const revalidate = 300;

export default async function Pricing() {
  const precios = await obtenerPrecios();

  const planes = PLANES.map((p) => {
    const real = precios[p.plan];
    return {
      ...p,
      // Sin precio en Stripe se pasa a contacto: mejor eso que una cifra falsa.
      price: real?.precio || "Consultar",
      billing: real?.periodo || "según alcance",
      href: real
        ? `/api/stripe/public-checkout?plan=${p.plan}`
        : `mailto:ventas@nesped.com?subject=${encodeURIComponent(`Plan ${p.name} de Nesped`)}`,
      cta: real ? `Contratar ${p.name}` : "Hablar con ventas",
    };
  });

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo="pricing" />

      <section className="v3-section" style={{ paddingTop: "clamp(40px, 7vh, 72px)" }}>
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Pricing</span>
            <h1 className="v3-h2">Planes listos para vender, cobrar y escalar.</h1>
            <p className="v3-lede">
              Pensados para que puedas activar desde la web pública o desde el
              portal sin romper el flujo comercial.
            </p>
          </Rev>

          <div className="v3-grid" data-c="3">
            {planes.map((p, i) => (
              <Rev as="article" key={p.name} d={i * 0.09} className={`v3-card v3-plan ${p.hi ? "v3-plan--hi" : ""}`}>
                <span className="v3-card-meta">{p.hi ? "Recomendado" : "Plan"}</span>
                <h2 className="v3-h3">{p.name}</h2>
                <p className="v3-p">{p.sub}</p>
                <div className="v3-price">{p.price}</div>
                <div className="v3-billing">{p.billing}</div>
                <ul className="v3-feats">
                  {p.feats.map((f) => (
                    <li key={f}><span className="v3-tick">/</span>{f}</li>
                  ))}
                </ul>
                <a className={`v3-btn ${p.hi ? "v3-btn--white" : "v3-btn--dark"}`} href={p.href}>
                  {p.cta}
                </a>
              </Rev>
            ))}
          </div>
        </div>
      </section>

      <section className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Comparativa</span>
            <h2 className="v3-h2">Qué incluye realmente cada plan.</h2>
          </Rev>

          <Rev d={0.1}>
            <div className="v3-tablewrap">
              <table className="v3-table">
                <thead>
                  <tr>
                    <th />
                    <th>Starter</th>
                    <th>Pro</th>
                    <th>Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARATIVA.map((r) => (
                    <tr key={r.f}>
                      <td className="v3-td-feat">{r.f}</td>
                      <td>{r.s}</td>
                      <td>{r.p}</td>
                      <td>{r.e}</td>
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
            <span className="v3-eyebrow">Decisión</span>
            <h2 className="v3-h2">Si quieres venderlo como producto serio, enséñalo como producto serio.</h2>
            <p className="v3-lede">
              El mejor argumento comercial no es explicarlo: es abrir la
              plataforma, cobrar un plan y dejar al cliente viendo una
              experiencia impecable de punta a punta.
            </p>
            <div className="v3-cta-row" style={{ justifyContent: "flex-start" }}>
              <Link className="v3-btn v3-btn--white" href="/#demo">Probar la demo</Link>
              <a className="v3-btn v3-btn--ghost" href="/portal">Entrar al portal</a>
            </div>
          </Rev>
        </div>
      </section>

      <Footer />
    </div>
  );
}
