"use client";

import { useEffect, useState } from "react";

export default function PortalPage() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  async function loadSession() {
    try {
      const res = await fetch("/api/session", { cache: "no-store" });
      const json = await res.json();
      setSession(json);
    } catch (err) {
      console.error(err);
      setSession(null);
    }
  }

  async function loadLeads() {
    try {
      setLoading(true);
      const res = await fetch("/api/leads", { cache: "no-store" });
      const json = await res.json();
      setLeads(json.data || []);
    } catch (err) {
      console.error(err);
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  useEffect(() => {
    loadSession();
    loadLeads();
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <div className="text-sm text-white/45">Portal privado</div>
            <h1 className="mt-1 text-4xl font-semibold">NESPED Client Portal</h1>
            <div className="mt-2 text-sm text-white/55">
              Cliente: {session?.clientName || "Cargando..."}{" "}
              {session?.clientId ? `(${session.clientId})` : ""}
            </div>
          </div>

          <button
            onClick={logout}
            className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
          >
            Cerrar sesión
          </button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm text-white/45">Cliente</div>
            <div className="mt-2 text-2xl font-semibold">
              {session?.clientName || "-"}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm text-white/45">ID</div>
            <div className="mt-2 text-2xl font-semibold">
              {session?.clientId || "-"}
            </div>
          </div>

          <div className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6">
            <div className="text-sm text-white/45">Leads visibles</div>
            <div className="mt-2 text-2xl font-semibold">{leads.length}</div>
          </div>
        </div>

        <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-8 shadow-2xl shadow-black/40">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-semibold">Leads del cliente</h2>
            <button
              onClick={loadLeads}
              className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
            >
              Refrescar
            </button>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-white/10">
            <div className="grid grid-cols-6 bg-white/[0.04] px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/40">
              <div>Lead</div>
              <div>Teléfono</div>
              <div>Ciudad</div>
              <div>Necesidad</div>
              <div>Origen</div>
              <div>Fecha</div>
            </div>

            {loading ? (
              <div className="px-5 py-8 text-sm text-white/45">
                Cargando leads...
              </div>
            ) : leads.length === 0 ? (
              <div className="px-5 py-8 text-sm text-white/45">
                No hay leads todavía para este cliente.
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
      </div>
    </div>
  );
}