"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Dominios propios de cada cliente.
 *
 * Antes eran dos campos con marcador de posición y un volcado de JSON en
 * crudo como respuesta. Ahora enseña qué dominios hay conectados, lleva
 * etiquetas de verdad —un marcador desaparece al escribir y los lectores de
 * pantalla no lo anuncian como nombre del campo— y explica el paso de DNS,
 * que es donde se atasca siempre.
 */
export default function AdminDomainsPage() {
  const [clientes, setClientes] = useState([]);
  const [clientId, setClientId] = useState("");
  const [dominio, setDominio] = useState("");
  const [estado, setEstado] = useState(null);
  const [cargando, setCargando] = useState(false);

  const cargarClientes = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/clients", { cache: "no-store" });
      const json = await res.json();
      const filas = Array.isArray(json?.data) ? json.data : [];
      setClientes(filas);
      setClientId((actual) => actual || filas[0]?.id || "");
    } catch {
      setClientes([]);
    }
  }, []);

  useEffect(() => { cargarClientes(); }, [cargarClientes]);

  const conectados = clientes.filter((c) => c.customDomain);

  async function conectar(e) {
    e.preventDefault();

    if (!clientId || !dominio.trim()) {
      setEstado({ ok: false, texto: "Elige el cliente y escribe el dominio." });
      return;
    }

    setCargando(true);
    setEstado(null);

    try {
      const res = await fetch("/api/admin/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, domain: dominio.trim() }),
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || json?.success === false) {
        setEstado({ ok: false, texto: json?.message || "No se pudo conectar el dominio." });
        return;
      }

      setEstado({ ok: true, texto: `${dominio.trim()} queda asociado a ${clientId}. Falta el paso de DNS.` });
      setDominio("");
      await cargarClientes();
    } catch (error) {
      setEstado({ ok: false, texto: error?.message || "Error técnico al conectar el dominio." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="min-h-screen px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="text-sm text-white/45">Marca blanca</div>
        <h1 className="mt-1 text-4xl font-semibold">Dominios de cliente</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          Sirve el portal de un cliente en su propia dirección. Son dos pasos:
          asociar el dominio aquí y, después, apuntar el DNS desde el panel del
          proveedor donde lo tenga registrado.
        </p>

        <form onSubmit={conectar} className="mt-8 grid gap-4">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-white/40">Cliente</span>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
            >
              {clientes.length === 0 ? <option value="">Cargando clientes…</option> : null}
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.brandName || c.name} ({c.id})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-[0.16em] text-white/40">Dominio</span>
            <input
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              placeholder="portal.clinicadental.com"
              autoComplete="off"
              spellCheck={false}
              className="rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
            />
          </label>

          <button
            type="submit"
            disabled={cargando}
            className="rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
          >
            {cargando ? "Conectando…" : "Conectar dominio"}
          </button>
        </form>

        {estado ? (
          <div
            role="status"
            aria-live="polite"
            className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
              estado.ok
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
                : "border-red-400/30 bg-red-400/10 text-red-200"
            }`}
          >
            {estado.texto}
          </div>
        ) : null}

        <h2 className="mt-12 text-lg font-semibold">Paso de DNS</h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          En el proveedor donde esté registrado el dominio, crea un registro
          CNAME con el subdominio elegido apuntando a{" "}
          <code className="rounded bg-white/10 px-2 py-0.5">cname.vercel-dns.com</code>.
          Tarda entre unos minutos y unas horas en propagarse.
        </p>

        <h2 className="mt-10 text-lg font-semibold">Dominios ya conectados</h2>
        {conectados.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-white/40">
            Ningún cliente tiene dominio propio todavía.
          </p>
        ) : (
          <div className="mt-3 grid gap-3">
            {conectados.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
              >
                <div>
                  <div className="text-sm font-medium">{c.brandName || c.name}</div>
                  <div className="text-xs text-white/45">{c.id}</div>
                </div>
                <code className="text-sm text-white/75">{c.customDomain}</code>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
