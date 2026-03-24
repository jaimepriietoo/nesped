"use client";

import { useEffect, useState } from "react";

function BarChart({ title, data = {} }) {
  const entries = Object.entries(data);
  const max = Math.max(...entries.map(([, value]) => value), 1);

  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
      <div className="mb-5 text-lg font-semibold">{title}</div>

      <div className="space-y-4">
        {entries.map(([label, value]) => (
          <div key={label}>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="text-white/65">{label}</span>
              <span className="text-white">{value}</span>
            </div>
            <div className="h-3 rounded-full bg-white/10">
              <div
                className="h-3 rounded-full bg-white"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    fetch("/api/admin/dashboard", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setData(json.data || null))
      .catch(console.error);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-4xl font-semibold">Admin Overview</h1>

        {!data ? (
          <div className="mt-8 text-white/50">Cargando...</div>
        ) : (
          <>
            <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-white/45">Clientes</div>
                <div className="mt-2 text-3xl font-semibold">
                  {data.totals.clients}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-white/45">Usuarios</div>
                <div className="mt-2 text-3xl font-semibold">
                  {data.totals.users}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-white/45">Llamadas</div>
                <div className="mt-2 text-3xl font-semibold">
                  {data.totals.calls}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
                <div className="text-white/45">Leads</div>
                <div className="mt-2 text-3xl font-semibold">
                  {data.totals.leads}
                </div>
              </div>
            </div>

            <div className="mt-8 grid gap-5 md:grid-cols-2">
              <BarChart title="Llamadas por cliente" data={data.callsByClient} />
              <BarChart title="Leads por cliente" data={data.leadsByClient} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}