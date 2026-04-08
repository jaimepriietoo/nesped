"use client";

import { useEffect, useMemo, useState } from "react";

function StatCard({ title, value, subtitle }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="text-sm text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</div>
      {subtitle ? <div className="mt-2 text-sm text-white/45">{subtitle}</div> : null}
    </div>
  );
}

function PanelCard({ title, children, right }) {
  return (
    <div className="rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight text-white">{title}</h2>
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
                <div className={`w-full rounded-t-xl ${color}`} style={{ height: `${height}%` }} />
              </div>
              <div className="text-[10px] text-white/35">{item.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadDrawer({ lead, events, call, users, onClose, onSave }) {
  const [form, setForm] = useState({
    status: lead?.status || "new",
    owner: lead?.owner || "",
    notes: lead?.notes || "",
    proxima_accion: lead?.proxima_accion || "",
    ultima_accion: lead?.ultima_accion || "",
    valor_estimado: lead?.valor_estimado || "",
  });

  useEffect(() => {
    setForm({
      status: lead?.status || "new",
      owner: lead?.owner || "",
      notes: lead?.notes || "",
      proxima_accion: lead?.proxima_accion || "",
      ultima_accion: lead?.ultima_accion || "",
      valor_estimado: lead?.valor_estimado || "",
    });
  }, [lead]);

  if (!lead) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="h-full w-full max-w-4xl overflow-y-auto border-l border-white/10 bg-[#060606] p-6 shadow-2xl shadow-black">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">Ficha de lead</div>
            <h2 className="mt-2 text-3xl font-semibold text-white">{lead.nombre || "Lead sin nombre"}</h2>
            <div className="mt-2 text-sm text-white/45">Registrado el {formatDate(lead.created_at)}</div>
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
          <Badge color="green">Predicción {lead.predicted_close_probability || 0}%</Badge>
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
          <div className="mt-2 text-white/80">{lead.necesidad || "-"}</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Estado</label>
            <select
              value={form.status}
              onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            >
              {["new", "contacted", "qualified", "won", "lost"].map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Owner</label>
            <select
              value={form.owner}
              onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            >
              <option value="">Sin asignar</option>
              {users.map((u) => (
                <option key={u.id} value={u.full_name}>
                  {u.full_name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Valor estimado (€)</label>
            <input
              value={form.valor_estimado}
              onChange={(e) => setForm((f) => ({ ...f, valor_estimado: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
            <label className="text-sm text-white/45">Última acción</label>
            <input
              value={form.ultima_accion}
              onChange={(e) => setForm((f) => ({ ...f, ultima_accion: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
            <label className="text-sm text-white/45">Próxima acción</label>
            <input
              value={form.proxima_accion}
              onChange={(e) => setForm((f) => ({ ...f, proxima_accion: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5 md:col-span-2">
            <label className="text-sm text-white/45">Notas</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={4}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href={lead.telefono ? `tel:${lead.telefono}` : "#"}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90"
          >
            Llamar
          </a>

          <button
            onClick={() => navigator.clipboard.writeText(lead.telefono || "")}
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Copiar teléfono
          </button>

          <button
            onClick={() =>
              setForm((f) => ({
                ...f,
                status: "contacted",
                ultima_accion: "Marcado como contactado desde el portal",
              }))
            }
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Marcar como contactado
          </button>

          <button
            onClick={() => onSave(lead.id, form)}
            className="rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            Guardar cambios
          </button>
        </div>

        <div className="mt-8">
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-emerald-300">Timeline</div>
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
          <div className="mb-3 text-sm uppercase tracking-[0.2em] text-blue-300">Llamada asociada</div>

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
                <div className="text-sm text-white/45">Resumen</div>
                <div className="mt-2 text-white/80">{call.summary || "-"}</div>
              </div>

              <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                <div className="text-sm text-white/45">Resumen largo</div>
                <div className="mt-2 text-white/70">{call.summary_long || "-"}</div>
              </div>

              {call.recording_url ? (
                <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-5">
                  <div className="text-sm text-white/45">Grabación</div>
                  <audio controls className="mt-3 w-full">
                    <source src={call.recording_url} />
                  </audio>
                </div>
              ) : null}

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
  const [data, setData] = useState(null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [leadEvents, setLeadEvents] = useState([]);
  const [billingLoading, setBillingLoading] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    status: "all",
    minScore: "0",
    from: "",
    to: "",
  });

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    const res = await fetch("/api/portal/overview", { cache: "no-store" });
    const json = await res.json();
    setData(json);
  }

  async function openLead(lead) {
    setSelectedLead(lead);
    const res = await fetch(`/api/lead-events?lead_id=${lead.id}`, { cache: "no-store" });
    const json = await res.json();
    setLeadEvents(Array.isArray(json.data) ? json.data : []);
  }

  async function saveLeadChanges(leadId, changes) {
    const res = await fetch("/api/leads/update", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId,
        ...changes,
      }),
    });

    const json = await res.json();
    if (!json.success) {
      alert(json.message || "No se pudo actualizar el lead.");
      return;
    }

    await loadOverview();
    const updated = json.data;
    setSelectedLead(updated);
    const eventsRes = await fetch(`/api/lead-events?lead_id=${updated.id}`, { cache: "no-store" });
    const eventsJson = await eventsRes.json();
    setLeadEvents(Array.isArray(eventsJson.data) ? eventsJson.data : []);
  }

  async function openBillingPortal() {
    try {
      setBillingLoading(true);
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: data?.client?.id || "demo" }),
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: data?.client?.id || "demo",
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

  async function exportCsv() {
    window.location.href = "/api/leads/export";
  }

  async function sendWeeklyReport() {
    const res = await fetch("/api/weekly-report/send", { method: "POST" });
    const json = await res.json();
    alert(json.success ? "Resumen semanal enviado." : json.message || "No se pudo enviar.");
  }

  const filteredLeads = useMemo(() => {
    const leads = data?.leads || [];

    return leads.filter((lead) => {
      const score = Number(lead.score || 0);
      const statusOk = filters.status === "all" ? true : lead.status === filters.status;
      const scoreOk = score >= Number(filters.minScore || 0);

      const q = filters.search.toLowerCase();
      const searchOk =
        !q ||
        String(lead.nombre || "").toLowerCase().includes(q) ||
        String(lead.telefono || "").toLowerCase().includes(q) ||
        String(lead.necesidad || "").toLowerCase().includes(q);

      const created = lead.created_at ? new Date(lead.created_at).getTime() : 0;
      const fromOk = filters.from ? created >= new Date(filters.from).getTime() : true;
      const toOk = filters.to ? created <= new Date(filters.to + "T23:59:59").getTime() : true;

      return statusOk && scoreOk && searchOk && fromOk && toOk;
    });
  }, [data, filters]);

  const selectedLeadCall = useMemo(() => {
    if (!selectedLead) return null;

    return (
      (data?.calls || []).find((call) => {
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
  }, [selectedLead, data]);

  if (!data) {
    return <div className="min-h-screen bg-[#030303] p-8 text-white">Cargando portal...</div>;
  }

  const client = data.client || {};
  const settings = data.settings || {};
  const users = data.users || [];
  const calls = data.calls || [];
  const alerts = data.alerts || [];
  const insights = data.insights || [];
  const benchmarks = data.benchmarks || [];
  const auditLogs = data.auditLogs || [];
  const metrics = data.metrics || {};
  const pipeline = data.pipeline || {};
  const rankings = data.rankings || { bestDays: [], bestHours: [] };

  const chartCalls = rankings.bestDays.length
    ? rankings.bestDays.map((d) => ({ label: d.label, value: d.calls }))
    : [{ label: "Sin datos", value: 0 }];

  const chartLeads = rankings.bestDays.length
    ? rankings.bestDays.map((d) => ({ label: d.label, value: d.leads }))
    : [{ label: "Sin datos", value: 0 }];

  return (
    <div
      className="min-h-screen overflow-x-hidden text-white"
      style={{ background: client.secondary_color || "#030303" }}
    >
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.22),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-14 md:pb-28">
        <div className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div className="flex items-start gap-4">
            {client.brand_logo_url ? (
              <img
                src={client.brand_logo_url}
                alt="logo"
                className="h-14 w-14 rounded-2xl object-cover"
              />
            ) : (
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold"
                style={{ background: client.primary_color || "#fff", color: "#000" }}
              >
                {(client.brand_name || client.name || "N").slice(0, 1)}
              </div>
            )}

            <div>
              <div className="text-sm uppercase tracking-[0.2em]" style={{ color: client.primary_color || "#93c5fd" }}>
                {client.brand_name || client.name || "Portal Enterprise"}
              </div>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">
                Inteligencia comercial de llamadas y leads
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-white/60">
                Métricas, pipeline, alertas, benchmark, equipo, insights y control operativo completo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => openCheckout("pro")}
              disabled={billingLoading}
              className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
            >
              {billingLoading ? "Abriendo..." : "Contratar / ampliar plan"}
            </button>

            <button
              onClick={openBillingPortal}
              disabled={billingLoading}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
            >
              Gestionar facturación
            </button>

            <button
              onClick={exportCsv}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Exportar CSV
            </button>

            <button
              onClick={sendWeeklyReport}
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5"
            >
              Enviar resumen semanal
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <StatCard title="Llamadas" value={metrics.totalCalls || 0} subtitle="Histórico total" />
          <StatCard title="Leads" value={metrics.totalLeads || 0} subtitle="Capturados" />
          <StatCard title="Conversión" value={`${metrics.conversionRate || 0}%`} subtitle="Leads / llamadas" />
          <StatCard title="Duración media" value={formatSeconds(metrics.avgDuration || 0)} subtitle="Tiempo por llamada" />
          <StatCard title="Score medio" value={metrics.avgLeadScore || 0} subtitle="Calidad media" />
          <StatCard title="Ingresos potenciales" value={`${Number(metrics.totalPotentialRevenue || 0).toFixed(0)}€`} subtitle="Estimación actual" />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-2">
          <MiniBarChart title="Llamadas por día" data={chartCalls} color="bg-blue-400" />
          <MiniBarChart title="Leads por día" data={chartLeads} color="bg-emerald-400" />
        </div>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-6">
            <PanelCard
              title="Pipeline CRM"
              right={<Badge color="green">{filteredLeads.length} leads filtrados</Badge>}
            >
              <div className="grid gap-4 md:grid-cols-5">
                {["new", "contacted", "qualified", "won", "lost"].map((st) => (
                  <div key={st} className="rounded-[24px] border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="font-semibold capitalize text-white">{st}</div>
                      <Badge color="blue">{pipeline[st] || 0}</Badge>
                    </div>
                    <div className="space-y-3">
                      {filteredLeads
                        .filter((lead) => (lead.status || "new") === st)
                        .slice(0, 4)
                        .map((lead) => (
                          <button
                            key={lead.id}
                            onClick={() => openLead(lead)}
                            className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left hover:bg-white/[0.07]"
                          >
                            <div className="font-medium text-white">{lead.nombre || "Sin nombre"}</div>
                            <div className="mt-1 text-xs text-white/50">{lead.necesidad || "-"}</div>
                            <div className="mt-2">
                              <Badge color={getScoreColor(lead.score)}>Score {lead.score || 0}</Badge>
                            </div>
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
            </PanelCard>

            <PanelCard title="Leads capturados">
              <div className="mb-4 grid gap-3 md:grid-cols-5">
                <input
                  placeholder="Buscar nombre, teléfono o necesidad"
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-2"
                />

                <select
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="all">Todos los estados</option>
                  <option value="new">new</option>
                  <option value="contacted">contacted</option>
                  <option value="qualified">qualified</option>
                  <option value="won">won</option>
                  <option value="lost">lost</option>
                </select>

                <select
                  value={filters.minScore}
                  onChange={(e) => setFilters((f) => ({ ...f, minScore: e.target.value }))}
                  className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                >
                  <option value="0">Score desde 0</option>
                  <option value="50">Score desde 50</option>
                  <option value="80">Score desde 80</option>
                </select>

                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="date"
                    value={filters.from}
                    onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                  <input
                    type="date"
                    value={filters.to}
                    onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
                    className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Nombre</th>
                      <th className="pb-3 pr-4">Teléfono</th>
                      <th className="pb-3 pr-4">Owner</th>
                      <th className="pb-3 pr-4">Score</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Predicción</th>
                      <th className="pb-3 pr-4">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-6 text-white/40">
                          No hay leads con esos filtros.
                        </td>
                      </tr>
                    ) : (
                      filteredLeads.slice(0, 40).map((lead) => (
                        <tr key={lead.id} className="border-b border-white/5 align-top">
                          <td className="py-4 pr-4 text-white/75">{formatDate(lead.created_at)}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.nombre || "-"}</td>
                          <td className="py-4 pr-4 text-white/75">{lead.telefono || "-"}</td>
                          <td className="py-4 pr-4 text-white/65">{lead.owner || "-"}</td>
                          <td className="py-4 pr-4">
                            <Badge color={getScoreColor(lead.score)}>Score {lead.score || 0}</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color="blue">{lead.status || "new"}</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <Badge color="green">{lead.predicted_close_probability || 0}%</Badge>
                          </td>
                          <td className="py-4 pr-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => openLead(lead)}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Ver
                              </button>

                              <a
                                href={lead.telefono ? `tel:${lead.telefono}` : "#"}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Llamar
                              </a>

                              <button
                                onClick={() => navigator.clipboard.writeText(lead.telefono || "")}
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Copiar
                              </button>

                              <button
                                onClick={() =>
                                  saveLeadChanges(lead.id, {
                                    status: "contacted",
                                    ultima_accion: "Marcado como contactado desde tabla",
                                  })
                                }
                                className="rounded-xl border border-white/15 px-3 py-2 text-xs font-medium text-white hover:bg-white/5"
                              >
                                Contactado
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </PanelCard>

            <PanelCard title="Últimas llamadas">
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-white/45">
                      <th className="pb-3 pr-4">Fecha</th>
                      <th className="pb-3 pr-4">Estado</th>
                      <th className="pb-3 pr-4">Lead</th>
                      <th className="pb-3 pr-4">Duración</th>
                      <th className="pb-3 pr-4">Intent</th>
                      <th className="pb-3 pr-4">Resumen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calls.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-white/40">
                          No hay llamadas registradas.
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
                            {call.lead_captured ? <Badge color="green">Capturado</Badge> : <Badge color="yellow">Sin lead</Badge>}
                          </td>
                          <td className="py-4 pr-4 text-white/75">{formatSeconds(call.duration_seconds)}</td>
                          <td className="py-4 pr-4 text-white/65">{call.detected_intent || "-"}</td>
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
            <PanelCard title="Equipo comercial" right={<Badge color="purple">{users.length}</Badge>}>
              <div className="space-y-3">
                {users.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay usuarios cargados todavía.
                  </div>
                ) : (
                  users.map((u) => (
                    <div key={u.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-white">{u.full_name}</div>
                          <div className="text-sm text-white/50">{u.email}</div>
                        </div>
                        <Badge color="blue">{u.role}</Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Objetivos mensuales" right={<Badge color="green">Activos</Badge>}>
              <div className="space-y-4 text-sm text-white/70">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Objetivo de leads</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.monthly_target_leads || 25}
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Objetivo de conversión</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.monthly_target_conversion || 20}%
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-white/45">Valor de operación por defecto</div>
                  <div className="mt-2 text-2xl font-semibold text-white">
                    {settings.default_deal_value || 250}€
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Centro de alertas" right={<Badge color="red">{alerts.length}</Badge>}>
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
                    Aún no hay insights.
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

            <PanelCard title="Ranking de rendimiento">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm text-white/45">Mejores días</div>
                  <div className="space-y-2 text-sm text-white/70">
                    {rankings.bestDays?.slice(0, 5).map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span>{item.conversion}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="mb-3 text-sm text-white/45">Mejores horas</div>
                  <div className="space-y-2 text-sm text-white/70">
                    {rankings.bestHours?.slice(0, 5).map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <span>{item.label}</span>
                        <span>{item.conversion}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </PanelCard>

            <PanelCard title="Audit log" right={<Badge color="blue">{auditLogs.length}</Badge>}>
              <div className="space-y-3">
                {auditLogs.length === 0 ? (
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-white/45">
                    No hay cambios registrados todavía.
                  </div>
                ) : (
                  auditLogs.slice(0, 8).map((log) => (
                    <div key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium text-white">{log.action}</div>
                        <div className="text-xs text-white/45">{formatDate(log.created_at)}</div>
                      </div>
                      <div className="mt-2 text-sm text-white/65">
                        {log.entity_type} · {log.entity_id}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PanelCard>

            <PanelCard title="Facturación y plan">
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="text-sm text-white/45">Plan actual</div>
                  <div className="mt-2 text-2xl font-semibold text-white">Pro</div>
                  <div className="mt-2 text-sm text-white/55">
                    Portal premium, pipeline, insights, exportación y analítica.
                  </div>
                </div>

                <button
                  onClick={openBillingPortal}
                  disabled={billingLoading}
                  className="w-full rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/5 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Gestionar facturación"}
                </button>

                <button
                  onClick={() => openCheckout("enterprise")}
                  disabled={billingLoading}
                  className="w-full rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-white/90 disabled:opacity-60"
                >
                  {billingLoading ? "Abriendo..." : "Ampliar a Enterprise"}
                </button>
              </div>
            </PanelCard>
          </div>
        </div>
      </main>

      <LeadDrawer
        lead={selectedLead}
        events={leadEvents}
        call={selectedLeadCall}
        users={users}
        onClose={() => {
          setSelectedLead(null);
          setLeadEvents([]);
        }}
        onSave={saveLeadChanges}
      />
    </div>
  );
}