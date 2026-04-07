import Link from "next/link";

function PlanCard({
  name,
  price,
  subtitle,
  features,
  cta,
  href,
  highlighted = false,
}) {
  return (
    <div
      className={`rounded-[32px] border p-8 shadow-2xl backdrop-blur-xl transition duration-300 hover:-translate-y-1 ${
        highlighted
          ? "border-white/25 bg-white/[0.08] shadow-white/10"
          : "border-white/10 bg-white/[0.04] shadow-black/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold text-white">{name}</div>
          <div className="mt-2 text-sm text-white/50">{subtitle}</div>
        </div>

        {highlighted ? (
          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">
            Recomendado
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex items-end gap-2">
        <div className="text-5xl font-semibold tracking-tight text-white">
          {price}
        </div>
        {price !== "Custom" ? (
          <div className="pb-2 text-sm text-white/45">/ mes</div>
        ) : null}
      </div>

      <div className="mt-8 space-y-4">
        {features.map((item) => (
          <div key={item} className="flex items-start gap-3 text-sm text-white/70">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className={`mt-10 inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition ${
          highlighted
            ? "bg-white text-black hover:bg-white/90"
            : "border border-white/15 text-white hover:bg-white/5"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

function FeatureRow({ title, starter, pro, enterprise }) {
  return (
    <div className="grid grid-cols-4 gap-4 border-t border-white/10 py-4 text-sm">
      <div className="text-white/80">{title}</div>
      <div className="text-white/55">{starter}</div>
      <div className="text-white/55">{pro}</div>
      <div className="text-white/55">{enterprise}</div>
    </div>
  );
}

export default function PricingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 md:pb-28 md:pt-28">
        <section className="text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Pricing
          </div>

          <h1 className="mx-auto max-w-5xl text-5xl font-semibold tracking-tight md:text-7xl">
            Planes para lanzar, vender y escalar tu asistente telefónico con IA
          </h1>

          <p className="mx-auto mt-6 max-w-3xl text-lg leading-8 text-white/65 md:text-xl">
            Elige un plan según el nivel de automatización, volumen y visibilidad
            que necesites para tu negocio o para tus clientes.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/portal"
              className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
            >
              Ir al portal
            </Link>

            <Link
              href="/"
              className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Volver a inicio
            </Link>
          </div>
        </section>

        <section className="mt-16 grid gap-6 lg:grid-cols-3">
          <PlanCard
            name="Starter"
            price="97€"
            subtitle="Para validar el sistema y empezar a captar llamadas"
            features={[
              "Recepcionista IA básica",
              "Captura de leads",
              "Resumen por llamada",
              "Panel inicial",
              "Soporte estándar",
            ]}
            cta="Empezar con Starter"
            href="/portal"
          />

          <PlanCard
            name="Pro"
            price="197€"
            subtitle="La opción más seria para vender y operar con visibilidad"
            highlighted
            features={[
              "IA más natural y avanzada",
              "Portal de cliente premium",
              "Leads, métricas y resúmenes",
              "Mejor experiencia comercial",
              "Soporte prioritario",
            ]}
            cta="Contratar Pro"
            href="/portal"
          />

          <PlanCard
            name="Enterprise"
            price="Custom"
            subtitle="Para despliegues más complejos y multi-cliente"
            features={[
              "Arquitectura avanzada",
              "Mayor personalización",
              "Integraciones premium",
              "Automatizaciones a medida",
              "Onboarding dedicado",
            ]}
            cta="Hablar con ventas"
            href="/portal"
          />
        </section>

        <section className="mt-20 rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
          <div className="mb-8">
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Comparativa
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              Qué incluye cada plan
            </h2>
          </div>

          <div className="grid grid-cols-4 gap-4 border-b border-white/10 pb-4 text-sm font-semibold text-white/80">
            <div>Función</div>
            <div>Starter</div>
            <div>Pro</div>
            <div>Enterprise</div>
          </div>

          <FeatureRow
            title="Atención de llamadas"
            starter="Sí"
            pro="Sí"
            enterprise="Sí"
          />
          <FeatureRow
            title="Captura de leads"
            starter="Sí"
            pro="Sí"
            enterprise="Sí"
          />
          <FeatureRow
            title="Panel del cliente"
            starter="Básico"
            pro="Avanzado"
            enterprise="Personalizado"
          />
          <FeatureRow
            title="Métricas y resúmenes"
            starter="Sí"
            pro="Sí"
            enterprise="Sí + custom"
          />
          <FeatureRow
            title="Integraciones"
            starter="Limitadas"
            pro="Amplias"
            enterprise="A medida"
          />
          <FeatureRow
            title="Soporte"
            starter="Estándar"
            pro="Prioritario"
            enterprise="Dedicado"
          />
        </section>

        <section className="mt-20 grid gap-6 md:grid-cols-2">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-8">
            <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
              Para quién
            </div>
            <h3 className="mt-3 text-3xl font-semibold">
              Ideal para negocios que viven de llamadas
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              Clínicas, inmobiliarias, servicios, seguros, atención comercial y
              cualquier negocio que quiera dejar de perder oportunidades por no
              contestar rápido o por no filtrar bien.
            </p>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-8">
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Resultado
            </div>
            <h3 className="mt-3 text-3xl font-semibold">
              Más leads, más visibilidad, mejor experiencia
            </h3>
            <p className="mt-4 text-sm leading-7 text-white/60">
              La idea no es solo automatizar llamadas, sino convertir la voz en
              una capa comercial real con datos, métricas, seguimiento y control.
            </p>
          </div>
        </section>

        <section className="mt-20 rounded-[34px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-8 shadow-2xl shadow-black/40">
          <div className="grid gap-8 md:grid-cols-[1.1fr_0.9fr] md:items-center">
            <div>
              <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                Siguiente paso
              </div>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                Empieza ahora y enseña algo que de verdad impresiona
              </h2>
              <p className="mt-4 max-w-2xl text-lg text-white/65">
                Si quieres venderlo como SaaS, cerrar clientes o montar una demo
                potente, el siguiente paso es activar tu portal y enseñar el
                sistema funcionando de punta a punta.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <Link
                href="/portal"
                className="inline-flex items-center justify-center rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-black hover:bg-white/90"
              >
                Entrar al portal
              </Link>

              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-2xl border border-white/15 px-6 py-4 text-sm font-semibold hover:bg-white/5"
              >
                Ver inicio
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}