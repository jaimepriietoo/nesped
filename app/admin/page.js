"use client";

import { useEffect, useState } from "react";

const emptyForm = {
  id: "",
  name: "",
  type: "",
  status: "Activo",
  tagline: "",
  logoText: "",
  prompt: "",
  webhook: "",
  twilioNumber: "",
};

export default function AdminPage() {
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState("");

  async function loadClients() {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/clients", { cache: "no-store" });
      const json = await res.json();

      const data = json.data || [];
      setClients(data);

      if (data.length > 0 && !creating) {
        const first = data[0];
        setSelectedId(first.id);
        setForm({
          id: first.id,
          name: first.name || "",
          type: first.type || "",
          status: first.status || "",
          tagline: first.tagline || "",
          logoText: first.logoText || "",
          prompt: first.prompt || "",
          webhook: first.webhook || "",
          twilioNumber: first.twilioNumber || "",
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  useEffect(() => {
    if (creating) return;

    const client = clients.find((c) => c.id === selectedId);
    if (!client) return;

    setForm({
      id: client.id,
      name: client.name || "",
      type: client.type || "",
      status: client.status || "",
      tagline: client.tagline || "",
      logoText: client.logoText || "",
      prompt: client.prompt || "",
      webhook: client.webhook || "",
      twilioNumber: client.twilioNumber || "",
    });
  }, [selectedId, clients, creating]);

  function handleChange(field, value) {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleNewClient() {
    setCreating(true);
    setSelectedId("");
    setMessage("");
    setForm(emptyForm);
  }

  function handleSelectClient(id) {
    setCreating(false);
    setSelectedId(id);
    setMessage("");
  }

  async function handleSave(e) {
    e.preventDefault();

    try {
      setSaving(true);
      setMessage("");

      const method = creating ? "POST" : "PATCH";

      const res = await fetch("/api/admin/clients", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setMessage(json.message || "Error guardando");
        return;
      }

      setMessage(creating ? "Cliente creado correctamente" : "Cliente actualizado correctamente");
      setCreating(false);
      await loadClients();
      setSelectedId(form.id);
    } catch (err) {
      console.error(err);
      setMessage("Error guardando");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/45">Panel interno</div>
            <h1 className="mt-1 text-4xl font-semibold">NESPED Admin</h1>
            <div className="mt-2 text-sm text-white/55">
              Crea y edita clientes, prompts, webhooks y números Twilio
            </div>
          </div>

          <button
            onClick={handleNewClient}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Nuevo cliente
          </button>
        </div>

        <div className="grid gap-8 md:grid-cols-[320px_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-5">
            <div className="mb-4 text-lg font-semibold">Clientes</div>

            {loading ? (
              <div className="text-sm text-white/45">Cargando...</div>
            ) : (
              <div className="space-y-3">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleSelectClient(client.id)}
                    className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                      !creating && selectedId === client.id
                        ? "border-white bg-white/[0.08]"
                        : "border-white/10 bg-black/20 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="font-medium">{client.name}</div>
                    <div className="mt-1 text-sm text-white/45">{client.id}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
            <div className="mb-6">
              <div className="text-sm text-white/45">
                {creating ? "Crear cliente" : "Editar cliente"}
              </div>
              <h2 className="mt-1 text-2xl font-semibold">
                {creating ? "Nuevo cliente" : "Configuración del cliente"}
              </h2>
            </div>

            <form onSubmit={handleSave} className="grid gap-5">
              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-white/60">ID</label>
                  <input
                    value={form.id}
                    onChange={(e) => handleChange("id", e.target.value)}
                    disabled={!creating}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none disabled:text-white/50"
                    placeholder="ej: inmobiliaria"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Logo Text
                  </label>
                  <input
                    value={form.logoText}
                    onChange={(e) => handleChange("logoText", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    placeholder="ej: I"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Nombre
                  </label>
                  <input
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    placeholder="Nombre comercial"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Tipo
                  </label>
                  <input
                    value={form.type}
                    onChange={(e) => handleChange("type", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    placeholder="Tipo de negocio"
                  />
                </div>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Estado
                  </label>
                  <input
                    value={form.status}
                    onChange={(e) => handleChange("status", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    placeholder="Activo"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">
                    Número Twilio
                  </label>
                  <input
                    value={form.twilioNumber}
                    onChange={(e) => handleChange("twilioNumber", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    placeholder="+1XXXXXXXXXX"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/60">
                  Tagline
                </label>
                <textarea
                  value={form.tagline}
                  onChange={(e) => handleChange("tagline", e.target.value)}
                  className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                  placeholder="Frase comercial del cliente"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/60">
                  Prompt
                </label>
                <textarea
                  value={form.prompt}
                  onChange={(e) => handleChange("prompt", e.target.value)}
                  className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                  placeholder="Prompt de la IA"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm text-white/60">
                  Webhook
                </label>
                <input
                  value={form.webhook}
                  onChange={(e) => handleChange("webhook", e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                  placeholder="https://..."
                />
              </div>

              {message && (
                <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                  {message}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-60"
                >
                  {saving
                    ? "Guardando..."
                    : creating
                    ? "Crear cliente"
                    : "Guardar cambios"}
                </button>

                <button
                  type="button"
                  onClick={loadClients}
                  className="rounded-2xl border border-white/15 px-6 py-4 text-sm font-semibold transition hover:bg-white hover:text-black"
                >
                  Recargar
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}