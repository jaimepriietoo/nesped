"use client";

import { useEffect, useState } from "react";

export default function AdminClientsPage() {
  const [clients, setClients] = useState([]);
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
  });

  useEffect(() => {
    loadClients();
  }, []);

  async function loadClients() {
    const res = await fetch("/api/admin/clients");
    const json = await res.json();
    setClients(json.data || []);
  }

  async function createClient() {
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
    });

    await loadClients();
  }

  async function updateClient(client) {
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
  }

  return (
    <div className="min-h-screen bg-black p-8 text-white">
      <div className="mb-8">
        <div className="text-sm uppercase tracking-[0.2em] text-blue-300">Admin</div>
        <h1 className="mt-2 text-4xl font-semibold">Clientes</h1>
      </div>

      <div className="mb-8 rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
        <h2 className="mb-4 text-2xl font-semibold">Crear cliente</h2>

        <div className="grid gap-3 md:grid-cols-2">
          {Object.keys(form).map((key) => (
            <input
              key={key}
              value={form[key]}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  [key]: e.target.value,
                }))
              }
              placeholder={key}
              className="rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
            />
          ))}
        </div>

        <button
          onClick={createClient}
          className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
        >
          Crear cliente
        </button>
      </div>

      <div className="space-y-4">
        {clients.map((client, index) => (
          <ClientEditor key={client.id || index} initial={client} onSave={updateClient} />
        ))}
      </div>
    </div>
  );
}

function ClientEditor({ initial, onSave }) {
  const [client, setClient] = useState(initial);

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6">
      <div className="mb-4 text-xl font-semibold">{client.name} ({client.id})</div>

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
      </div>

      <textarea
        value={client.prompt || ""}
        onChange={(e) =>
          setClient((c) => ({
            ...c,
            prompt: e.target.value,
          }))
        }
        rows={5}
        placeholder="prompt"
        className="mt-3 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
      />

      <button
        onClick={() => onSave(client)}
        className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black"
      >
        Guardar cliente
      </button>
    </div>
  );
}