"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionLink,
  AppBackdrop,
  FeatureCard,
  GlassPanel,
  MetricCard,
  PlanCard,
  SectionHeading,
  SiteHeader,
  SurfaceCard,
} from "@/components/site-chrome";

function formatCount(value) {
  return new Intl.NumberFormat("es-ES").format(Number(value || 0));
}

export default function NespedLanding() {
  const [clients, setClients] = useState([]);
  const [leads, setLeads] = useState([]);
  const [telefonoDemo, setTelefonoDemo] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [loadingCall, setLoadingCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadSnapshot() {
      try {
        const [clientsRes, leadsRes] = await Promise.all([
          fetch("/api/clients", { cache: "no-store" }),
          fetch("/api/leads", { cache: "no-store" }),
        ]);

        const [clientsJson, leadsJson] = await Promise.all([
          clientsRes.json().catch(() => ({})),
          leadsRes.json().catch(() => ({})),
        ]);

        if (cancelled) return;

        const clientRows = Array.isArray(clientsJson?.data) ? clientsJson.data : [];
        const leadRows = Array.isArray(leadsJson?.data) ? leadsJson.data : [];

        setClients(clientRows);
        setLeads(leadRows);

        if (!selectedClientId && clientRows[0]?.id) {
          setSelectedClientId(clientRows[0].id);
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setClients([]);
          setLeads([]);
        }
      }
    }

    loadSnapshot();
    return () => {
      cancelled = true;
    };
  }, [selectedClientId]);

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
          client_id: selectedClientId || clients[0]?.id || "demo",
        }),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.success) {
        setCallStatus(json.message || "No se pudo lanzar la llamada de prueba.");
        return;
      }

      setCallStatus("Llamada lanzada. Revisa tu movil para probar la experiencia real.");
    } catch (error) {
      console.error(error);
      setCallStatus("Error tecnico al lanzar la llamada.");
    } finally {
      setLoadingCall(false);
    }
  }

  const stats = useMemo(() => {
    const activeCities = new Set(
      leads.map((lead) => lead.ciudad || lead.city).filter(Boolean)
    ).size;

    return [
      {
        label: "Clientes activos",
        value: formatCount(clients.length),
        detail: "Instancias operando con configuracion propia",
      },
      {
        label: "Leads capturados",
        value: formatCount(leads.length),
        detail: "Pipeline comercial vivo y visible",
      },
      {
        label: "Ciudades activas",
        value: formatCount(activeCities),
        detail: "Cobertura comercial distribuida",
      },
      {
        label: "Disponibilidad",
        value: "24/7",
        detail: "Atencion y captacion siempre encendidas",
      },
    ];
  }, [clients, leads]);

  const selectedClient =
    clients.find((client) => client.id === selectedClientId) || clients[0] || null;

  const qualifiedLeads = leads.filter((lead) =>
    ["qualified", "won"].includes(String(lead.status || "").toLowerCase())
  ).length;

  return (
    <div className="app-shell">
      <AppBackdrop />
      <div className="page-shell">
        <SiteHeader
          links={[
            { href: "#producto", label: "Producto" },
            { href: "#senal", label: "Senal" },
            { href: "#planes", label: "Planes" },
            { href: "#demo", label: "Demo" },
          ]}
          secondaryCta={{ href: "/pricing", label: "Pricing" }}
          primaryCta={{ href: "/portal", label: "Portal clientes" }}
        />

        <main className="content-frame">
          <section className="hero-block hero-grid">
            <div className="stack-24 hero-spotlight">
              <div className="eyebrow">
                <span className="eyebrow-dot" />
                Revenue OS para voz con IA
              </div>

              <div className="stack-18">
                <h1 className="display-title">
                  Una capa de voz que suena <span className="serif">humana</span>
                  <span className="accent">y convierte mejor que un simple bot.</span>
                </h1>
                <p className="lede">
                  Nesped une llamada, captacion, seguimiento, cobro y visibilidad
                  operativa en una experiencia premium que tus clientes sienten como
                  producto serio desde el primer segundo.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <ActionLink href="#demo" variant="primary">
                  Probar llamada real
                </ActionLink>
                <ActionLink href="/pricing" variant="secondary">
                  Ver planes y checkout
                </ActionLink>
              </div>

              <div className="section-grid md:grid-cols-2">
                {stats.map((item) => (
                  <MetricCard
                    key={item.label}
                    label={item.label}
                    value={item.value}
                    detail={item.detail}
                  />
                ))}
              </div>
            </div>

            <GlassPanel className="stack-24">
              <div className="stack-12">
                <div className="subtle-label">Vista ejecutiva</div>
                <div className="section-title" style={{ fontSize: "2.3rem" }}>
                  Control premium para cada cliente.
                </div>
                <p className="support-copy">
                  Branding propio, llamadas en tiempo real, seguimiento por lead,
                  automatizaciones y cobro en una sola experiencia.
                </p>
              </div>

              <div className="section-grid">
                <SurfaceCard className="stack-12">
                  <div className="subtle-label">Flujo</div>
                  <div className="text-2xl font-semibold tracking-tight text-white">
                    Llamada → IA → lead → CRM → cobro → portal
                  </div>
                  <p className="support-copy">
                    Cada etapa queda conectada con memoria comercial, acciones
                    recomendadas y visibilidad real para tu cliente final.
                  </p>
                </SurfaceCard>

                <SurfaceCard className="stack-12">
                  <div className="subtle-label">Senal comercial</div>
                  <div className="flex flex-wrap gap-3">
                    <span className="data-chip">Leads cualificados: {formatCount(qualifiedLeads)}</span>
                    <span className="data-chip">Portal privado por cliente</span>
                    <span className="data-chip">Cobro y seguimiento integrados</span>
                  </div>
                </SurfaceCard>

                <SurfaceCard className="stack-12">
                  <div className="subtle-label">Casos ideales</div>
                  <div className="flex flex-wrap gap-3">
                    {[
                      "Clinicas",
                      "Inmobiliarias",
                      "Seguros",
                      "Servicios",
                      "Despachos",
                      "Ventas consultivas",
                    ].map((item) => (
                      <span key={item} className="data-chip">
                        {item}
                      </span>
                    ))}
                  </div>
                </SurfaceCard>
              </div>
            </GlassPanel>
          </section>

          <section id="producto" className="section-block stack-24">
            <SectionHeading
              eyebrow="Producto"
              title="Una experiencia que vende mejor porque parece producto de verdad."
              description="No es una demo bonita encima de automatizaciones sueltas. Es una capa coherente de voz, CRM, seguimiento y revenue pensada para que el cliente note orden, control y calidad."
            />

            <div className="feature-grid">
              <FeatureCard
                meta="Conversacion"
                title="Voz natural con memoria comercial"
                text="La llamada no se queda en un audio sin contexto. Se convierte en lead util, resumen accionable y siguiente paso recomendado."
              />
              <FeatureCard
                meta="Visibilidad"
                title="Portal premium por cliente"
                text="Metricas, pipeline, historial, automations y facturacion presentados con el nivel visual que esperas de un SaaS serio."
              />
              <FeatureCard
                meta="Operacion"
                title="Una sola capa para captacion y cierre"
                text="WhatsApp, seguimiento, scoring, next-best-action y cobro viven dentro del mismo sistema, no repartidos en parches."
              />
            </div>
          </section>

          <section id="senal" className="section-block stack-24">
            <SectionHeading
              eyebrow="Senal"
              title="Indicadores que un cliente entiende al instante."
              description="El producto transmite control porque cada numero tiene contexto, cada lead tiene estado y cada accion deja una huella visible."
            />

            <div className="feature-grid">
              <SurfaceCard className="stack-12">
                <div className="subtle-label">Captacion</div>
                <div className="text-3xl font-semibold tracking-tight text-white">
                  {formatCount(leads.length)} leads visibles
                </div>
                <p className="support-copy">
                  Pipeline vivo con estado, responsable, valor estimado y memoria IA.
                </p>
              </SurfaceCard>
              <SurfaceCard className="stack-12">
                <div className="subtle-label">Orquestacion</div>
                <div className="text-3xl font-semibold tracking-tight text-white">
                  Seguimiento multicanal
                </div>
                <p className="support-copy">
                  SMS, WhatsApp, llamadas y recomendaciones de siguiente accion dentro del mismo panel.
                </p>
              </SurfaceCard>
              <SurfaceCard className="stack-12">
                <div className="subtle-label">Revenue</div>
                <div className="text-3xl font-semibold tracking-tight text-white">
                  Checkout y portal de billing
                </div>
                <p className="support-copy">
                  Cobro directo, plan activo y configuracion del acceso del cliente tras el pago.
                </p>
              </SurfaceCard>
            </div>
          </section>

          <section id="planes" className="section-block stack-24">
            <SectionHeading
              eyebrow="Planes"
              title="Planes listos para vender, cobrar y escalar."
              description="Pensados para que puedas activar desde la web publica o desde el portal sin romper el flujo comercial."
            />

            <div className="feature-grid">
              <PlanCard
                name="Starter"
                price="97 EUR"
                billing="mensual"
                subtitle="Entrada rapida para validar experiencia y captacion."
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
                subtitle="La version mas seria para mostrar valor y cerrar clientes."
                highlighted
                features={[
                  "Voz mas natural",
                  "Portal premium",
                  "Metricas y resúmenes",
                  "Soporte prioritario",
                ]}
                href="/api/stripe/public-checkout?plan=pro"
                cta="Contratar Pro"
              />
              <PlanCard
                name="Enterprise"
                price="Custom"
                billing="arquitectura a medida"
                subtitle="Despliegues multi-cliente, integraciones y rollouts premium."
                features={[
                  "Branding avanzado",
                  "Automatizaciones custom",
                  "Mayor control operativo",
                  "Onboarding dedicado",
                ]}
                href="mailto:ventas@nesped.com?subject=Plan%20Enterprise%20Nesped"
                cta="Hablar con ventas"
              />
            </div>
          </section>

          <section id="demo" className="section-block">
            <GlassPanel className="stack-24">
              <SectionHeading
                eyebrow="Demo real"
                title="Lanza una llamada y escucha la experiencia completa."
                description="Selecciona un cliente, introduce tu telefono y prueba la voz, el tono y el flujo de captura de lead tal y como los percibira un usuario real."
              />

              <div className="hero-grid">
                <SurfaceCard className="stack-18">
                  <div className="subtle-label">Cliente activo</div>
                  <div className="text-3xl font-semibold tracking-tight text-white">
                    {selectedClient?.name || "Cargando cliente"}
                  </div>
                  <p className="support-copy">
                    {selectedClient?.tagline ||
                      "Usa esta demo para escuchar una conversacion de voz con tono comercial y memoria de lead."}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <span className="data-chip">Instancia: {selectedClient?.id || "demo"}</span>
                    <span className="data-chip">Twilio listo</span>
                    <span className="data-chip">Realtime IA</span>
                  </div>
                </SurfaceCard>

                <SurfaceCard className="stack-18">
                  <div className="stack-12">
                    <label className="subtle-label">Cliente</label>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="premium-select"
                    >
                      {clients.length === 0 ? (
                        <option value="demo">demo</option>
                      ) : (
                        clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.name} ({client.id})
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="stack-12">
                    <label className="subtle-label">Telefono para demo</label>
                    <input
                      type="text"
                      placeholder="+346XXXXXXXX"
                      value={telefonoDemo}
                      onChange={(e) => setTelefonoDemo(e.target.value)}
                      className="premium-input"
                    />
                  </div>

                  <button
                    onClick={hacerLlamada}
                    disabled={loadingCall}
                    className="button-primary"
                    type="button"
                  >
                    {loadingCall ? "Lanzando llamada..." : "Probar llamada en vivo"}
                  </button>

                  {callStatus ? (
                    <div className="status-pill info" style={{ borderRadius: "20px", padding: "0.95rem 1rem" }}>
                      {callStatus}
                    </div>
                  ) : (
                    <div className="support-copy">
                      La demo reproduce una llamada real con voz, deteccion de necesidad y captura del lead.
                    </div>
                  )}

                  <div className="support-copy" style={{ fontSize: "0.88rem" }}>
                    Al lanzar la demo aceptas que la llamada pueda ser grabada y transcrita con fines de calidad, seguridad y seguimiento comercial.{" "}
                    <a href="/legal/voice-compliance" className="text-white underline underline-offset-4">
                      Ver política de grabaciones
                    </a>
                  </div>
                </SurfaceCard>
              </div>
            </GlassPanel>
          </section>

          <section className="section-block">
            <GlassPanel className="stack-24">
              <SectionHeading
                eyebrow="Siguiente paso"
                title="Si quieres venderlo como producto serio, ensenalo como producto serio."
                description="El mejor argumento comercial no es explicarlo. Es abrir la plataforma, cobrar un plan y dejar al cliente viendo una experiencia impecable de punta a punta."
              />

              <div className="flex flex-wrap gap-3">
                <ActionLink href="/pricing" variant="primary">
                  Ir a pricing
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
