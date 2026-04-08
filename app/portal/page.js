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

function Badge({ children, color = "default" }) {
  const styles = {
    default: "bg-white/10 text-white/70 border border-white/10",
    green: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20",
    yellow: "bg-amber-500/20 text-amber-300 border border-amber-500/20",
    red: "bg-red-500/20 text-red-300 border border-red-500/20",
    blue: "bg-blue-500/20 text-blue-300 border border-blue-500/20",
    purple: "bg-purple-500/20 text-purple-300 border border-purple-500/20",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatDay(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function formatSeconds(sec) {
  const n = Number(sec || 0);
  if (!n) return "0s";
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  const s = n % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function getScoreColor(score) {
  const n = Number(score || 0);
  if (n >= 80) return "green";
  if (n >= 50) return "yellow";
  return "red";
}

function MiniBarChart({ title, data, color = "bg-blue-400" }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-5">
      <div className="mb-4 text-sm text-white/50">{title}</div>
      <div className="flex h-48 items-end gap-3">
        {data.map((item) => {
          const height = Math.max((item.value / max) * 100, item.value > 0 ? 8 : 2);

          return (
            <div key={item.label} className="flex flex-1 flex-col items-center gap-2">
              <div className="text-xs text-white/45">{item.value}</div>
              <div className="flex h-36 w-full items-end">
                <div
                  className={`w-full rounded-t-xl ${color}`}
                  style={{ height: `${height}%` }}
                />
              </div>
              <div className="text-[10px] text-white/35">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadDrawer({ lead, events, call, onClose }) {
  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-3xl overflow-y-auto border-l border-white/10 bg-[#060606] p-6 shadow-2xl shadow-black">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Ficha de lead
            </div>
            <h2 className="mt-2 text-3xl font-semibold text-white">
              {lead.nombre || "Lead sin nombre"}
            </h2>
            <div className="mt-2 text-sm text-white/45">
              Registrado el {formatDate(lead.created_at)}
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
          >
            Cerrar
          </button>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Badge color={getScoreColor(lead.score)}>Score {lead.score || 0}</Badge>
          <Badge color="blue">{lead.status || "new"}</Badge>
          <Badge color="purple">{lead.interes || "medio"}</Badge>
          {(lead.tags || []).map((tag, i) => (
            <Badge key={i}>{tag}</Badge>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Nombre</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.nombre || "-"}</div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Teléfono</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.telefono || "-"}</div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Ciudad</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.ciudad || "-"}</div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Fuente</div>
            <div className="mt-2 text-lg font-semibold text-white">{lead.fuente || lead.origen || "-"}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <div className="text-sm text-white/45">Necesidad</div>
          <div className="mt-2 text-base leading-7 text-white/80">{lead.necesidad || "-"}</div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Última acción</div>
            <div className="mt-2 text-white/80">{lead.ultima_accion || "-"}</div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-white/45">Próxima acción</div>
            <div className="mt-2 text-white/80">{lead.proxima_accion || "-"}</div>
          </div>
        </div>

        <div className="mt-4 rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
          <div className="text-sm text-white/45">Resumen</div>
          <div className="mt-2 text-white/80">{lead.resumen || "-"}</div>
        </div>

        <div className="mt-8">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-emerald-300">
            Timeline
          </div>

          <div className="space-y-3">
            {events.length === 0 ? (
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white/45">
                No hay eventos todavía.
              </div>
            ) : (
              events.map((e) => (
                <div key={e.id} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-xs text-white/45">{formatDate(e.created_at)}</div>
                  <div className="mt-2 text-lg font-semibold text-white">{e.title}</div>
                  <div className="mt-2 text-sm leading-7 text-white/70">{e.description || "-"}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="mt-8">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-blue-300">
            Llamada asociada
          </div>

          {call ? (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <div className="text-sm text-white/45">Fecha</div>
                    <div className="mt-2 text-white/80">{formatDate(call.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/45">Duración</div>
                    <div className="mt-2 text-white/80">{formatSeconds(call.duration_seconds)}</div>
                  </div>
                  <div>
                    <div className="text-sm text-white/45">Estado</div>
                    <div className="mt-2">
                      <Badge color="blue">{call.status || "-"}</Badge>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-sm text-white/45">Resumen corto</div>
                <div className="mt-2 text-white/80">{call.summary || "-"}</div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-sm text-white/45">Resumen largo</div>
                <div className="mt-2 text-white/70">{call.summary_long || "-"}</div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-sm text-white/45">Transcripción</div>
                <pre className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-white/70">
                  {call.transcript || "Sin transcripción"}
                </pre>
              </div>
            </div>
          ) : (
            <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 text-white/45">
              No se ha podido asociar una llamada exacta.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClientPortalPage() {
  const [dashboard, setDashboard] = useState(null);
  const [calls, setCalls] = useState([]);
  const [leads, setLeads] = useState([]);
  const [events, setEvents] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [
          dashboardRes,
          callsRes,
          leadsRes,
          alertsRes,
          insightsRes,
          benchmarksRes,
        ] = await Promise.allSettled([
          fetch("/api/admin/dashboard", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/calls", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/leads", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/alerts", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/insights", { cache: "no-store" }).then((r) => r.json()),
          fetch("/api/admin/benchmarks", { cache: "no-store" }).then((r) => r.json()),
        ]);

        if (!active) return;

        setDashboard(dashboardRes.status === "fulfilled" ? dashboardRes.value : null);
        setCalls(
          callsRes.status === "fulfilled" && Array.isArray(callsRes.value?.data)
            ? callsRes.value.data
            : []
        );
        setLeads(
          leadsRes.status === "fulfilled" && Array.isArray(leadsRes.value?.data)
            ? leadsRes.value.data
            : []
        );
        setAlerts(
          alertsRes.status === "fulfilled" && Array.isArray(alertsRes.value?.data)
            ? alertsRes.value.data
            : []
        );
        setInsights(
          insightsRes.status === "fulfilled" && Array.isArray(insightsRes.value?.data)
            ? insightsRes.value.data
            : []
        );
        setBenchmarks(
          benchmarksRes.status === "fulfilled" && Array.isArray(benchmarksRes.value?.data)
            ? benchmarksRes.value.data
            : []
        );
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

  async function openLead(lead) {
    setSelectedLead(lead);

    try {
      const res = await fetch(`/api/lead-events?lead_id=${lead.id}`, {
        cache: "no-store",
      });
      const json = await res.json();
      setEvents(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.error(err);
      setEvents([]);
    }
  }

  const metrics = useMemo(() => {
    const totalCalls =
      Number(dashboard?.metrics?.totalCalls) || calls.length || 0;

    const totalLeads =
      Number(dashboard?.metrics?.totalLeads) || leads.length || 0;

    const conversionRate =
      Number(dashboard?.metrics?.conversionRate) ||
      (totalCalls > 0 ? Number(((totalLeads / totalCalls) * 100).toFixed(1)) : 0);

    const avgDuration =
      Number(dashboard?.metrics?.avgDuration) ||
      (calls.length
        ? Math.round(
            calls.reduce((acc, call) => acc + Number(call.duration_seconds || 0), 0) /
              calls.length
          )
        : 0);

    const avgLeadScore =
      Number(dashboard?.metrics?.avgLeadScore) ||
      (leads.length
        ? Math.round(
            leads.reduce((acc, lead) => acc + Number(lead.score || 0), 0) /
              leads.length
          )
        : 0);

    const hotLeads =
      Number(dashboard?.metrics?.hotLeads) ||
      leads.filter((l) => Number(l.score || 0) >= 80).length;

    return {
      totalCalls,
      totalLeads,
      conversionRate,
      avgDuration,
      avgLeadScore,
      hotLeads,
    };
  }, [dashboard, calls, leads]);

  const chartData = useMemo(() => {
    const dayMap = new Map();

    calls.forEach((call) => {
      const day = formatDay(call.created_at);
      if (!dayMap.has(day)) {
        dayMap.set(day, { label: day, calls: 0, leads: 0 });
      }

      const item = dayMap.get(day);
      item.calls += 1;
      if (call.lead_captured) item.leads += 1;
    });

    const rows = Array.from(dayMap.values()).slice(-7);

    return {
      callsByDay: rows.map((r) => ({ label: r.label, value: r.calls })),
      leadsByDay: rows.map((r) => ({ label: r.label, value: r.leads })),
    };
  }, [calls]);

  const selectedLeadCall = useMemo(() => {
    if (!selectedLead) return null;

    return (
      calls.find((call) => {
        const sameDate =
          selectedLead.created_at &&
          call.created_at &&
          new Date(selectedLead.created_at).toDateString() ===
            new Date(call.created_at).toDateString();

        const sameName =
          selectedLead.nombre &&
          call.summary &&
          call.summary.toLowerCase().includes(String(selectedLead.nombre).toLowerCase());

        return sameDate || sameName;
      }) || null
    );
  }, [selectedLead, calls]);

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
    return <div className="min-h-screen bg-[#030303] p-8 text-white">Cargando portal...</div>;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#030303] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:36px_36px]" />

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 md:pb-28">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Portal Enterprise
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
              Inteligencia completa de llamadas, leads, actividad e insights
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-white/60">
              Una vista premium para ver rendimiento, oportunidades, alertas,
              tendencias y control total del servicio.
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
          <StatCard title="Llamadas" value={metrics.totalCalls} subtitle="Histórico total" />
          <StatCard title="Leads" value={metrics.totalLeads} subtitle="Leads capturados" />
          <StatCard title="Conversión" value={`${metrics.conversionRate}%`} subtitle="Leads / llamadas" />
          <StatCard title="Duración media" value={formatSeconds(metrics.avgDuration)} subtitle="Tiempo por llamada" />
          <StatCard title="Score medio" value={metrics.avgLeadScore} subtitle="Calidad media del lead" />
          <StatCard title="Leads calientes" value={metrics.hotLeads} subtitle="Score 80+" />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <MiniBarChart
            title="Llamadas por día"
            data={chartData.callsByDay.length ? chartData.callsByDay : [{ label: "Sin datos", value: 0 }]}
            color="bg-blue-400"
          />

          <MiniBarChart
            title="Leads por día"
            data={chartData.leadsByDay.length ? chartData.leadsByDay : [{ label: "Sin datos", value: 0 }]}
            color="bg-emerald-400"
          />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <PanelCard title="Leads capturados" right={<Badge color="green">{leads.length} leads</Badge>}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Nombre</th>
                      <th className="pb-3 pr-4">Teléfono</th>
                      <th className="pb-3 pr-4">Score</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Necesidad</th>
                      <th className="pb-3 pr-4">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-white/40">
                          Todavía no hay leads guardados.
                        </td>
                      </tr>
                    ) : (
                      leads.slice(0, 20).map((lead) => (
                        <tr key={lead.id} className="border-b border-white/5 align-top">
                          <td className="py-4 pr-4 text-white/75">{formatDate(lead.created_at)}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.nombre || "-"}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.telefono || "-"}</td>
                          <td className="py-4 pr-4">
                            <Badge color={getScoreColor(lead.score)}>Score {lead.score || 0}</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color="blue">{lead.status || "new"}</Badge>
                          </td>
                          <td className="py-4 pr-4 text-white/65">{lead.necesidad || "-"}</td>
                          <td className="py-4 pr-4">
                            <button
                              onClick={() => openLead(lead)}
                              className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                            >
                              Ver ficha
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <PanelCard title="Últimas llamadas" right={<Badge color="blue">{calls.length} registros</Badge>}>
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
                        <tr key={call.id} className="border-b border-white/5 align-top">
                          <td className="py-4 pr-4 text-white/75">{formatDate(call.created_at)}</td>
                          <td className="py-4 pr-4">
                            <Badge color={(call.status || "") === "failed" ? "red" : "blue"}>
                              {call.status || "-"}
                            </Badge>
                          </td>
                          <td className="py-4 pr-4">
                            {call.lead_captured ? (
                              <Badge color="green">Capturado</Badge>
                            ) : (
                              <Badge color="yellow">Sin lead</Badge>
                            )}
                          </td>
                          <td className="py-4 pr-4 text-white/75">{formatSeconds(call.duration_seconds)}</td>
                          <td className="max-w-xl py-4 pr-4 text-white/65">{call.summary || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>
          </div>

          <div className="space-y-6">
            <PanelCard title="Alertas" right={<Badge color="red">{alerts.length}</Badge>}>
              <div className="space-y-3">
                {alerts.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay alertas activas.
                  </div>
                ) : (
                  alerts.slice(0, 8).map((alert) => (
                    <div key={alert.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{alert.title}</div>
                        <Badge color={alert.severity === "high" ? "red" : alert.severity === "medium" ? "yellow" : "blue"}>
                          {alert.severity || "info"}
                        </Badge>
                      </div>
                      <div className="mt-2 text-sm text-white/65">{alert.message || "-"}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Insights IA" right={<Badge color="purple">{insights.length}</Badge>}>
              <div className="space-y-3">
                {insights.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Aún no hay insights generados.
                  </div>
                ) : (
                  insights.slice(0, 8).map((insight) => (
                    <div key={insight.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="font-medium text-white">{insight.title}</div>
                      <div className="mt-2 text-sm text-white/65">{insight.body}</div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Benchmark" right={<Badge color="green">{benchmarks.length}</Badge>}>
              <div className="space-y-3">
                {benchmarks.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    Todavía no hay snapshots de rendimiento.
                  </div>
                ) : (
                  benchmarks.slice(0, 6).map((item) => (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{item.period_label}</div>
                        <Badge color="blue">{item.period_type}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/70">
                        <div>Llamadas: {item.total_calls}</div>
                        <div>Leads: {item.total_leads}</div>
                        <div>Conversión: {item.conversion_rate}%</div>
                        <div>Duración media: {formatSeconds(item.avg_duration_seconds)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>
          </div>
        </div>
      </main>

      <LeadDrawer
        lead={selectedLead}
        events={events}
        call={selectedLeadCall}
        onClose={() => {
          setSelectedLead(null);
          setEvents([]);
        }}
      />
    </div>
  );
}