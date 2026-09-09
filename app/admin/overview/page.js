"use client";

import { useEffect, useState, useCallback } from "react";

function Card({ title, value, nota }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-white">
      <div className="text-sm text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
      {nota ? <div className="mt-1 text-xs text-white/35">{nota}</div> : null}
    </div>
  );
}

export default function AdminOverview() {
  const [metrics, setMetrics] = useState(null);
  const [clients, setClients] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  /* Las empresas llegan por páginas. El servidor devuelve el cursor de la
     siguiente, o null cuando ya no quedan; aquí no se calcula nada, solo se
     pide lo que él diga. */
  const cargar = useCallback(async (desde) => {
    setCargando(true);
    setError(null);
    try {
      const url = desde
        ? `/api/admin/super-dashboard?desde=${encodeURIComponent(desde)}`
        : "/api/admin/super-dashboard";
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();

      if (!json.success) {
        setError(json.message || "No se pudo cargar");
        return;
      }

      /* Sólo si vienen. La segunda página los manda a null porque no cambian,
         y machacarlos con {} dejaría las tarjetas a cero al pulsar "ver más". */
      if (json.metrics) setMetrics(json.metrics);
      setClients((previas) => (desde ? [...previas, ...json.clients] : json.clients));
      setCursor(json.cursor || null);
    } catch (err) {
      setError(err?.message || "No se pudo cargar");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(null);
  }, [cargar]);

  if (!metrics && cargando) {
    return <div className="min-h-screen bg-black p-8 text-white">Cargando admin...</div>;
  }

  if (error && !metrics) {
    return <div className="min-h-screen bg-black p-8 text-white">{error}</div>;
  }

  /* Cuando las tablas crecen, los totales globales pasan a ser la estimación
     del planificador. Se dice, en vez de dar por exacta una cifra que no lo
     es. */
  const nota = metrics?.exactas === false ? "aproximado" : null;

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-blue-300">Admin SaaS</div>
        <h1 className="mt-2 text-4xl font-semibold">Control multi-cliente</h1>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card title="Clientes" value={metrics?.totalClients ?? 0} />
        <Card title="Llamadas" value={metrics?.totalCalls ?? 0} nota={nota} />
        <Card title="Leads" value={metrics?.totalLeads ?? 0} nota={nota} />
        <Card title="Usuarios" value={metrics?.totalUsers ?? 0} />
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <h2 className="mb-4 text-2xl font-semibold">Clientes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/45">
                <th className="pb-3 pr-4">Cliente</th>
                <th className="pb-3 pr-4">Plan</th>
                <th className="pb-3 pr-4">Llamadas</th>
                <th className="pb-3 pr-4">Leads</th>
                <th className="pb-3 pr-4">Conversión</th>
                <th className="pb-3 pr-4">Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.client_id} className="border-b border-white/5">
                  <td className="py-4 pr-4">{client.client_name}</td>
                  <td className="py-4 pr-4 text-white/50">{client.plan || "—"}</td>
                  <td className="py-4 pr-4">{client.total_calls}</td>
                  <td className="py-4 pr-4">{client.total_leads}</td>
                  <td className="py-4 pr-4">{client.conversion}%</td>
                  <td className="py-4 pr-4">{client.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cursor ? (
          <button
            type="button"
            onClick={() => cargar(cursor)}
            disabled={cargando}
            className="mt-5 rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 hover:text-white disabled:opacity-40"
          >
            {cargando ? "Cargando…" : "Ver más empresas"}
          </button>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-300">{error}</p> : null}
      </div>
    </div>
  );
}
