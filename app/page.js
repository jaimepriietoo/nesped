"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

function StatCard({ label, value, glow = "from-blue-500/20 to-white/5" }) {
  return (
    <div className={`rounded-3xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl`}>
      <div className="text-xs uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      <div className={`mt-4 h-1 rounded-full bg-gradient-to-r ${glow}`} />
    </div>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/30 backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-white/20 hover:bg-white/[0.06]">
      <div className="text-xl font-semibold text-white">{title}</div>
      <p className="mt-3 text-sm leading-7 text-white/60">{text}</p>
    </div>
  );
}

function PricingCard({
  title,
  price,
  subtitle,
  features,
  cta,
  href,
  highlighted = false,
}) {
  return (
    <div
      className={`rounded-[30px] border p-7 shadow-2xl backdrop-blur-xl transition duration-300 hover:-translate-y-1 ${
        highlighted
          ? "border-white/25 bg-white/[0.08] shadow-white/10"
          : "border-white/10 bg-white/[0.04] shadow-black/30"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xl font-semibold text-white">{title}</div>
          <div className="mt-2 text-sm text-white/55">{subtitle}</div>
        </div>
        {highlighted ? (
          <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black">
            Recomendado
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex items-end gap-2">
        <div className="text-5xl font-semibold tracking-tight text-white">
          {price}
        </div>
        <div className="pb-2 text-sm text-white/45">/ mes</div>
      </div>

      <div className="mt-6 space-y-3">
        {features.map((item) => (
          <div key={item} className="flex items-start gap-3 text-sm text-white/70">
            <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
            <span>{item}</span>
          </div>
        ))}
      </div>

      <Link
        href={href}
        className={`mt-8 inline-flex w-full items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition ${
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

export default function NespedLanding() {
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [telefonoDemo, setTelefonoDemo] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("demo");
  const [loadingCall, setLoadingCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");

  async function loadClients() {
    try {
      const res = await fetch("/api/clients", { cache: "no-store" });
      const json = await res.json();
      const data = Array.isArray(json.data) ? json.data : [];
      setClients(data);

      if (data.length > 0 && !selectedClientId) {
        setSelectedClientId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setClients([]);
    }
  }

  async function loadLeads() {
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const json = await res.json();
      setLeads(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.error(err);
      setLeads([]);
    }
  }

  async function hacerLlamada() {
    try {
      setLoadingCall(true);
      setCallStatus("");

      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          telefono: telefonoDemo,
          client_id: selectedClientId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setCallStatus(json.message || "No se pudo lanzar la llamada.");
        return;
      }

      setCallStatus("Llamada lanzada correctamente. Revisa tu móvil.");
    } catch (err) {
      console.error(err);
      setCallStatus("Error técnico al lanzar la llamada.");
    } finally {
      setLoadingCall(false);
    }
  }

  useEffect(() => {
    loadClients();
    loadLeads();
  }, []);

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalLeads = leads.length;
    const activeCities = new Set(
      leads.map((lead) => lead.ciudad || lead.city).filter(Boolean)
    ).size;

    return [
      { label: "Clientes activos", value: totalClients || "0" },
      { label: "Leads capturados", value: totalLeads || "0" },
      { label: "Ciudades activas", value: activeCities || "0" },
      { label: "Disponibilidad", value: "24/7" },
    ];
  }, [clients, leads]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) || clients[0];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-lg font-bold text-black shadow-2xl">
              N
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">NESPED</div>
              <div className="text-xs text-white/45">
                Enterprise Voice AI Platform
              </div>
            </div>
          </div>

          <nav className="hidden gap-8 text-sm text-white/65 md:flex">
            <a href="#producto" className="transition hover:text-white">
              Producto
            </a>
            <a href="#metricas" className="transition hover:text-white">
              Métricas
            </a>
            <a href="#planes" className="transition hover:text-white">
              Planes
            </a>
            <a href="#demo" className="transition hover:text-white">
              Demo
            </a>
            <a href="#faq" className="transition hover:text-white">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/pricing"
              className="hidden rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white/5 md:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/portal"
              className="rounded-2xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-white/90"
            >
              Portal clientes
            </Link>
          </div>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-7xl px-6 pb-20 pt-20 md:pb-28 md:pt-28">
          <div className="grid items-center gap-14 md:grid-cols-[1.08fr_0.92fr]">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Automatización de llamadas con IA
              </div>

              <h1 className="max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
                La capa de voz con IA que convierte llamadas en clientes.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">
                NESPED automatiza llamadas, atiende en tiempo real, capta leads,
                los organiza por cliente y da una visibilidad brutal con portales,
                métricas y control comercial centralizado.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#demo"
                  className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black shadow-2xl shadow-white/10 transition hover:bg-white/90"
                >
                  Probar llamada en vivo
                </a>

                <Link
                  href="/portal"
                  className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
                >
                  Entrar al portal
                </Link>

                <Link
                  href="/pricing"
                  className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
                >
                  Ver planes
                </Link>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4 md:grid-cols-4">
                {stats.map((item, index) => (
                  <StatCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    glow={
                      index % 2 === 0
                        ? "from-blue-500/30 to-white/5"
                        : "from-emerald-500/30 to-white/5"
                    }
                  />
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[36px] bg-gradient-to-br from-blue-500/20 to-emerald-500/10 blur-3xl" />
              <div className="relative rounded-[32px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/50 backdrop-blur-2xl">
                <div className="rounded-[28px] border border-white/10 bg-black/50 p-6">
                  <div className="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <div className="text-sm text-white/45">Vista ejecutiva</div>
                      <div className="mt-1 text-2xl font-semibold">
                        NESPED Control Layer
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
                      Online
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">Flujo</div>
                      <div className="mt-2 text-sm leading-7 text-white/70">
                        Llamada → IA en tiempo real → lead capturado → CRM →
                        dashboard privado → seguimiento comercial.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">Multi-cliente</div>
                      <div className="mt-2 text-sm leading-7 text-white/70">
                        Cada empresa tiene su propio prompt, webhook, branding,
                        usuarios, métricas y portal privado.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">Casos ideales</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          "Clínicas",
                          "Inmobiliarias",
                          "Seguros",
                          "Energía",
                          "B2B",
                          "Atención al cliente",
                        ].map((tag) => (
                          <span
                            key={tag}
                            className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">Stack</div>
                      <div className="mt-2 text-sm leading-7 text-white/70">
                        OpenAI Realtime · Twilio · Supabase · Vercel · Railway ·
                        Stripe · HubSpot · n8n
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-blue-500/10 to-emerald-500/10 p-4">
                      <div className="text-sm text-white/45">Lo que consigue</div>
                      <div className="mt-2 text-sm leading-7 text-white/80">
                        Menos llamadas perdidas, más leads cualificados y una
                        experiencia premium para tus clientes.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="producto" className="mx-auto max-w-7xl px-6 py-8 md:py-14">
          <div className="mb-8">
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Producto
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              Una plataforma de llamadas con IA pensada para impresionar
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            <FeatureCard
              title="Recepcionista IA 24/7"
              text="Atiende llamadas en tiempo real con voz natural y evita perder oportunidades por no responder."
            />
            <FeatureCard
              title="Captura y calificación"
              text="Recoge nombre, teléfono, necesidad y contexto comercial para que ventas actúe mucho más rápido."
            />
            <FeatureCard
              title="Infraestructura multi-cliente"
              text="Cada empresa opera con su propia configuración, identidad, usuarios, panel y flujo comercial."
            />
          </div>
        </section>

        <section id="metricas" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-8">
              <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                Visibilidad
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                Tu cliente ve una plataforma que lo dice absolutamente todo
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-4">
              <StatCard label="Llamadas" value="Tiempo real" />
              <StatCard label="Leads" value="Cualificados" />
              <StatCard label="Conversión" value="Por cliente" />
              <StatCard label="Actividad" value="24/7" />
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-3">
              <FeatureCard
                title="Resumen por llamada"
                text="Cada llamada puede mostrar estado, duración, lead capturado, transcripción y resumen comercial."
              />
              <FeatureCard
                title="Métricas por cliente"
                text="Conversión, llamadas totales, duración media, actividad y visión completa del rendimiento."
              />
              <FeatureCard
                title="Portal premium"
                text="Una interfaz limpia, potente y visual para que cada cliente diga: esto es serio."
              />
            </div>
          </div>
        </section>

        <section id="casos" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-8">
              <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
                Casos de uso
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                Diseñado para negocios con volumen de llamadas
              </h2>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              <FeatureCard
                title="Clínicas"
                text="Recepción de pacientes, captura de datos y gestión de solicitudes de cita o tratamiento."
              />
              <FeatureCard
                title="Inmobiliarias"
                text="Filtrado de compradores, propietarios e interesados para priorizar oportunidades reales."
              />
              <FeatureCard
                title="Empresas de servicios"
                text="Atención de incidencias, nuevos leads y pre-cualificación antes de pasar a comercial."
              />
            </div>
          </div>
        </section>

        <section id="planes" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="mb-8">
            <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
              Facturación
            </div>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
              Planes para contratar y escalar
            </h2>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <PricingCard
              title="Starter"
              price="97€"
              subtitle="Para validar el sistema"
              features={[
                "Recepción IA básica",
                "Captura de leads",
                "Dashboard inicial",
                "Soporte estándar",
              ]}
              cta="Empezar"
              href="/pricing"
            />
            <PricingCard
              title="Pro"
              price="197€"
              subtitle="La opción más sólida para vender"
              highlighted
              features={[
                "IA más avanzada",
                "Portal de cliente",
                "Métricas y resúmenes",
                "Integraciones y soporte prioritario",
              ]}
              cta="Contratar Pro"
              href="/pricing"
            />
            <PricingCard
              title="Enterprise"
              price="Custom"
              subtitle="Para despliegues potentes"
              features={[
                "Multi-cliente avanzado",
                "Personalización por empresa",
                "Automatizaciones premium",
                "Onboarding dedicado",
              ]}
              cta="Hablar con ventas"
              href="/pricing"
            />
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="rounded-[34px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="grid gap-8 md:grid-cols-[1.15fr_0.85fr] md:items-center">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                  Demo interactiva
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                  Recibe una llamada en directo.
                </h2>
                <p className="mt-4 max-w-2xl text-lg text-white/65">
                  Elige una configuración de cliente, introduce tu número y deja
                  que NESPED te muestre cómo suena una IA preparada para captar
                  oportunidades comerciales.
                </p>

                <div className="mt-6 rounded-[24px] border border-white/10 bg-black/20 p-5">
                  <div className="text-sm text-white/45">Cliente seleccionado</div>
                  <div className="mt-2 text-2xl font-semibold">
                    {selectedClient?.name || "Cargando..."}
                  </div>
                  <div className="mt-2 text-sm text-white/60">
                    {selectedClient?.tagline || "Sin descripción"}
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/40 p-6">
                <label className="mb-3 block text-sm text-white/60">Cliente</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="mb-4 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                >
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name} ({client.id})
                    </option>
                  ))}
                </select>

                <label className="mb-3 block text-sm text-white/60">
                  Teléfono para demo
                </label>

                <div className="flex flex-col gap-3">
                  <input
                    type="text"
                    placeholder="+346XXXXXXXX"
                    value={telefonoDemo}
                    onChange={(e) => setTelefonoDemo(e.target.value)}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none placeholder:text-white/25"
                  />

                  <button
                    onClick={hacerLlamada}
                    disabled={loadingCall}
                    className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                  >
                    {loadingCall ? "Lanzando..." : "Probar llamada en vivo"}
                  </button>

                  {callStatus && (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                      {callStatus}
                    </div>
                  )}
                </div>

                <div className="mt-6 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
                  Demo orientada a mostrar la experiencia real del sistema con
                  captura de lead, voz natural y flujo comercial.
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="text-sm uppercase tracking-[0.2em] text-white/45">
                Qué ve tu cliente
              </div>
              <h3 className="mt-3 text-3xl font-semibold">
                Portal privado con datos reales
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/60">
                Cada cliente dispone de su propio portal con branding, métricas,
                historial de llamadas, leads, actividad y facturación.
              </p>
              <div className="mt-6">
                <Link
                  href="/portal"
                  className="inline-flex rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
                >
                  Ver portal del cliente
                </Link>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="text-sm uppercase tracking-[0.2em] text-white/45">
                Qué controlas tú
              </div>
              <h3 className="mt-3 text-3xl font-semibold">
                Admin centralizado de toda la plataforma
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/60">
                Gestiona clientes, usuarios, prompts, webhooks, llamadas,
                facturación y configuración desde un único panel interno.
              </p>
              <div className="mt-6">
                <Link
                  href="/admin/overview"
                  className="inline-flex rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
                >
                  Ir al panel admin
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="mx-auto max-w-7xl px-6 pb-20 pt-8 md:pb-28">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-8">
              <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
                FAQ
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                Preguntas frecuentes
              </h2>
            </div>

            <div className="grid gap-4">
              {[
                {
                  q: "¿La IA habla en tiempo real?",
                  a: "Sí. La llamada se atiende en tiempo real con voz natural y flujo conversacional orientado a captación.",
                },
                {
                  q: "¿Cada empresa puede tener su propio prompt?",
                  a: "Sí. Cada cliente puede tener su propio tono, prompt, webhook, número y branding.",
                },
                {
                  q: "¿Se integra con CRM?",
                  a: "Sí. Puede enviar leads a HubSpot y a cualquier automatización compatible vía webhook.",
                },
                {
                  q: "¿Es multi-cliente?",
                  a: "Sí. La plataforma está preparada para gestionar varios clientes con panel y configuración independiente.",
                },
              ].map((item) => (
                <div
                  key={item.q}
                  className="rounded-[24px] border border-white/10 bg-black/20 p-6"
                >
                  <div className="text-lg font-semibold">{item.q}</div>
                  <p className="mt-3 text-sm leading-7 text-white/60">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}