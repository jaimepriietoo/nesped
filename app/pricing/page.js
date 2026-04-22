import {
  ActionLink,
  AppBackdrop,
  GlassPanel,
  PlanCard,
  SectionHeading,
  SiteHeader,
  SurfaceCard,
} from "@/components/site-chrome";

function ComparisonRow({ title, starter, pro, enterprise }) {
  return (
    <tr>
      <td className="font-semibold text-white">{title}</td>
      <td className="text-white/70">{starter}</td>
      <td className="text-white/70">{pro}</td>
      <td className="text-white/70">{enterprise}</td>
    </tr>
  );
}

export default function PricingPage() {
  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <SiteHeader
          links={[
            { href: "/#producto", label: "Producto" },
            { href: "/#senal", label: "Senal" },
            { href: "#comparativa", label: "Comparativa" },
          ]}
          secondaryCta={{ href: "/", label: "Volver a inicio" }}
          primaryCta={{ href: "/portal", label: "Ir al portal" }}
        />

        <main className="content-frame">
          <section className="hero-block stack-24">
            <SectionHeading
              eyebrow="Pricing"
              title="Planes premium para lanzar, cobrar y escalar tu capa de voz con IA."
              description="Cada plan esta pensado para sentirse serio en la venta, suave en la operativa y coherente en la experiencia del cliente."
              align="center"
            />

            <div className="feature-grid">
              <PlanCard
                name="Starter"
                price="97 EUR"
                billing="mensual"
                subtitle="Para validar la experiencia y empezar a captar llamadas de forma profesional."
                features={[
                  "Recepcion IA basica",
                  "Captura de leads",
                  "Resumen por llamada",
                  "Panel inicial",
                ]}
                href="/api/stripe/public-checkout?plan=starter"
                cta="Empezar con Starter"
              />
              <PlanCard
                name="Pro"
                price="197 EUR"
                billing="mensual"
                subtitle="La mejor version para vender valor, cobrar y mostrar una experiencia de nivel alto."
                features={[
                  "IA mas natural",
                  "Portal premium",
                  "Metricas y resúmenes",
                  "Prioridad comercial",
                ]}
                highlighted
                href="/api/stripe/public-checkout?plan=pro"
                cta="Contratar Pro"
              />
              <PlanCard
                name="Enterprise"
                price="Custom"
                billing="segun alcance"
                subtitle="Arquitectura, branding, integraciones y despliegue pensados para multi-cliente serio."
                features={[
                  "Personalizacion avanzada",
                  "Mayor control operativo",
                  "Integraciones premium",
                  "Onboarding dedicado",
                ]}
                href="mailto:ventas@nesped.com?subject=Plan%20Enterprise%20Nesped"
                cta="Hablar con ventas"
              />
            </div>
          </section>

          <section id="comparativa" className="section-block stack-24">
            <SectionHeading
              eyebrow="Comparativa"
              title="Que incluye realmente cada plan."
              description="La diferencia no es solo el precio. Es el nivel de experiencia, visibilidad y capacidad comercial que proyectas."
            />

            <div className="premium-table">
              <table>
                <thead>
                  <tr>
                    <th>Funcion</th>
                    <th>Starter</th>
                    <th>Pro</th>
                    <th>Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  <ComparisonRow
                    title="Atencion de llamadas"
                    starter="Si"
                    pro="Si"
                    enterprise="Si"
                  />
                  <ComparisonRow
                    title="Captura de leads"
                    starter="Si"
                    pro="Si"
                    enterprise="Si"
                  />
                  <ComparisonRow
                    title="Portal de cliente"
                    starter="Esencial"
                    pro="Premium"
                    enterprise="Custom"
                  />
                  <ComparisonRow
                    title="Metricas y resúmenes"
                    starter="Base"
                    pro="Avanzado"
                    enterprise="A medida"
                  />
                  <ComparisonRow
                    title="Automatizaciones"
                    starter="Iniciales"
                    pro="Completas"
                    enterprise="Custom"
                  />
                  <ComparisonRow
                    title="Soporte"
                    starter="Estandar"
                    pro="Prioritario"
                    enterprise="Dedicado"
                  />
                </tbody>
              </table>
            </div>
          </section>

          <section className="section-block feature-grid">
            <SurfaceCard className="stack-12">
              <div className="subtle-label">Para quien</div>
              <h3 className="text-3xl font-semibold tracking-tight text-white">
                Negocios donde cada llamada puede ser una venta.
              </h3>
              <p className="support-copy">
                Clinicas, inmobiliarias, seguros, servicios y operaciones comerciales
                donde perder una llamada significa perder revenue real.
              </p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Resultado</div>
              <h3 className="text-3xl font-semibold tracking-tight text-white">
                Menos friccion, mejor percepcion, mas conversion.
              </h3>
              <p className="support-copy">
                Una experiencia limpia no solo se ve mejor: transmite confianza, orden
                y seriedad comercial en cada interaccion.
              </p>
            </SurfaceCard>

            <SurfaceCard className="stack-12">
              <div className="subtle-label">Checkout</div>
              <h3 className="text-3xl font-semibold tracking-tight text-white">
                Cobro primero, acceso despues.
              </h3>
              <p className="support-copy">
                Starter y Pro abren Stripe antes de entrar al portal. Tras pagar, el
                cliente configura su acceso y entra ya con su cuenta.
              </p>
            </SurfaceCard>
          </section>

          <section className="section-block">
            <GlassPanel className="stack-24">
              <SectionHeading
                eyebrow="Decision"
                title="Si vas a vender un SaaS premium, el pricing tambien tiene que sentirse premium."
                description="Activa el plan, vuelve al setup del cliente y deja la experiencia lista para probar sin pasos rotos ni desvio al portal antes de pagar."
              />

              <div className="flex flex-wrap gap-3">
                <ActionLink href="/api/stripe/public-checkout?plan=pro" variant="primary">
                  Ir directo a Pro
                </ActionLink>
                <ActionLink href="/portal" variant="secondary">
                  Entrar al portal
                </ActionLink>
              </div>
            </GlassPanel>
          </section>
        </main>
      </div>
    </div>
  );
}
