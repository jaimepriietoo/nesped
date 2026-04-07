"use client";

import { useEffect, useMemo, useState } from "react";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-sm">
      <div className="text-sm text-zinc-400">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
      {subtitle ? <div className="mt-1 text-sm text-zinc-500">{subtitle}</div> : null}
    </div>
  );
}

function SectionCard({ title, right, children }) {
  return (
    <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

function Badge({ ok, children }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        ok ? "bg-emerald-500/15 text-emerald-300" : "bg-zinc-700 text-zinc-300"
      }`}
    >
      {children}
    </span>
  );
}

function formatSeconds(sec) {
  const n = Number(sec || 0);
  if (!n) return "0s";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  return d.toLocaleString();
}

function getPhone(text = "") {
  const match = String(text).match(/(\+?\d[\d\s-]{7,}\d)/);
  return match ? match[1] : "-";
}

function getLeadName(summary = "") {
  const match = String(summary).match(/Lead capturado:\s*([^·]+)/i);
  return match ? match[1].trim() : "-";
}

function getNeed(summary = "") {
  const match = String(summary).match(/·\s*(.+)$/);
  return match ? match[1].trim() : "-";
}

export default function ClientPortalDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        setLoading(true);
        setError("");

        const [dashboardRes, callsRes, leadsRes] = await Promise.allSettled([
          fetch("/api/admin/dashboard", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/calls", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/leads", { cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!alive) return;

        const dashboardJson = dashboardRes.status === "fulfilled" ? dashboardRes.value : null;
        const callsJson = callsRes.status === "fulfilled" ? callsRes.value : null;
        const leadsJson = leadsRes.status === "fulfilled" ? leadsRes.value : null;

        setDashboard(dashboardJson);
        setCalls(Array.isArray(callsJson?.data) ? callsJson.data : dashboardJson?.recentCalls || []);
        setLeads(Array.isArray(leadsJson?.data) ? leadsJson.data : []);
      } catch (err) {
        if (!alive) return;
        setError(err?.message || "Error cargando el panel");
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();
    return () => {
      alive = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const recentCalls = Array.isArray(calls) ? calls : [];
    const totalCalls = Number(dashboard?.metrics?.totalCalls || recentCalls.length || 0);
    const totalLeads = Number(
      dashboard?.metrics?.totalLeads || leads.length || recentCalls.filter((c) => c.lead_captured).length || 0
    );
    const conversionRate = totalCalls > 0 ? ((totalLeads / totalCalls) * 100).toFixed(1) : "0.0";
    const avgDuration = totalCalls > 0
      ? Math.round(
          recentCalls.reduce((acc, c) => acc + Number(c.duration_seconds || 0), 0) / Math.max(recentCalls.length || 1, 1)
        )
      : Number(dashboard?.metrics?.avgDuration || 0);

    const answeredCalls = recentCalls.filter((c) => (c.status || "") !== "failed").length;
    const missedCalls = Math.max(totalCalls - answeredCalls, 0);
    const longestCall = recentCalls.reduce((max, c) => Math.max(max, Number(c.duration_seconds || 0)), 0);

    return {
      totalCalls,
      totalLeads,
      conversionRate,
      avgDuration,
      answeredCalls,
      missedCalls,
      longestCall,
    };
  }, [dashboard, calls, leads]);

  const enrichedLeads = useMemo(() => {
    if (leads.length > 0) return leads;
    return calls
      .filter((c) => c.lead_captured)
      .map((c) => ({
        id: c.id,
        created_at: c.created_at,
        nombre: getLeadName(c.summary),
        telefono: getPhone(c.transcript || ""),
        necesidad: getNeed(c.summary),
        ciudad: "-",
        origen: "llamada",
      }));
  }, [calls, leads]);

  async function goToBillingPortal() {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "demo" }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      alert(json?.message || "El portal de facturación todavía no está activo.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir facturación.");
    } finally {
      setBillingLoading(false);
    }
  }

  async function startCheckout(plan = "pro") {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: "demo", plan }),
      });
      const json = await res.json();
      if (json?.url) {
        window.location.href = json.url;
        return;
      }
      alert(json?.message || "El checkout todavía no está activo.");
    } catch (err) {
      alert(err?.message || "No se pudo abrir el checkout.");
    } finally {
      setBillingLoading(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-black p-8 text-white">Cargando panel del cliente...</div>;
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl p-6 md:p-8">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm text-zinc-400">Portal del cliente</div>
            <h1 className="text-3xl font-bold tracking-tight">Resumen completo de llamadas, leads y facturación</h1>
            <p className="mt-2 max-w-3xl text-zinc-400">
              Aquí puedes ver qué está pasando con tus llamadas, qué leads está captando la IA y el estado general del servicio.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => startCheckout("pro")}
              disabled={billingLoading}
              className="rounded-2xl bg-white px-4 py-2.5 text-sm font-medium text-black transition hover:opacity-90 disabled:opacity-60"
            >
              {billingLoading ? "Abriendo..." : "Contratar / ampliar plan"}
            </button>
            <button
              onClick={goToBillingPortal}
              disabled={billingLoading}
              className="rounded-2xl border border-zinc-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-900 disabled:opacity-60"
            >
              Gestionar facturación
            </button>
          </div>
        </div>

        {error ? (
          <div className="mb-6 rounded-2xl border border-red-900 bg-red-950/40 p-4 text-red-200">{error}</div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 mb-8">
          <StatCard title="Llamadas totales" value={metrics.totalCalls} subtitle="Histórico disponible" />
          <StatCard title="Leads capturados" value={metrics.totalLeads} subtitle="Leads detectados por la IA" />
          <StatCard title="Conversión" value={`${metrics.conversionRate}%`} subtitle="Leads / llamadas" />
          <StatCard title="Duración media" value={formatSeconds(metrics.avgDuration)} subtitle="Tiempo por llamada" />
          <StatCard title="Llamadas atendidas" value={metrics.answeredCalls} subtitle="No fallidas" />
          <StatCard title="Llamada más larga" value={formatSeconds(metrics.longestCall)} subtitle="Mayor duración registrada" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-6">
            <SectionCard title="Últimas llamadas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-zinc-400">
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
                        <td colSpan={5} className="py-6 text-zinc-500">Aún no hay llamadas registradas.</td>
                      </tr>
                    ) : (
                      calls.slice(0, 15).map((call) => (
                        <tr key={call.id} className="border-b border-zinc-900 align-top">
                          <td className="py-3 pr-4 text-zinc-300">{formatDate(call.created_at)}</td>
                          <td className="py-3 pr-4"><Badge ok={(call.status || "") !== "failed"}>{call.status || "-"}</Badge></td>
                          <td className="py-3 pr-4">
                            {call.lead_captured ? <Badge ok>Capturado</Badge> : <Badge>No</Badge>}
                          </td>
                          <td className="py-3 pr-4 text-zinc-300">{formatSeconds(call.duration_seconds)}</td>
                          <td className="py-3 pr-4 max-w-xl text-zinc-300">{call.summary || "Sin resumen"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>

            <SectionCard title="Leads del cliente" right={<div className="text-sm text-zinc-400">{enrichedLeads.length} registros</div>}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-zinc-400">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Nombre</th>
                      <th className="pb-3 pr-4">Teléfono</th>
                      <th className="pb-3 pr-4">Necesidad</th>
                      <th className="pb-3 pr-4">Ciudad</th>
                      <th className="pb-3 pr-4">Origen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrichedLeads.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-zinc-500">Todavía no hay leads guardados.</td>
                      </tr>
                    ) : (
                      enrichedLeads.slice(0, 20).map((lead) => (
                        <tr key={lead.id} className="border-b border-zinc-900 align-top">
                          <td className="py-3 pr-4 text-zinc-300">{formatDate(lead.created_at)}</td>
                          <td className="py-3 pr-4 text-zinc-300">{lead.nombre || "-"}</td>
                          <td className="py-3 pr-4 text-zinc-300">{lead.telefono || "-"}</td>
                          <td className="py-3 pr-4 text-zinc-300">{lead.necesidad || "-"}</td>
                          <td className="py-3 pr-4 text-zinc-300">{lead.ciudad || "-"}</td>
                          <td className="py-3 pr-4 text-zinc-300">{lead.origen || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard title="Estado del servicio">
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3">
                  <span>IA activa</span>
                  <Badge ok>Sí</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3">
                  <span>Captura de leads</span>
                  <Badge ok>Sí</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3">
                  <span>Facturación</span>
                  <Badge ok>Disponible</Badge>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3">
                  <span>Llamadas sin lead</span>
                  <span className="text-zinc-400">{metrics.totalCalls - metrics.totalLeads}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-zinc-950 px-4 py-3">
                  <span>Llamadas perdidas / fallidas</span>
                  <span className="text-zinc-400">{metrics.missedCalls}</span>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Facturación y plan actual">
              <div className="space-y-4 text-sm text-zinc-300">
                <div className="rounded-xl bg-zinc-950 p-4">
                  <div className="text-zinc-400">Plan</div>
                  <div className="mt-1 text-lg font-semibold text-white">Pro</div>
                  <div className="mt-1 text-zinc-500">Puedes cambiarlo o gestionarlo desde aquí.</div>
                </div>
                <button
                  onClick={goToBillingPortal}
                  disabled={billingLoading}
                  className="w-full rounded-2xl border border-zinc-700 px-4 py-3 font-medium hover:bg-zinc-950 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Abrir portal de facturación"}
                </button>
                <button
                  onClick={() => startCheckout("enterprise")}
                  disabled={billingLoading}
                  className="w-full rounded-2xl bg-white px-4 py-3 font-medium text-black hover:opacity-90 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Mejorar a Enterprise"}
                </button>
              </div>
            </SectionCard>

            <SectionCard title="Insights rápidos">
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="rounded-xl bg-zinc-950 p-4">
                  La IA está captando <span className="font-semibold text-white">{metrics.totalLeads}</span> leads de <span className="font-semibold text-white">{metrics.totalCalls}</span> llamadas.
                </div>
                <div className="rounded-xl bg-zinc-950 p-4">
                  La conversión actual es de <span className="font-semibold text-white">{metrics.conversionRate}%</span>.
                </div>
                <div className="rounded-xl bg-zinc-950 p-4">
                  La duración media por llamada es de <span className="font-semibold text-white">{formatSeconds(metrics.avgDuration)}</span>.
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
