"use client";

import { useEffect, useState } from "react";

export default function NespedApp() {
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);

  const [loadingLeads, setLoadingLeads] = useState(true);
  const [loadingClients, setLoadingClients] = useState(true);

  const [errorLeads, setErrorLeads] = useState("");
  const [errorClients, setErrorClients] = useState("");

  const [telefonoDemo, setTelefonoDemo] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("demo");
  const [loadingCall, setLoadingCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");

  async function loadLeads() {
    try {
      setLoadingLeads(true);
      setErrorLeads("");

      const res = await fetch("/api/leads", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Error cargando leads");
      }

      setLeads(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.error(err);
      setErrorLeads("No se pudieron cargar los leads.");
      setLeads([]);
    } finally {
      setLoadingLeads(false);
    }
  }

  async function loadClients() {
    try {
      setLoadingClients(true);
      setErrorClients("");

      const res = await fetch("/api/clients", { cache: "no-store" });
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message || "Error cargando clientes");
      }

      const data = Array.isArray(json.data) ? json.data : [];
      setClients(data);

      if (data.length > 0 && !selectedClientId) {
        setSelectedClientId(data[0].id);
      }
    } catch (err) {
      console.error(err);
      setErrorClients("No se pudieron cargar los clientes.");
      setClients([]);
    } finally {
      setLoadingClients(false);
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
    loadLeads();
    loadClients();
  }, []);

  const totalLeads = leads.length;
  const totalClients = clients.length;
  const totalCiudades = new Set(
    leads.map((lead) => lead.ciudad || lead.city).filter(Boolean)
  ).size;
  const totalNuevos = leads.filter((lead) => {
    const estado = (lead.estado || "").toLowerCase();
    return estado.includes("nuevo") || estado === "";
  }).length;

  const stats = [
    { label: "Leads capturados", value: totalLeads || "0" },
    { label: "Clientes activos", value: totalClients || "0" },
    { label: "Ciudades activas", value: totalCiudades || "0" },
    { label: "Leads nuevos", value: totalNuevos || "0" },
  ];

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_25%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.06),transparent_35%)]" />

      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/50 backdrop-blur-xl">
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
            <a href="#clientes" className="transition hover:text-white">
              Clientes
            </a>
            <a href="#demo" className="transition hover:text-white">
              Demo
            </a>
            <a href="#dashboard" className="transition hover:text-white">
              Dashboard
            </a>
          </nav>

          <button className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black">
            Solicitar reunión
          </button>
        </div>
      </header>

      <main className="relative">
        <section className="mx-auto max-w-7xl px-6 pb-16 pt-20 md:pb-24 md:pt-28">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-white/60">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Plataforma SaaS de voz e IA
              </div>

              <h1 className="max-w-3xl text-5xl font-semibold tracking-tight md:text-7xl">
                Convierte llamadas en clientes, automáticamente.
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">
                NESPED es una plataforma multi-cliente que implanta recepcionistas
                IA para empresas, capta leads, automatiza procesos y conecta toda la
                operación comercial con CRM y automatizaciones.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <a
                  href="#demo"
                  className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-black shadow-2xl shadow-white/10 transition hover:bg-white/90"
                >
                  Probar demo
                </a>

                <a
                  href="#clientes"
                  className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
                >
                  Ver clientes
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
                      <div className="text-sm text-white/45">
                        Vista de plataforma
                      </div>
                      <div className="mt-1 text-2xl font-semibold">
                        NESPED SaaS Control
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
                      Online
                    </div>
                  </div>

                  <div className="mt-5 space-y-4">
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">
                        Arquitectura
                      </div>
                      <div className="mt-2 text-sm leading-7 text-white/70">
                        Cliente → Número de empresa → IA en tiempo real → Lead →
                        CRM → Dashboard.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">
                        Multi-cliente
                      </div>
                      <div className="mt-2 text-sm leading-7 text-white/70">
                        Cada empresa puede tener su propio prompt, webhook,
                        CRM, tono comercial y flujos.
                      </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="text-sm text-white/45">
                        Casos de uso
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {[
                          "Clínicas",
                          "Inmobiliarias",
                          "Seguros",
                          "B2B",
                          "Energía",
                          "Telecom",
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
                text: "Atiende llamadas en tiempo real con voz natural y evita que la empresa pierda oportunidades por no contestar.",
              },
              {
                title: "Lead capture engine",
                text: "Capta nombre, teléfono, necesidad y prioridad para que el equipo comercial actúe más rápido.",
              },
              {
                title: "SaaS multi-cliente",
                text: "Gestiona varias empresas desde una misma plataforma con configuraciones independientes.",
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

        <section id="clientes" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
                  Clientes
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                  Empresas activas en la plataforma
                </h2>
              </div>

              <button
                onClick={loadClients}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white hover:text-black"
              >
                Refrescar clientes
              </button>
            </div>

            {loadingClients ? (
              <div className="text-sm text-white/45">Cargando clientes...</div>
            ) : errorClients ? (
              <div className="text-sm text-red-300">{errorClients}</div>
            ) : clients.length === 0 ? (
              <div className="text-sm text-white/45">No hay clientes todavía.</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {clients.map((client) => (
                  <div
                    key={client.id}
                    className={`rounded-[26px] border p-5 transition ${
                      selectedClientId === client.id
                        ? "border-white bg-white/[0.06]"
                        : "border-white/10 bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xl font-semibold">{client.name}</div>
                        <div className="mt-1 text-sm text-white/45">
                          {client.type}
                        </div>
                      </div>

                      <div className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
                        {client.status}
                      </div>
                    </div>

                    <div className="mt-5 flex gap-3">
                      <button
                        onClick={() => setSelectedClientId(client.id)}
                        className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
                      >
                        Seleccionar
                      </button>

                      <span className="rounded-2xl bg-black/40 px-4 py-2 text-sm text-white/60">
                        ID: {client.id}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section id="demo" className="mx-auto max-w-7xl px-6 py-10 md:py-16">
          <div className="rounded-[34px] border border-white/10 bg-gradient-to-br from-white/[0.05] to-white/[0.02] p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <div className="grid gap-8 md:grid-cols-[1.2fr_0.8fr] md:items-center">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">
                  Demo interactiva
                </div>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-5xl">
                  Lanza una llamada para el cliente seleccionado.
                </h2>
                <p className="mt-4 max-w-2xl text-lg text-white/65">
                  Introduce un número, elige el cliente y deja que NESPED te enseñe
                  cómo suena una IA adaptada a cada negocio.
                </p>
              </div>

              <div className="rounded-[28px] border border-white/10 bg-black/40 p-6">
                <label className="mb-3 block text-sm text-white/60">
                  Cliente
                </label>
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

        <section id="dashboard" className="mx-auto max-w-7xl px-6 pb-16 pt-4 md:pb-24">
          <div className="rounded-[34px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
            <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
                  Dashboard
                </div>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-5xl">
                  Leads en tiempo real
                </h2>
              </div>

              <button
                onClick={loadLeads}
                className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white hover:text-black"
              >
                Refrescar leads
              </button>
            </div>

            <div className="overflow-hidden rounded-[26px] border border-white/10">
              <div className="grid grid-cols-6 bg-white/[0.04] px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/40">
                <div>Lead</div>
                <div>Teléfono</div>
                <div>Ciudad</div>
                <div>Necesidad</div>
                <div>Origen</div>
                <div>Fecha</div>
              </div>

              {loadingLeads ? (
                <div className="px-5 py-8 text-sm text-white/45">
                  Cargando leads...
                </div>
              ) : errorLeads ? (
                <div className="px-5 py-8 text-sm text-red-300">{errorLeads}</div>
              ) : leads.length === 0 ? (
                <div className="px-5 py-8 text-sm text-white/45">
                  No hay leads todavía.
                </div>
              ) : (
                leads.map((lead, index) => (
                  <div
                    key={lead.id || index}
                    className="grid grid-cols-6 items-center border-t border-white/10 px-5 py-4 text-sm"
                  >
                    <div className="font-medium">{lead.nombre || "Sin nombre"}</div>
                    <div className="text-white/70">{lead.telefono || "-"}</div>
                    <div className="text-white/60">{lead.ciudad || "-"}</div>
                    <div className="text-white/70">{lead.necesidad || "-"}</div>
                    <div className="text-white/45">{lead.origen || "-"}</div>
                    <div className="text-white/45">{lead.fecha || "-"}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}