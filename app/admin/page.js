"use client";

import { useEffect, useMemo, useState } from "react";

const emptyClientForm = {
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

const emptyUserForm = {
  email: "",
  password: "",
  role: "client",
  clientId: "",
};

export default function AdminPage() {
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(emptyClientForm);

  const [users, setUsers] = useState([]);
  const [calls, setCalls] = useState([]);
  const [userForm, setUserForm] = useState(emptyUserForm);

  const [loading, setLoading] = useState(true);
  const [loadingCalls, setLoadingCalls] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState("");
  const [userMessage, setUserMessage] = useState("");

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

      if (!userForm.clientId && data.length > 0) {
        setUserForm((prev) => ({ ...prev, clientId: data[0].id }));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadUsers() {
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = await res.json();
      setUsers(json.data || []);
    } catch (err) {
      console.error(err);
      setUsers([]);
    }
  }

  async function loadCalls() {
    try {
      setLoadingCalls(true);
      const res = await fetch("/api/admin/calls", { cache: "no-store" });
      const json = await res.json();
      setCalls(json.data || []);
    } catch (err) {
      console.error(err);
      setCalls([]);
    } finally {
      setLoadingCalls(false);
    }
  }

  useEffect(() => {
    loadClients();
    loadUsers();
    loadCalls();
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

  function handleUserChange(field, value) {
    setUserForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }

  function handleNewClient() {
    setCreating(true);
    setSelectedId("");
    setMessage("");
    setForm(emptyClientForm);
  }

  function handleSelectClient(id) {
    setCreating(false);
    setSelectedId(id);
    setMessage("");
  }

  async function handleSaveClient(e) {
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

      setMessage(
        creating
          ? "Cliente creado correctamente"
          : "Cliente actualizado correctamente"
      );

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

  async function handleCreateUser(e) {
    e.preventDefault();

    try {
      setUserMessage("");

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(userForm),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        setUserMessage(json.message || "Error creando usuario");
        return;
      }

      setUserMessage("Usuario creado correctamente");
      setUserForm({
        ...emptyUserForm,
        clientId: userForm.clientId || "",
      });
      await loadUsers();
    } catch (err) {
      console.error(err);
      setUserMessage("Error creando usuario");
    }
  }

  const stats = useMemo(() => {
    const totalClients = clients.length;
    const totalUsers = users.length;
    const totalCalls = calls.length;
    const totalCompleted = calls.filter(
      (call) => call.status === "completed"
    ).length;

    return [
      { label: "Clientes", value: totalClients },
      { label: "Usuarios", value: totalUsers },
      { label: "Llamadas", value: totalCalls },
      { label: "Completadas", value: totalCompleted },
    ];
  }, [clients, users, calls]);

  return (
    <div className="min-h-screen bg-[#050505] text-white px-6 py-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-white/45">Panel interno</div>
            <h1 className="mt-1 text-4xl font-semibold">NESPED Admin</h1>
            <div className="mt-2 text-sm text-white/55">
              Gestiona clientes, prompts, webhooks, números, usuarios y llamadas
            </div>
          </div>

          <button
            onClick={handleNewClient}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
          >
            Nuevo cliente
          </button>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-4">
          {stats.map((item) => (
            <div
              key={item.label}
              className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="text-sm text-white/45">{item.label}</div>
              <div className="mt-2 text-3xl font-semibold">{item.value}</div>
            </div>
          ))}
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

          <div className="space-y-8">
            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="mb-6">
                <div className="text-sm text-white/45">
                  {creating ? "Crear cliente" : "Editar cliente"}
                </div>
                <h2 className="mt-1 text-2xl font-semibold">
                  {creating ? "Nuevo cliente" : "Configuración del cliente"}
                </h2>
              </div>

              <form onSubmit={handleSaveClient} className="grid gap-5">
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
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/60">Nombre</label>
                    <input
                      value={form.name}
                      onChange={(e) => handleChange("name", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/60">Tipo</label>
                    <input
                      value={form.type}
                      onChange={(e) => handleChange("type", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/60">Estado</label>
                    <input
                      value={form.status}
                      onChange={(e) => handleChange("status", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
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
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">Tagline</label>
                  <textarea
                    value={form.tagline}
                    onChange={(e) => handleChange("tagline", e.target.value)}
                    className="min-h-[100px] w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">Prompt</label>
                  <textarea
                    value={form.prompt}
                    onChange={(e) => handleChange("prompt", e.target.value)}
                    className="min-h-[180px] w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-white/60">Webhook</label>
                  <input
                    value={form.webhook}
                    onChange={(e) => handleChange("webhook", e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
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
                    onClick={() => {
                      loadClients();
                      loadCalls();
                      loadUsers();
                    }}
                    className="rounded-2xl border border-white/15 px-6 py-4 text-sm font-semibold transition hover:bg-white hover:text-black"
                  >
                    Recargar todo
                  </button>
                </div>
              </form>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="mb-6">
                <div className="text-sm text-white/45">Usuarios</div>
                <h2 className="mt-1 text-2xl font-semibold">Crear usuario</h2>
              </div>

              <form onSubmit={handleCreateUser} className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/60">Email</label>
                    <input
                      value={userForm.email}
                      onChange={(e) => handleUserChange("email", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                      placeholder="cliente@empresa.com"
                    />
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/60">
                      Contraseña
                    </label>
                    <input
                      value={userForm.password}
                      onChange={(e) => handleUserChange("password", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                      placeholder="password"
                    />
                  </div>
                </div>

                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm text-white/60">Rol</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => handleUserChange("role", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    >
                      <option value="client">client</option>
                      <option value="admin">admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm text-white/60">
                      Cliente
                    </label>
                    <select
                      value={userForm.clientId}
                      onChange={(e) => handleUserChange("clientId", e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
                    >
                      <option value="">Selecciona cliente</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name} ({client.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {userMessage && (
                  <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-white/70">
                    {userMessage}
                  </div>
                )}

                <button
                  type="submit"
                  className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Crear usuario
                </button>
              </form>

              <div className="mt-8">
                <div className="mb-3 text-lg font-semibold">Usuarios actuales</div>
                <div className="space-y-3">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
                    >
                      <div className="font-medium">{user.email}</div>
                      <div className="mt-1 text-sm text-white/45">
                        rol: {user.role} · cliente: {user.client_id}
                      </div>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="text-sm text-white/45">No hay usuarios.</div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-8">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <div className="text-sm text-white/45">Actividad</div>
                  <h2 className="mt-1 text-2xl font-semibold">
                    Llamadas recientes
                  </h2>
                </div>

                <button
                  onClick={loadCalls}
                  className="rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium transition hover:bg-white hover:text-black"
                >
                  Refrescar llamadas
                </button>
              </div>

              <div className="overflow-hidden rounded-[24px] border border-white/10">
                <div className="grid grid-cols-6 bg-white/[0.04] px-5 py-4 text-xs uppercase tracking-[0.18em] text-white/40">
                  <div>Cliente</div>
                  <div>Estado</div>
                  <div>Resumen</div>
                  <div>Origen</div>
                  <div>Duración</div>
                  <div>Fecha</div>
                </div>

                {loadingCalls ? (
                  <div className="px-5 py-8 text-sm text-white/45">
                    Cargando llamadas...
                  </div>
                ) : calls.length === 0 ? (
                  <div className="px-5 py-8 text-sm text-white/45">
                    No hay llamadas todavía.
                  </div>
                ) : (
                  calls.map((call, index) => (
                    <div
                      key={call.id || index}
                      className="grid grid-cols-6 items-center border-t border-white/10 px-5 py-4 text-sm"
                    >
                      <div className="font-medium">{call.client_id || "-"}</div>
                      <div className="text-white/70">{call.status || "-"}</div>
                      <div className="text-white/70">{call.summary || "-"}</div>
                      <div className="text-white/60">{call.from_number || "-"}</div>
                      <div className="text-white/70">
                        {call.duration_seconds || 0}s
                      </div>
                      <div className="text-white/45">
                        {call.created_at
                          ? new Date(call.created_at).toLocaleString("es-ES")
                          : "-"}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}