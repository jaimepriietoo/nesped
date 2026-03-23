"use client";

import { useEffect, useMemo, useState } from "react";

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
    <div className="min-h-screen bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/45 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-black text-lg font-bold shadow-2xl">
              N
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">NESPED</div>
              <div className="text-xs text-white/45">Enterprise Voice AI Platform</div>
            </div>
          </div>

          <nav className="hidden gap-8 text-sm text-white/65 md:flex">
            <a href="#producto" className="transition hover:text-white">
              Producto
            </a>
            <a href="#casos" className="transition hover:text-white">
              Casos
            </a>
            <a href="#demo" className="transition hover:text-white">
              Demo
            </a>
            <a href="#faq" className="transition hover:text-white">
              FAQ
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <a
              href="/login"
              className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
            >
              Portal clientes
            </a>
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
                Una recepcionista IA que capta clientes por ti.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">
                NESPED permite a empresas automatizar llamadas, captar leads,
                responder en tiempo real y conectar toda la operación con CRM,
                flujos y dashboards privados por cliente.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#demo"
                  className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black shadow-2xl shadow-white/10 transition hover:bg-white/90"
                >
                  Probar llamada en vivo
                </a>

                <a
                  href="/login"
                  className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
                >
                  Entrar al portal
                </a>
              </div>

              <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4 md:grid-cols-4">
                {stats.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur"
                  >
                    <div className="text-xs text-white/45">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold tracking-tight">
                      {item.value}
                    </div>
                  </div>
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
                        usuarios y portal privado.
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
                        HubSpot · n8n
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="producto" className="mx-auto max-w-7xl px-6 py-8 md:py-14">
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                title: "Recepcionista IA 24/7",
                text: "Atiende llamadas en tiempo real con voz natural y evita que se pierdan oportunidades por no responder.",
              },
              {
                title: "Captura y calificación",
                text: "Recoge nombre, teléfono, necesidad y contexto comercial para que ventas actúe más rápido.",
              },
              {
                title: "Infraestructura multi-cliente",
                text: "Cada empresa opera con su propia configuración, identidad, usuarios y flujo comercial.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 shadow-lg shadow-black/30"
              >
                <div className="text-xl font-semibold">{card.title}</div>
                <p className="mt-3 text-sm leading-7 text-white/60">
                  {card.text}
                </p>
              </div>
            ))}
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
              {[
                {
                  title: "Clínicas",
                  text: "Recepción de pacientes, captura de datos y gestión de solicitudes de cita o tratamiento.",
                },
                {
                  title: "Inmobiliarias",
                  text: "Filtrado de compradores, propietarios e interesados para priorizar oportunidades reales.",
                },
                {
                  title: "Empresas de servicios",
                  text: "Atención de incidencias, nuevos leads y pre-cualificación antes de pasar a comercial.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-white/10 bg-black/20 p-6"
                >
                  <div className="text-lg font-semibold">{item.title}</div>
                  <p className="mt-3 text-sm leading-7 text-white/60">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
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
                Cada cliente dispone de su propio portal con branding,
                métricas, historial de llamadas, leads y estado de actividad.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="text-sm uppercase tracking-[0.2em] text-white/45">
                Qué controlas tú
              </div>
              <h3 className="mt-3 text-3xl font-semibold">
                Admin centralizado de toda la plataforma
              </h3>
              <p className="mt-4 text-sm leading-7 text-white/60">
                Gestiona clientes, usuarios, prompts, webhooks, llamadas y
                configuración desde un único panel interno.
              </p>
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