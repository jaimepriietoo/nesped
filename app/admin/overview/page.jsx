"use client";

import { useEffect, useState } from "react";

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/dashboard")
      .then((res) => res.json())
      .then((json) => setData(json));
  }, []);

  if (!data) {
    return <div className="p-6 text-white">Cargando...</div>;
  }

  const { metrics, recentCalls } = data;

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* METRICS */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card title="Llamadas" value={metrics.totalCalls} />
        <Card title="Leads" value={metrics.totalLeads} />
        <Card title="Conversión" value={`${metrics.conversionRate}%`} />
        <Card title="Duración media" value={`${metrics.avgDuration}s`} />
      </div>

      {/* TABLE */}
      <div className="bg-zinc-900 rounded-xl p-4">
        <h2 className="text-lg font-semibold mb-4">Últimas llamadas</h2>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-zinc-400">
              <th className="pb-2">Fecha</th>
              <th>Lead</th>
              <th>Duración</th>
              <th>Resumen</th>
            </tr>
          </thead>

          <tbody>
            {recentCalls.map((call) => (
              <tr key={call.id} className="border-t border-zinc-800">
                <td className="py-2">
                  {new Date(call.created_at).toLocaleString()}
                </td>

                <td>
                  {call.lead_captured ? (
                    <span className="text-green-400">Sí</span>
                  ) : (
                    <span className="text-red-400">No</span>
                  )}
                </td>

                <td>{call.duration_seconds}s</td>

                <td className="max-w-xs truncate">
                  {call.summary || "Sin resumen"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-zinc-900 p-4 rounded-xl">
      <div className="text-zinc-400 text-sm">{title}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}