"use client";

import { useEffect, useState } from "react";

function Card({ title, value }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 text-white">
      <div className="text-sm text-white/45">{title}</div>
      <div className="mt-2 text-3xl font-semibold">{value}</div>
    </div>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/super-dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setData(json));
  }, []);

  if (!data) {
    return <div className="min-h-screen bg-black p-8 text-white">Cargando admin...</div>;
  }

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-blue-300">Admin SaaS</div>
        <h1 className="mt-2 text-4xl font-semibold">Control multi-cliente</h1>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-4">
        <Card title="Clientes" value={data.metrics.totalClients} />
        <Card title="Llamadas" value={data.metrics.totalCalls} />
        <Card title="Leads" value={data.metrics.totalLeads} />
        <Card title="Usuarios" value={data.metrics.totalUsers} />
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <h2 className="mb-4 text-2xl font-semibold">Clientes</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-white/45">
                <th className="pb-3 pr-4">Cliente</th>
                <th className="pb-3 pr-4">Llamadas</th>
                <th className="pb-3 pr-4">Leads</th>
                <th className="pb-3 pr-4">Conversión</th>
                <th className="pb-3 pr-4">Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {data.clients.map((client) => (
                <tr key={client.client_id} className="border-b border-white/5">
                  <td className="py-4 pr-4">{client.client_name}</td>
                  <td className="py-4 pr-4">{client.total_calls}</td>
                  <td className="py-4 pr-4">{client.total_leads}</td>
                  <td className="py-4 pr-4">{client.conversion}%</td>
                  <td className="py-4 pr-4">{client.users}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}