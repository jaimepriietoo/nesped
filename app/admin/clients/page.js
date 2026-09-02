"use client";

import { useEffect, useMemo, useState } from "react";
import { esTelefonoValido, toE164 } from "@/lib/server/phone";

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


/**
 * Telefonía del cliente: su número real (informativo, no se usa para
 * enrutar) y el número de Telnyx que le asignas (ese sí decide a qué
 * cliente pertenece cada llamada entrante).
 *
 * `numerosEnUso` son los twilio_number de los DEMÁS clientes: si el que se
 * está escribiendo coincide con uno de ellos, se avisa antes de guardar. El
 * índice único de la base de datos es la red de seguridad real —esto es
 * solo para que el aviso llegue antes de darle a "Guardar", no después.
 */
function PanelTelefonia({ original, twilio, onOriginal, onTwilio, numerosEnUso = [] }) {
  const original164 = original ? toE164(original) : "";
  const twilio164 = twilio ? toE164(twilio) : "";

  const twilioValido = !twilio || esTelefonoValido(twilio);
  const chocaConOtro =
    twilio164 && numerosEnUso.some((n) => toE164(n) === twilio164);

  const instrucciones =
    original164 && twilio164
      ? `Desvía las llamadas de ${original164} hacia ${twilio164}. Se activa desde tu operadora (Movistar, Vodafone, Orange…) en el apartado de "desvío de llamadas". Puede ser un desvío total o solo para cuando no contestes.`
      : "";

  async function copiar() {
    try {
      await navigator.clipboard.writeText(instrucciones);
      alert("Instrucciones copiadas.");
    } catch {
      alert("No se pudo copiar. Selecciona el texto a mano.");
    }
  }

  return (
    <div className="md:col-span-2 rounded-2xl border border-white/10 bg-black/40 p-4">
      <div className="mb-3 text-xs uppercase tracking-[0.16em] text-white/40">
        Telefonía
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <input
            value={original}
            onChange={(e) => onOriginal(e.target.value)}
            placeholder="Número real de la empresa (+346XXXXXXXX)"
            className="w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-white"
          />
          <p className="mt-1.5 px-1 text-xs text-white/35">
            El que ya usan de cara a sus clientes. Solo informativo.
          </p>
        </div>

        <div>
          <input
            value={twilio}
            onChange={(e) => onTwilio(e.target.value)}
            placeholder="Número de Telnyx asignado (+34983XXXXXX)"
            className={`w-full rounded-2xl border bg-black px-4 py-3 text-white ${
              twilio && !twilioValido
                ? "border-red-500/60"
                : chocaConOtro
                  ? "border-amber-500/60"
                  : "border-white/10"
            }`}
          />
          {twilio && !twilioValido ? (
            <p className="mt-1.5 px-1 text-xs text-red-300">
              No parece un teléfono válido.
            </p>
          ) : chocaConOtro ? (
            <p className="mt-1.5 px-1 text-xs text-amber-300">
              Ese número ya está asignado a otro cliente. Al guardar dará
              error: la base de datos no permite dos clientes con el mismo
              número.
            </p>
          ) : (
            <p className="mt-1.5 px-1 text-xs text-white/35">
              Uno de tus números de Telnyx. Aquí es donde llegan las llamadas
              desviadas y por donde el sistema sabe de qué cliente se trata.
            </p>
          )}
        </div>
      </div>

      {instrucciones ? (
        <div className="mt-3 rounded-2xl border border-blue-400/20 bg-blue-500/5 p-4">
          <div className="mb-2 text-xs uppercase tracking-[0.16em] text-blue-300">
            Instrucciones para el cliente
          </div>
          <p className="text-sm text-white/70">{instrucciones}</p>
          <button
            type="button"
            onClick={copiar}
            className="mt-3 rounded-xl border border-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/5"
          >
            Copiar instrucciones
          </button>
        </div>
      ) : null}
    </div>
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
    original_number: "",
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
        original_number: "",
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

  const numerosEnUso = useMemo(
    () => clients.map((c) => c.twilio_number).filter(Boolean),
    [clients]
  );

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

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <PanelTelefonia
              original={form.original_number}
              twilio={form.twilio_number}
              onOriginal={(v) => setForm((f) => ({ ...f, original_number: v }))}
              onTwilio={(v) => setForm((f) => ({ ...f, twilio_number: v }))}
              numerosEnUso={numerosEnUso}
            />
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
              numerosEnUso={numerosEnUso.filter((n) => n !== client.twilio_number)}
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

function ClientEditor({ initial, onSave, numerosEnUso = [] }) {
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

        <PanelTelefonia
          original={client.original_number}
          twilio={client.twilio_number}
          onOriginal={(v) => setClient((c) => ({ ...c, original_number: v }))}
          onTwilio={(v) => setClient((c) => ({ ...c, twilio_number: v }))}
          numerosEnUso={numerosEnUso}
        />

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
