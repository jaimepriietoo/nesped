"use client";

import { useEffect, useMemo, useState } from "react";

export default function ClientLanding({ params }) {
  const [client, setClient] = useState(null);
  const [telefonoDemo, setTelefonoDemo] = useState("");
  const [loadingCall, setLoadingCall] = useState(false);
  const [callStatus, setCallStatus] = useState("");

  const clientId = params?.clientId;

  async function loadClient() {
    try {
      const res = await fetch("/api/clients", { cache: "no-store" });
      const json = await res.json();
      const allClients = Array.isArray(json.data) ? json.data : [];
      const found = allClients.find((c) => c.id === clientId) || null;
      setClient(found);
    } catch (err) {
      console.error(err);
      setClient(null);
    }
  }

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
          client_id: clientId,
        }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setCallStatus(json.message || "No se pudo lanzar la llamada.");
        return;
      }

      setCallStatus("Llamada lanzada correctamente. Revisa tu móvil.");
    } catch (err) {
      console.error(err);
      setCallStatus("Error técnico al lanzar la llamada.");
    } finally {
      setLoadingCall(false);
    }
  }

  useEffect(() => {
    loadClient();
  }, [clientId]);

  const theme = useMemo(() => {
    return client?.theme || {
      accent: "bg-blue-500/20",
      accentText: "text-blue-300",
      button: "bg-white text-black hover:bg-white/90",
      badge: "bg-emerald-500/15 text-emerald-300",
    };
  }, [client]);

  if (!client) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center px-6">
        <div className="text-center">
          <div className="text-sm text-white/45">White-label page</div>
          <div className="mt-2 text-3xl font-semibold">Cliente no encontrado</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#040404] text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_35%)]" />

      <header className="border-b border-white/10 bg-black/40 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-black text-lg font-bold">
              {client.logoText || "N"}
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">{client.name}</div>
              <div className="text-xs text-white/45">{client.type}</div>
            </div>
          </div>

          <div className={`rounded-full px-3 py-1 text-xs ${theme.badge}`}>
            {client.status}
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-6 pb-20 pt-20 md:pb-28 md:pt-28">
        <div className="grid items-center gap-14 md:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className={`mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 ${theme.accent} px-4 py-2 text-xs uppercase tracking-[0.22em] ${theme.accentText}`}>
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              Atención automatizada con IA
            </div>

            <h1 className="max-w-4xl text-5xl font-semibold tracking-tight md:text-7xl">
              {client.name}
            </h1>

            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/65 md:text-xl">
              {client.tagline}
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href="#demo"
                className={`rounded-2xl px-6 py-3 text-sm font-semibold transition ${theme.button}`}
              >
                Probar demo
              </a>

              <a
                href="/login"
                className="rounded-2xl border border-white/15 px-6 py-3 text-sm font-semibold transition hover:bg-white/5"
              >
                Acceso clientes
              </a>
            </div>
          </div>

          <div
            id="demo"
            className="rounded-[32px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/50 backdrop-blur-2xl"
          >
            <div className="rounded-[28px] border border-white/10 bg-black/50 p-6">
              <div className="text-sm text-white/45">Demo</div>
              <div className="mt-1 text-2xl font-semibold">
                Recibe una llamada en directo
              </div>
              <p className="mt-3 text-sm leading-7 text-white/60">
                Introduce tu número y prueba cómo responde la IA de {client.name}.
              </p>

              <div className="mt-6 space-y-3">
                <input
                  type="text"
                  placeholder="+346XXXXXXXX"
                  value={telefonoDemo}
                  onChange={(e) => setTelefonoDemo(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                />

                <button
                  onClick={hacerLlamada}
                  disabled={loadingCall}
                  className={`w-full rounded-2xl px-5 py-4 text-sm font-semibold transition ${theme.button} disabled:opacity-60`}
                >
                  {loadingCall ? "Lanzando..." : "Llamar ahora"}
                </button>

                {callStatus && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/70">
                    {callStatus}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}