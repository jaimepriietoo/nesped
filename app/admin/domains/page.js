"use client";

import { useState } from "react";

export default function AdminDomainsPage() {
  const [clientId, setClientId] = useState("");
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  async function conectarDominio() {
    try {
      setLoading(true);
      setResult(null);

      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId, domain }),
      });

      const json = await res.json();
      setResult(json);
    } catch (error) {
      console.error(error);
      setResult({ success: false, message: "Error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-semibold">Conectar dominio cliente</h1>

        <div className="mt-8 grid gap-4">
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="clientId (ej: clinica)"
            className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
          />
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="dominio del cliente (ej: clinicadental.com)"
            className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
          />
          <button
            onClick={conectarDominio}
            disabled={loading}
            className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
          >
            {loading ? "Conectando..." : "Conectar dominio"}
          </button>
        </div>

        {result && (
          <pre className="mt-8 overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4 text-sm text-white/80">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}