"use client";

import { useEffect, useMemo, useState } from "react";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="text-sm text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">
        {value}
      </div>
      {subtitle ? (
        <div className="mt-2 text-sm text-white/45">{subtitle}</div>
      ) : null}
    </div>
  );
}

function PanelCard({ title, children, right }) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-white">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Badge({ children, ok = false, warn = false }) {
  let cls =
    "bg-white/8 text-white/70 border border-white/10";

  if (ok) cls = "bg-emerald-500/15 text-emerald-300 border border-emerald-500/20";
  if (warn) cls = "bg-amber-500/15 text-amber-300 border border-amber-500/20";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${cls}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatSeconds(sec) {
  const n = Number(sec || 0);
  if (!n) return "0s";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export default function ClientPortalPage() {
  const [dashboard, setDashboard] = useState(null);
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [dashboardRes, callsRes, leadsRes] = await Promise.allSettled([
          fetch("/api/admin/dashboard", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/calls", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/leads", { cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!active) return;

        const dashboardJson =
          dashboardRes.status === "fulfilled" ? dashboardRes.value : null;
        const callsJson =
          callsRes.status === "fulfilled" ? callsRes.value : null;
        const leadsJson =
          leadsRes.status === "fulfilled" ? leadsRes.value : null;

        setDashboard(dashboardJson || null);
        setCalls(Array.isArray(callsJson?.data) ? callsJson.data : []);
        setLeads(Array.isArray(leadsJson?.data) ? leadsJson.data : []);
      } catch (err) {
        if (!active) return;
        setError(err?.message || "Error cargando el portal.");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const totalCalls =
      Number(dashboard?.metrics?.totalCalls) || calls.length || 0;

    const totalLeads =
      Number(dashboard?.metrics?.totalLeads) ||
      leads.length ||
      calls.filter((c) => c.lead_captured).length ||
      0;

    const avgDuration =
      Number(dashboard?.metrics?.avgDuration) ||
      (calls.length
        ? Math.round(
            calls.reduce(
              (acc, call) => acc + Number(call.duration_seconds || 0),
              0
            ) / calls.length
          )
        : 0);

    const conversionRate =
      totalCalls > 0
        ? Number(((totalLeads / totalCalls) * 100).toFixed(1))
        : 0;

    const longestCall = calls.reduce(
      (max, call) => Math.max(max, Number(call.duration_seconds || 0)),
      0
    );

    const callsWithLead = calls.filter((c) => c.lead_captured).length;
    const callsWithoutLead = Math.max(totalCalls - callsWithLead, 0);

    return {
      totalCalls,
      totalLeads,
      avgDuration,
      conversionRate,
      longestCall,
      callsWithLead,
      callsWithoutLead,
    };
  }, [dashboard, calls, leads]);

  async function openBillingPortal() {
    try {
      setBillingLoading(true);

      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: "demo",
        }),
      });

      const json = await res.json();

      if (json?.url) {
        window.location.href = json.url;
        return;
      }

      alert(json?.message || "Stripe portal no está disponible.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir facturación.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function openCheckout(plan = "pro") {
    try {
      setBillingLoading(true);

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clientId: "demo",
          plan,
        }),
      });

      const json = await res.json();

      if (json?.url) {
        window.location.href = json.url;
        return;
      }

      alert(json?.message || "Checkout no disponible.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir checkout.");
    } finally {
      setBillingLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030303] text-white p-8">
        Cargando portal...
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 md:pb-28">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Portal del cliente
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
              Control total de llamadas, leads y rendimiento
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-white/60">
              Aquí puedes ver de forma clara qué está haciendo la IA, cuántos
              leads se están captando, cómo están funcionando las llamadas y el
              estado general del servicio.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openCheckout("pro")}
              disabled={billingLoading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
            >
              {billingLoading ? "Abriendo..." : "Contratar / ampliar plan"}
            </button>

            <button
              onClick={openBillingPortal}
              disabled={billingLoading}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-60"
            >
              Gestionar facturación
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-4 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            title="Llamadas totales"
            value={metrics.totalCalls}
            subtitle="Histórico registrado"
          />
          <StatCard
            title="Leads capturados"
            value={metrics.totalLeads}
            subtitle="Detectados por la IA"
          />
          <StatCard
            title="Conversión"
            value={`${metrics.conversionRate}%`}
            subtitle="Leads / llamadas"
          />
          <StatCard
            title="Duración media"
            value={formatSeconds(metrics.avgDuration)}
            subtitle="Tiempo medio"
          />
          <StatCard
            title="Con lead"
            value={metrics.callsWithLead}
            subtitle="Llamadas útiles"
          />
          <StatCard
            title="Más larga"
            value={formatSeconds(metrics.longestCall)}
            subtitle="Máxima duración"
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <PanelCard
              title="Últimas llamadas"
              right={<Badge ok>{calls.length} registros</Badge>}
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Lead</th>
                      <th className="pb-3 pr-4">Duración</th>
                      <th className="pb-3 pr-4">Resumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-white/40">
                          Todavía no hay llamadas registradas.
                        </td>
                      </tr>
                    ) : (
                      calls.slice(0, 20).map((call) => (
                        <tr
                          key={call.id}
                          className="border-b border-white/5 align-top"
                        >
                          <td className="py-4 pr-4 text-white/75">
                            {formatDate(call.created_at)}
                          </td>
                          <td className="py-4 pr-4">
                            <Badge ok={(call.status || "") !== "failed"}>
                              {call.status || "-"}
                            </Badge>
                          </td>
                          <td className="py-4 pr-4">
                            {call.lead_captured ? (
                              <Badge ok>Capturado</Badge>
                            ) : (
                              <Badge warn>No capturado</Badge>
                            )}
                          </td>
                          <td className="py-4 pr-4 text-white/75">
                            {formatSeconds(call.duration_seconds)}
                          </td>
                          <td className="max-w-xl py-4 pr-4 text-white/65">
                            {call.summary || "Sin resumen"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <PanelCard
              title="Leads capturados"
              right={<Badge ok>{leads.length} leads</Badge>}
            >
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Nombre</th>
                      <th className="pb-3 pr-4">Teléfono</th>
                      <th className="pb-3 pr-4">Necesidad</th>
                      <th className="pb-3 pr-4">Ciudad</th>
                      <th className="pb-3 pr-4">Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-white/40">
                          Todavía no hay leads guardados.
                        </td>
                      </tr>
                    ) : (
                      leads.slice(0, 20).map((lead) => (
                        <tr
                          key={lead.id}
                          className="border-b border-white/5 align-top"
                        >
                          <td className="py-4 pr-4 text-white/75">
                            {formatDate(lead.created_at)}
                          </td>
                          <td className="py-4 pr-4 text-white/75">
                            {lead.nombre || "-"}
                          </td>
                          <td className="py-4 pr-4 text-white/75">
                            {lead.telefono || "-"}
                          </td>
                          <td className="py-4 pr-4 text-white/65">
                            {lead.necesidad || "-"}
                          </td>
                          <td className="py-4 pr-4 text-white/65">
                            {lead.ciudad || "-"}
                          </td>
                          <td className="py-4 pr-4 text-white/65">
                            {lead.origen || "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          </div>

          <div className="space-y-6">
            <PanelCard title="Estado del servicio">
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-white/65">Recepcionista IA</span>
                  <Badge ok>Activa</Badge>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-white/65">Captura de leads</span>
                  <Badge ok>Operativa</Badge>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-white/65">Portal del cliente</span>
                  <Badge ok>Disponible</Badge>
                </div>

                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
                  <span className="text-white/65">Facturación</span>
                  <Badge ok>Integrable</Badge>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Insights rápidos">
              <div className="space-y-3 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  La IA ha captado{" "}
                  <span className="font-semibold text-white">
                    {metrics.totalLeads}
                  </span>{" "}
                  leads de{" "}
                  <span className="font-semibold text-white">
                    {metrics.totalCalls}
                  </span>{" "}
                  llamadas registradas.
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  La conversión actual es de{" "}
                  <span className="font-semibold text-white">
                    {metrics.conversionRate}%
                  </span>
                  .
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  La duración media por llamada es de{" "}
                  <span className="font-semibold text-white">
                    {formatSeconds(metrics.avgDuration)}
                  </span>
                  .
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  Tienes{" "}
                  <span className="font-semibold text-white">
                    {metrics.callsWithoutLead}
                  </span>{" "}
                  llamadas sin lead capturado, lo que puede usarse para optimizar
                  prompt, guion o timing.
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Facturación y plan">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm text-white/45">Plan actual</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    Pro
                  </div>
                  <div className="mt-2 text-sm text-white/55">
                    Acceso a captación de leads, resúmenes, métricas y portal.
                  </div>
                </div>

                <button
                  onClick={openBillingPortal}
                  disabled={billingLoading}
                  className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold transition hover:bg-white/5 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Gestionar facturación"}
                </button>

                <button
                  onClick={() => openCheckout("enterprise")}
                  disabled={billingLoading}
                  className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Ampliar a Enterprise"}
                </button>
              </div>
            </PanelCard>
          </div>
        </div>
      </main>
    </div>
  );
}