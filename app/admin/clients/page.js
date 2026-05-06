"use client";

import { useEffect, useMemo, useState } from "react";

function Badge({ children, color = "default" }) {
  const styles = {
    default: "bg-white/10 text-white/70 border border-white/10",
    green: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/20",
    red: "bg-red-500/20 text-red-300 border border-red-500/20",
    blue: "bg-blue-500/20 text-blue-300 border border-blue-500/20",
    yellow: "bg-amber-500/20 text-amber-300 border border-amber-500/20",
  };

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${styles[color]}`}>
      {children}
    </span>
  );
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const [form, setForm] = useState({
    id: "",
    name: "",
    prompt: "",
    webhook: "",
    twilio_number: "",
    owner_email: "",
    brand_name: "",
    primary_color: "#ffffff",
    secondary_color: "#030303",
    industry: "",
    is_active: true,
  });

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/clients", { cache: "no-store" });
      const json = await res.json();
      setClients(Array.isArray(json.data) ? json.data : []);
    } catch (err) {
      console.error(err);
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  async function createClient() {
    try {
      setCreating(true);

      const res = await fetch("/api/admin/clients/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();
      if (!json.success) {
        alert(json.message || "No se pudo crear cliente");
        return;
      }

      setForm({
        id: "",
        name: "",
        prompt: "",
        webhook: "",
        twilio_number: "",
        owner_email: "",
        brand_name: "",
        primary_color: "#ffffff",
        secondary_color: "#030303",
        industry: "",
        is_active: true,
      });

      await loadClients();
      alert("Cliente creado correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error creando cliente.");
    } finally {
      setCreating(false);
    }
  }

  async function updateClient(client) {
    try {
      const res = await fetch("/api/admin/clients/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(client),
      });

      const json = await res.json();
      if (!json.success) {
        alert(json.message || "No se pudo actualizar cliente");
        return;
      }

      await loadClients();
      alert("Cliente actualizado.");
    } catch (err) {
      console.error(err);
      alert("Error actualizando cliente.");
    }
  }

  const filteredClients = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return clients;

    return clients.filter((client) => {
      return (
        String(client.id || "").toLowerCase().includes(q) ||
        String(client.name || "").toLowerCase().includes(q) ||
        String(client.owner_email || "").toLowerCase().includes(q) ||
        String(client.brand_name || "").toLowerCase().includes(q) ||
        String(client.industry || "").toLowerCase().includes(q)
      );
    });
  }, [clients, search]);

  return (
    <div className="min-h-screen bg-[#030303] p-8 text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.12),transparent_24%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.04),transparent_35%)]" />

      <div className="relative mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-sm uppercase tracking-[0.2em] text-blue-300">
              Admin
            </div>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">
              Clientes
            </h1>
            <p className="mt-3 max-w-2xl text-white/55">
              Gestiona branding, prompt, webhook, número de voz, estado y configuración base de cada cliente.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/60">
            {loading ? "Cargando..." : `${filteredClients.length} cliente(s)`}
          </div>
        </div>

        <div className="mb-8 rounded-[30px] border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
          <div className="mb-5 flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">Crear cliente</h2>
            <Badge color="blue">Nuevo</Badge>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <input
              value={form.id}
              onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
              placeholder="id"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="name"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.owner_email}
              onChange={(e) => setForm((f) => ({ ...f, owner_email: e.target.value }))}
              placeholder="owner_email"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.brand_name}
              onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
              placeholder="brand_name"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.primary_color}
              onChange={(e) => setForm((f) => ({ ...f, primary_color: e.target.value }))}
              placeholder="primary_color"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.secondary_color}
              onChange={(e) => setForm((f) => ({ ...f, secondary_color: e.target.value }))}
              placeholder="secondary_color"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.industry}
              onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
              placeholder="industry"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.twilio_number}
              onChange={(e) => setForm((f) => ({ ...f, twilio_number: e.target.value }))}
              placeholder="+34XXXXXXXXX"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
            <input
              value={form.webhook}
              onChange={(e) => setForm((f) => ({ ...f, webhook: e.target.value }))}
              placeholder="webhook"
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-2"
            />

            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-2">
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              <span>Cliente activo</span>
            </label>
          </div>

          <textarea
            value={form.prompt}
            onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            rows={6}
            placeholder="prompt"
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          />

          <button
            onClick={createClient}
            disabled={creating}
            className="mt-4 rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"
          >
            {creating ? "Creando..." : "Crear cliente"}
          </button>
        </div>

        <div className="mb-6">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por id, nombre, email, marca o industria"
            className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white"
          />
        </div>

        <div className="space-y-4">
          {filteredClients.map((client, index) => (
            <ClientEditor
              key={client.id || index}
              initial={client}
              onSave={updateClient}
            />
          ))}

          {!loading && filteredClients.length === 0 ? (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-8 text-white/45">
              No hay clientes con ese filtro.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ClientEditor({ initial, onSave }) {
  const [client, setClient] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    try {
      setSaving(true);
      await onSave(client);
    } finally {
      setSaving(false);
    }
  }

  async function copyClientId() {
    try {
      await navigator.clipboard.writeText(client.id || "");
      alert("ID copiado.");
    } catch (err) {
      console.error(err);
      alert("No se pudo copiar el ID.");
    }
  }

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-black/20">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xl font-semibold text-white">
            {client.name} ({client.id})
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge color={client.is_active === false ? "red" : "green"}>
              {client.is_active === false ? "Inactivo" : "Activo"}
            </Badge>
            {client.industry ? <Badge color="blue">{client.industry}</Badge> : null}
            {client.owner_email ? <Badge>{client.owner_email}</Badge> : null}
          </div>
        </div>

        <button
          onClick={copyClientId}
          className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-white hover:bg-white/5"
        >
          Copiar ID
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {[
          "name",
          "owner_email",
          "brand_name",
          "primary_color",
          "secondary_color",
          "industry",
          "webhook",
          "twilio_number",
        ].map((key) => (
          <input
            key={key}
            value={client[key] || ""}
            onChange={(e) =>
              setClient((c) => ({
                ...c,
                [key]: e.target.value,
              }))
            }
            placeholder={key}
            className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          />
        ))}

        <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3 text-white md:col-span-2">
          <input
            type="checkbox"
            checked={client.is_active !== false}
            onChange={(e) =>
              setClient((c) => ({
                ...c,
                is_active: e.target.checked,
              }))
            }
          />
          <span>Cliente activo</span>
        </label>
      </div>

      <textarea
        value={client.prompt || ""}
        onChange={(e) =>
          setClient((c) => ({
            ...c,
            prompt: e.target.value,
          }))
        }
        rows={6}
        placeholder="prompt"
        className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
      />

      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black disabled:opacity-60"
        >
          {saving ? "Guardando..." : "Guardar cliente"}
        </button>

        {client.id ? (
          <a
            href={`/c/${client.id}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white hover:bg-white/5"
          >
            Abrir portal cliente
          </a>
        ) : null}
      </div>
    </div>
  );
}
