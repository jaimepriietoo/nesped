"use client";

/**
 * Portal de cliente.
 *
 * El middleware de proxy.js exige sesión en todo lo que empieza por /portal,
 * así que esta ruta y sus hijas quedan protegidas de fábrica.
 *
 * Nueve pantallas, y a propósito.
 *
 * Llegó a tener treinta y una. El problema no era el número: era que la
 * mayoría no leía datos, los generaba. Con una cuenta de dos leads y
 * veintinueve llamadas, "Enterprise" pintaba treinta y una tarjetas de
 * consejos y "Revenue OS" explicaba dónde se escapaba el dinero. Eso no es
 * información con buena tipografía, es relleno, y en un producto que se
 * vende por miles de euros al mes resta credibilidad en vez de sumarla.
 *
 * Lo que queda es lo que se mira a diario —qué ha entrado, a quién llamar,
 * qué se dijo— y lo que configura el agente. Nada más.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./portal.css";

/* ── utilidades ──────────────────────────────────────────────────────── */

/**
 * Cada entrada con `api` se carga bajo demanda desde ese endpoint la primera
 * vez que se abre su pestaña. Las que no lo tienen se dibujan con los datos
 * de /api/portal/overview, que ya se piden al entrar.
 */
/* =========================================================================
   Planes.

   El portal no distinguía planes: un cliente de Starter veía exactamente lo
   mismo que uno de Pro, aunque pagase la cuarta parte. Las columnas `plan` y
   `calls_limit` estaban en la base desde el principio y nadie las leía.

   Lo que no entra en el plan no se esconde: se enseña bloqueado. Un cliente
   de Starter viendo qué le daría Pro es la mejor palanca de subida que hay,
   y esconderlo sólo consigue que no sepa que existe.
   ========================================================================= */

const PLANES = {
  starter: {
    nombre: "Starter",
    incluye: ["resumen", "leads", "llamadas", "equipo", "ajustes", "estado"],
    siguiente: "pro",
  },
  pro: {
    nombre: "Pro",
    // Pro lo abre todo.
    incluye: null,
    siguiente: null,
  },
  premium: { nombre: "Premium", incluye: null, siguiente: null },
  enterprise: { nombre: "Enterprise", incluye: null, siguiente: null },
};

/** Qué se le da a alguien cuyo plan no reconocemos: lo mínimo, nunca todo. */
const PLAN_POR_DEFECTO = "starter";

function planDe(cliente) {
  const bruto = String(cliente?.plan || "").toLowerCase().trim();
  return PLANES[bruto] ? bruto : PLAN_POR_DEFECTO;
}

function vistaIncluida(idVista, plan) {
  const def = PLANES[plan] || PLANES[PLAN_POR_DEFECTO];
  return def.incluye === null || def.incluye.includes(idVista);
}

const VISTAS = [
  { grupo: "Operación" },
  { id: "resumen", label: "Resumen", ico: "◆" },
  { id: "leads", label: "Leads", ico: "◇" },
  { id: "llamadas", label: "Llamadas", ico: "◉" },
  { id: "conversaciones", label: "Conversaciones", ico: "◈", api: "/api/portal/inbox" },

  { grupo: "El agente" },
  { id: "voz", label: "Calidad de voz", ico: "◎", api: "/api/portal/voice-center" },
  { id: "playbooks", label: "Guion comercial", ico: "✎", api: "/api/playbooks" },

  { grupo: "Cuenta" },
  { id: "equipo", label: "Equipo", ico: "○", deps: ["permisos"] },
  { id: "ajustes", label: "Ajustes", ico: "▢" },
  { id: "estado", label: "Estado", ico: "▣", api: "/api/portal/health" },
];

/*
 * Endpoints que alimentan una pantalla sin ser una pantalla.
 *
 * "permisos" no tiene entrada en el menú: sus datos se pintan dentro de
 * Equipo, porque es información de las mismas personas y no merecía una
 * pantalla propia.
 */
const VISTAS_OCULTAS = [
  { id: "permisos", api: "/api/portal/access-center" },
];


const ETIQUETA_ESTADO = {
  new: { txt: "Nuevo", t: "grey" },
  contacted: { txt: "Contactado", t: "warn" },
  qualified: { txt: "Cualificado", t: "ok" },
  won: { txt: "Ganado", t: "ok" },
  lost: { txt: "Perdido", t: "bad" },
};

function num(valor) {
  const n = Number(valor || 0);
  return n.toLocaleString("es-ES");
}

function eur(valor) {
  return `${Math.round(Number(valor || 0)).toLocaleString("es-ES")} €`;
}

function duracion(segundos) {
  const s = Math.max(0, Math.round(Number(segundos || 0)));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function fecha(valor) {
  if (!valor) return "—";
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Cualquier 401 significa sesión caducada: volvemos al login conservando el destino. */
async function pedir(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) {
    window.location.replace("/login?next=/portal");
    return null;
  }
  const json = await res.json().catch(() => null);
  if (!json?.success) throw new Error(json?.message || "No se pudo cargar la información.");
  return json;
}

/* ── piezas ──────────────────────────────────────────────────────────── */

function Tarjeta({ label, valor, detalle, retraso = 0 }) {
  return (
    <div className="pv3-card" style={{ animationDelay: `${retraso}ms` }}>
      <div className="pv3-lab">{label}</div>
      <div className="pv3-stat">{valor}</div>
      {detalle ? <div className="pv3-det">{detalle}</div> : null}
    </div>
  );
}

function Tag({ estado }) {
  const e = ETIQUETA_ESTADO[estado] || { txt: estado || "—", t: "grey" };
  return <span className="pv3-tag" data-t={e.t}>{e.txt}</span>;
}

function Vacio({ children }) {
  return <div className="pv3-empty">{children}</div>;
}

function Cabecera({ eyebrow, titulo, sub }) {
  return (
    <div>
      <span className="pv3-eyebrow">{eyebrow}</span>
      <h1 className="pv3-h1">{titulo}</h1>
      {sub ? <p className="pv3-sub">{sub}</p> : null}
    </div>
  );
}

/* ── escritura ────────────────────────────────────────────────────────
   Todo lo que cambia datos pasa por aquí. Se centraliza para que el
   tratamiento de errores, el 401 y el mismo-origen sean idénticos en las
   veinte acciones del portal en vez de repetirse veinte veces.
   -------------------------------------------------------------------- */

async function enviar(url, metodo, cuerpo) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo ?? {}),
  });

  if (res.status === 401) {
    window.location.replace("/login?next=/portal");
    return null;
  }

  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || "La acción no se pudo completar.");
  }
  return json;
}

/** Botón que se bloquea mientras trabaja y cuenta lo que ha pasado. */
function Accion({ children, onRun, variante, confirmar, ...resto }) {
  const [estado, setEstado] = useState(null); // null | "trabajando" | "ok" | mensaje
  const vivo = useRef(true);

  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  async function pulsar() {
    if (confirmar && !window.confirm(confirmar)) return;
    setEstado("trabajando");
    try {
      await onRun();
      if (!vivo.current) return;
      setEstado("ok");
      window.setTimeout(() => { if (vivo.current) setEstado(null); }, 2600);
    } catch (e) {
      if (!vivo.current) return;
      setEstado(e?.message || "Error");
    }
  }

  return (
    <span className="pv3-accion">
      <button
        type="button"
        className="pv3-btn"
        data-v={variante}
        onClick={pulsar}
        disabled={estado === "trabajando"}
        {...resto}
      >
        {estado === "trabajando" ? "…" : children}
      </button>
      {estado && estado !== "trabajando" ? (
        <span className="pv3-tag" data-t={estado === "ok" ? "ok" : "bad"} role="status">
          {estado === "ok" ? "Hecho" : estado}
        </span>
      ) : null}
    </span>
  );
}

/** Campo de formulario con etiqueta, en el estilo del portal. */
function Campo({ label, children }) {
  return (
    <label className="pv3-campo">
      <span className="pv3-lab">{label.toUpperCase()}</span>
      {children}
    </label>
  );
}

/* ── ficha de lead ───────────────────────────────────────────────────── */

const ESTADOS_LEAD = ["new", "contacted", "qualified", "won", "lost"];

/**
 * Panel lateral de un lead: cambia estado y responsable, apunta notas y
 * comentarios, pone recordatorios y manda el SMS de seguimiento.
 */
function FichaLead({ lead, usuarios, onCerrar, onCambiado }) {
  const [estado, setEstado] = useState(lead.status || "new");
  const [owner, setOwner] = useState(lead.owner || "");
  const [valor, setValor] = useState(lead.valor_estimado ?? "");
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  const [recordatorio, setRecordatorio] = useState("");
  const [cuando, setCuando] = useState("");
  const [sms, setSms] = useState("");
  const [historial, setHistorial] = useState({ notas: [], comentarios: [], recordatorios: [] });

  // El historial se pide al abrir la ficha, no con la lista: son tres
  // consultas por lead y cargarlas para los 200 de la tabla no tiene sentido.
  useEffect(() => {
    let vivo = true;
    const q = `?lead_id=${encodeURIComponent(lead.id)}`;
    Promise.all([
      fetch(`/api/lead-notes${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/lead-comments${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/lead-reminders${q}`).then((r) => r.json()).catch(() => null),
    ]).then(([n, c, r]) => {
      if (!vivo) return;
      setHistorial({
        notas: n?.data || [],
        comentarios: c?.data || [],
        recordatorios: r?.data || [],
      });
    });
    return () => { vivo = false; };
  }, [lead.id]);

  return (
    <aside className="pv3-ficha" aria-label={`Ficha de ${lead.nombre || "lead"}`}>
      <div className="pv3-row">
        <div>
          <div className="pv3-lab">FICHA DE LEAD</div>
          <h3 className="pv3-ficha-nombre">{lead.nombre || "Sin nombre"}</h3>
        </div>
        <button type="button" className="pv3-btn" onClick={onCerrar}>Cerrar</button>
      </div>

      <div className="pv3-det" style={{ marginTop: 8 }}>
        {lead.telefono || "—"}
        {lead.email ? ` · ${lead.email}` : ""}
        {lead.ciudad ? ` · ${lead.ciudad}` : ""}
        {" · alta "}{fecha(lead.created_at)}
      </div>

      {lead.interes ? <p className="pv3-p" style={{ marginTop: 14 }}>{lead.interes}</p> : null}

      <h4 className="pv3-h4">Estado</h4>
      <div className="pv3-form">
        <Campo label="Fase">
          <select className="pv3-input" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS_LEAD.map((s) => (
              <option key={s} value={s}>{ETIQUETA_ESTADO[s].txt}</option>
            ))}
          </select>
        </Campo>

        <Campo label="Responsable">
          <select className="pv3-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Sin asignar</option>
            {usuarios.map((u) => {
              const n = u.full_name || u.name || u.email;
              return <option key={u.id || u.email} value={n}>{n}</option>;
            })}
          </select>
        </Campo>

        <Campo label="Valor estimado (€)">
          <input
            className="pv3-input"
            type="number"
            min="0"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </Campo>
      </div>

      <Accion
        variante="light"
        onRun={async () => {
          await enviar("/api/leads/update", "PATCH", {
            leadId: lead.id,
            status: estado,
            owner: owner || null,
            valor_estimado: valor === "" ? null : Number(valor),
          });
          onCambiado();
        }}
      >
        Guardar cambios
      </Accion>

      <h4 className="pv3-h4">Nota interna</h4>
      <textarea
        className="pv3-input"
        rows={3}
        placeholder="Lo que conviene recordar de este lead…"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />
      <Accion
        onRun={async () => {
          if (!nota.trim()) throw new Error("Escribe la nota primero.");
          await enviar("/api/lead-notes", "POST", { lead_id: lead.id, body: nota });
          setNota("");
          onCambiado();
        }}
      >
        Añadir nota
      </Accion>
      <Historial items={historial.notas} campo="body" vacio="Sin notas." />

      <h4 className="pv3-h4">Comentario para el equipo</h4>
      <textarea
        className="pv3-input"
        rows={2}
        placeholder="Visible para el resto del equipo…"
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
      />
      <Accion
        onRun={async () => {
          if (!comentario.trim()) throw new Error("Escribe el comentario primero.");
          await enviar("/api/lead-comments", "POST", { lead_id: lead.id, body: comentario });
          setComentario("");
          onCambiado();
        }}
      >
        Comentar
      </Accion>
      <Historial items={historial.comentarios} campo="body" vacio="Sin comentarios." />

      <h4 className="pv3-h4">Recordatorio</h4>
      <div className="pv3-form">
        <Campo label="Qué hay que hacer">
          <input
            className="pv3-input"
            placeholder="Llamar para confirmar la cita"
            value={recordatorio}
            onChange={(e) => setRecordatorio(e.target.value)}
          />
        </Campo>
        <Campo label="Cuándo">
          <input
            className="pv3-input"
            type="datetime-local"
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
          />
        </Campo>
      </div>
      <Accion
        onRun={async () => {
          if (!recordatorio.trim() || !cuando) throw new Error("Faltan el texto y la fecha.");
          await enviar("/api/lead-reminders", "POST", {
            lead_id: lead.id,
            title: recordatorio,
            remind_at: new Date(cuando).toISOString(),
            assigned_to: owner || null,
          });
          setRecordatorio("");
          setCuando("");
          onCambiado();
        }}
      >
        Programar
      </Accion>
      <Historial items={historial.recordatorios} campo="title" vacio="Sin recordatorios." />

      <h4 className="pv3-h4">SMS de seguimiento</h4>
      <textarea
        className="pv3-input"
        rows={3}
        placeholder="Hola, le escribimos por el presupuesto que nos pidió…"
        value={sms}
        onChange={(e) => setSms(e.target.value)}
      />
      <div className="pv3-det">
        Se envía a {lead.telefono || "—"}. {sms.length} caracteres.
      </div>
      <Accion
        confirmar={`¿Enviar este SMS a ${lead.telefono}?`}
        onRun={async () => {
          if (!sms.trim()) throw new Error("Escribe el mensaje primero.");
          if (!lead.telefono) throw new Error("Este lead no tiene teléfono.");
          await enviar("/api/followup/sms", "POST", {
            leadId: lead.id,
            to: lead.telefono,
            message: sms,
          });
          setSms("");
          onCambiado();
        }}
      >
        Enviar SMS
      </Accion>
    </aside>
  );
}

/** Lista corta de notas/comentarios/recordatorios ya existentes. */
function Historial({ items, campo, vacio }) {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="pv3-small" style={{ marginTop: 10 }}>{vacio}</p>;
  }
  return (
    <div className="pv3-historial">
      {items.slice(0, 6).map((it, i) => (
        <div key={it.id || i} className="pv3-historial-item">
          <p className="pv3-p" style={{ fontSize: 13 }}>{it[campo] || "—"}</p>
          <span className="pv3-small">
            {it.author || it.created_by || "—"} · {fecha(it.created_at || it.remind_at)}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ── vistas ──────────────────────────────────────────────────────────── */

function Resumen({ datos }) {
  const m = datos.metrics || {};
  const pipeline = datos.pipeline || {};

  // Llamadas por día de los últimos 14 días, para la barra.
  const serie = useMemo(() => {
    const dias = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      dias.push({ clave: d.toISOString().slice(0, 10), n: 0 });
    }
    const indice = new Map(dias.map((d, i) => [d.clave, i]));
    for (const c of datos.calls || []) {
      const clave = String(c.created_at || "").slice(0, 10);
      const i = indice.get(clave);
      if (i !== undefined) dias[i].n += 1;
    }
    return dias;
  }, [datos.calls]);

  const maximo = Math.max(1, ...serie.map((d) => d.n));
  const totalSerie = serie.reduce((a, d) => a + d.n, 0);

  // La más reciente de todas, para poder situar al usuario cuando no hay
  // nada en la ventana de dos semanas.
  const ultimaLlamada = (datos.calls || [])[0]?.created_at || null;

  return (
    <div className="pv3-view">
      <div className="pv3-grid" data-c="4">
        <Tarjeta label="LLAMADAS" valor={num(m.totalCalls)} detalle={`${duracion(m.avgDuration)} de media`} retraso={0} />
        <Tarjeta label="LEADS" valor={num(m.totalLeads)} detalle={`${num(m.hotLeads)} calientes`} retraso={60} />
        <Tarjeta label="CONVERSIÓN" valor={`${num(m.conversionRate)}%`} detalle={`${num(m.wonLeads)} ganados`} retraso={120} />
        <Tarjeta label="PIPELINE" valor={eur(m.totalPotentialRevenue)} detalle="Valor potencial estimado" retraso={180} />
      </div>

      <div className="pv3-grid" data-c="2">
        <div className="pv3-card">
          <div className="pv3-lab">ACTIVIDAD · 14 DÍAS</div>

          {/* Una gráfica con todas las barras a cero se lee como algo roto,
              no como "no ha pasado nada". Mejor decirlo con palabras. */}
          {totalSerie === 0 ? (
            <>
              <p className="pv3-p" style={{ marginTop: 16 }}>
                No ha entrado ninguna llamada en las dos últimas semanas.
              </p>
              {ultimaLlamada ? (
                <div className="pv3-det">La última fue el {fecha(ultimaLlamada)}.</div>
              ) : (
                <div className="pv3-det">Todavía no hay ninguna llamada registrada.</div>
              )}
            </>
          ) : (
            <>
              <div className="pv3-chart">
                {serie.map((d, i) => (
                  <i
                    key={d.clave}
                    title={`${d.clave}: ${d.n}`}
                    style={{ height: `${Math.max(3, (d.n / maximo) * 100)}%`, animationDelay: `${i * 35}ms`, opacity: d.n ? 1 : 0.22 }}
                  />
                ))}
              </div>
              <div className="pv3-det">{num(totalSerie)} llamadas en las últimas dos semanas</div>
            </>
          )}
        </div>

        <div className="pv3-card">
          <div className="pv3-lab">EMBUDO</div>
          <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
            {["new", "contacted", "qualified", "won", "lost"].map((clave) => {
              const total = Math.max(1, Number(m.totalLeads || 0));
              const n = Number(pipeline[clave] || 0);
              return (
                <div key={clave}>
                  <div className="pv3-row" style={{ marginBottom: 6 }}>
                    <span className="pv3-small">{ETIQUETA_ESTADO[clave].txt}</span>
                    <span className="pv3-strong">{num(n)}</span>
                  </div>
                  <div className="pv3-track"><div className="pv3-fill" style={{ width: `${(n / total) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <h2 className="pv3-h2">Alertas abiertas</h2>
      {(datos.alerts || []).length === 0 ? (
        <Vacio>Ninguna alerta activa. Todo va según lo previsto.</Vacio>
      ) : (
        <div className="pv3-grid" data-c="3">
          {(datos.alerts || []).slice(0, 6).map((a, i) => (
            <div key={a.id || i} className="pv3-card" style={{ animationDelay: `${i * 50}ms` }}>
              <span className="pv3-tag" data-t={a.severity === "high" ? "bad" : a.severity === "medium" ? "warn" : "grey"}>
                {a.severity || "info"}
              </span>
              <p className="pv3-p" style={{ marginTop: 10 }}>{a.message || a.title || "Alerta"}</p>
              <div className="pv3-det">{fecha(a.created_at)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Leads({ datos, onRecargar }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [abierto, setAbierto] = useState(null);
  // El embudo era una pantalla aparte. Son los mismos leads mirados de otra
  // forma, así que vive aquí como un cambio de vista.
  const [forma, setForma] = useState("tabla");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos.leads || []).filter((l) => {
      if (filtro !== "todos" && (l.status || "new") !== filtro) return false;
      if (!q) return true;
      return [l.nombre, l.telefono, l.email, l.ciudad, l.interes]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [datos.leads, busqueda, filtro]);

  // Se busca por id en cada render en vez de guardar el objeto: tras guardar
  // y recargar, la ficha refleja el dato nuevo sin sincronizar nada a mano.
  const leadAbierto = useMemo(
    () => (datos.leads || []).find((l) => l.id === abierto) || null,
    [datos.leads, abierto]
  );

  return (
    <div className="pv3-view">
      <div className="pv3-row" style={{ marginTop: 22, flexWrap: "wrap" }}>
        <input
          className="pv3-input"
          style={{ maxWidth: 300 }}
          placeholder="Buscar por nombre, teléfono, ciudad…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["todos", "new", "contacted", "qualified", "won", "lost"].map((f) => (
            <button
              key={f}
              type="button"
              className="pv3-btn"
              data-v={filtro === f ? "light" : undefined}
              onClick={() => setFiltro(f)}
            >
              {f === "todos" ? "Todos" : ETIQUETA_ESTADO[f].txt}
            </button>
          ))}
          <a className="pv3-btn" href="/api/leads/export">Exportar CSV</a>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        <button type="button" className="pv3-btn" data-v={forma === "tabla" ? "light" : undefined}
          onClick={() => setForma("tabla")}>Lista</button>
        <button type="button" className="pv3-btn" data-v={forma === "embudo" ? "light" : undefined}
          onClick={() => setForma("embudo")}>Embudo</button>
      </div>

      {forma === "embudo" ? (
        <Embudo leads={visibles} onAbrir={setAbierto} />
      ) : visibles.length === 0 ? (
        <div style={{ marginTop: 16 }}><Vacio>No hay leads que encajen con este filtro.</Vacio></div>
      ) : (
        <div className="pv3-tablewrap" style={{ marginTop: 16 }}>
          <table className="pv3-table">
            <thead>
              <tr>
                <th>NOMBRE</th><th>TELÉFONO</th><th>ESTADO</th><th>SCORE</th>
                <th>VALOR</th><th>INTERÉS</th><th>SIGUIENTE PASO</th><th>ALTA</th>
              </tr>
            </thead>
            <tbody>
              {visibles.slice(0, 200).map((l, i) => (
                <tr
                  key={l.id || i}
                  className="pv3-fila"
                  tabIndex={0}
                  role="button"
                  aria-label={`Abrir ficha de ${l.nombre || "lead"}`}
                  onClick={() => setAbierto(l.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setAbierto(l.id);
                    }
                  }}
                >
                  <td className="pv3-strong">{l.nombre || l.customer_name || "Sin nombre"}</td>
                  <td>{l.telefono || l.phone || "—"}</td>
                  <td><Tag estado={l.status || "new"} /></td>
                  <td>{l.score != null ? num(l.score) : "—"}</td>
                  <td>{l.valor_estimado ? eur(l.valor_estimado) : "—"}</td>
                  <td style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{l.interes || "—"}</td>
                  <td style={{ maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis" }}>{l.next_action || l.proxima_accion || "—"}</td>
                  <td>{fecha(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pv3-det" style={{ marginTop: 10 }}>
        {num(visibles.length)} de {num((datos.leads || []).length)} leads
        {visibles.length > 200 ? " · se muestran los 200 más recientes" : ""}
        {" · pulsa una fila para abrir su ficha"}
      </div>

      {leadAbierto ? (
        <FichaLead
          key={leadAbierto.id}
          lead={leadAbierto}
          usuarios={datos.users || []}
          onCerrar={() => setAbierto(null)}
          onCambiado={onRecargar}
        />
      ) : null}
    </div>
  );
}

function Llamadas({ datos }) {
  const [abierta, setAbierta] = useState(null);
  const llamadas = datos.calls || [];

  return (
    <div className="pv3-view">
      {llamadas.length === 0 ? (
        <div style={{ marginTop: 22 }}><Vacio>Todavía no se ha registrado ninguna llamada.</Vacio></div>
      ) : (
        <div className="pv3-tablewrap" style={{ marginTop: 22 }}>
          <table className="pv3-table">
            <thead>
              <tr><th>FECHA</th><th>ORIGEN</th><th>DESTINO</th><th>DURACIÓN</th><th>LEAD</th><th>RESUMEN</th><th /></tr>
            </thead>
            <tbody>
              {llamadas.slice(0, 200).map((c, i) => (
                <tr key={c.id || i}>
                  <td>{fecha(c.created_at)}</td>
                  <td>{c.from_number || "—"}</td>
                  <td>{c.to_number || "—"}</td>
                  <td>{duracion(c.duration_seconds)}</td>
                  <td>{c.lead_captured ? <span className="pv3-tag" data-t="ok">Sí</span> : <span className="pv3-tag" data-t="grey">No</span>}</td>
                  <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}>{c.summary || "—"}</td>
                  <td>
                    {c.transcript || c.recording_url ? (
                      <button type="button" className="pv3-btn" onClick={() => setAbierta(abierta === i ? null : i)}>
                        {abierta === i ? "Cerrar" : "Ver"}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {abierta != null && llamadas[abierta] ? (
        <div className="pv3-card" style={{ marginTop: 16 }}>
          <div className="pv3-lab">LLAMADA · {fecha(llamadas[abierta].created_at)}</div>
          {llamadas[abierta].recording_url ? (
            <audio controls src={llamadas[abierta].recording_url} style={{ width: "100%", marginTop: 14 }} />
          ) : null}
          {llamadas[abierta].transcript ? (
            <pre style={{ marginTop: 14, whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.65, color: "var(--dim)" }}>
              {llamadas[abierta].transcript}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const COLUMNAS_PIPELINE = ["new", "contacted", "qualified", "won", "lost"];

/** Los mismos leads en columnas por fase. Antes era una pantalla aparte. */
function Embudo({ leads, onAbrir }) {
  const porEstado = useMemo(() => {
    const mapa = Object.fromEntries(COLUMNAS_PIPELINE.map((c) => [c, []]));
    for (const l of leads || []) {
      const s2 = l.status || "new";
      if (mapa[s2]) mapa[s2].push(l);
    }
    return mapa;
  }, [leads]);

  return (
    <div className="pv3-grid" data-c="3" style={{ alignItems: "start" }}>
      {COLUMNAS_PIPELINE.map((clave, ci) => (
        <div key={clave} className="pv3-card" style={{ animationDelay: `${ci * 60}ms` }}>
          <div className="pv3-row">
            <span className="pv3-lab">{ETIQUETA_ESTADO[clave].txt.toUpperCase()}</span>
            <span className="pv3-strong">{num(porEstado[clave].length)}</span>
          </div>
          <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
            {porEstado[clave].length === 0 ? (
              <span className="pv3-small">Vacío</span>
            ) : (
              porEstado[clave].slice(0, 12).map((l, i) => (
                <button
                  key={l.id || i}
                  type="button"
                  onClick={() => onAbrir(l.id)}
                  style={{
                    padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12,
                    background: "rgba(0,0,0,0.35)", textAlign: "left", cursor: "pointer",
                    font: "inherit", color: "inherit", width: "100%",
                  }}
                >
                  <div className="pv3-strong" style={{ fontSize: 13 }}>{l.nombre || "Sin nombre"}</div>
                  <div className="pv3-small" style={{ marginTop: 3 }}>
                    {l.telefono || "—"}{l.valor_estimado ? ` · ${eur(l.valor_estimado)}` : ""}
                  </div>
                </button>
              ))
            )}
            {porEstado[clave].length > 12 ? (
              <span className="pv3-small">+{num(porEstado[clave].length - 12)} más</span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function Voz({ voz, cargando }) {
  if (cargando) return <div className="pv3-grid" data-c="4">{[0, 1, 2, 3].map((i) => <div key={i} className="pv3-skel" />)}</div>;
  if (!voz) return <div style={{ marginTop: 22 }}><Vacio>No se pudo cargar el análisis de voz.</Vacio></div>;

  const s = voz.summary || {};
  const c = voz.compliance || {};

  return (
    <div className="pv3-view">
      <div className="pv3-grid" data-c="4">
        <Tarjeta label="ANALIZADAS" valor={num(s.total)} detalle={`${num(s.withRecording)} con grabación`} />
        <Tarjeta label="CALIDAD MEDIA" valor={`${num(s.avgScore)}`} detalle="Sobre 100" retraso={60} />
        <Tarjeta label="CUMPLIMIENTO" valor={`${num(s.avgCompliance)}`} detalle="Sobre 100" retraso={120} />
        <Tarjeta label="LEADS CAPTADOS" valor={num(s.capturedLeads)} detalle={`${duracion(s.avgDuration)} de media`} retraso={180} />
      </div>

      <div className="pv3-grid" data-c="2">
        <div className="pv3-card">
          <div className="pv3-lab">INCIDENCIAS FRECUENTES</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {(voz.commonIssues || []).length === 0 ? <span className="pv3-small">Sin incidencias detectadas.</span> : null}
            {(voz.commonIssues || []).map((it, i) => (
              <div key={i} className="pv3-row">
                <span className="pv3-small">{it.label}</span>
                <span className="pv3-strong">{num(it.count)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pv3-card">
          <div className="pv3-lab">OBJECIONES MÁS OÍDAS</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {(voz.commonObjections || []).length === 0 ? <span className="pv3-small">Sin objeciones registradas.</span> : null}
            {(voz.commonObjections || []).map((it, i) => (
              <div key={i} className="pv3-row">
                <span className="pv3-small">{it.label}</span>
                <span className="pv3-strong">{num(it.count)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="pv3-h2">Llamada a llamada</h2>
      {(voz.calls || []).length === 0 ? (
        <Vacio>Todavía no hay llamadas puntuadas.</Vacio>
      ) : (
        <div className="pv3-tablewrap">
          <table className="pv3-table">
            <thead>
              <tr><th>FECHA</th><th>NOTA</th><th>CUMPLIMIENTO</th><th>DURACIÓN</th><th>LEAD</th><th>RESUMEN</th></tr>
            </thead>
            <tbody>
              {(voz.calls || []).slice(0, 60).map((c, i) => {
                const nota = Number(c.qa?.overall || 0);
                return (
                  <tr key={c.id || i}>
                    <td>{fecha(c.created_at)}</td>
                    <td><span className="pv3-tag" data-t={nota >= 75 ? "ok" : nota >= 55 ? "warn" : "bad"}>{num(nota)}</span></td>
                    <td>{num(c.compliance?.score)}</td>
                    <td>{duracion(c.duration_seconds)}</td>
                    <td>{c.lead_captured ? "Sí" : "No"}</td>
                    <td style={{ maxWidth: 340, overflow: "hidden", textOverflow: "ellipsis" }}>{c.summary || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="pv3-h2">Política de retención</h2>
      <div className="pv3-card">
        <p className="pv3-p">
          Las grabaciones se conservan {num(c.recordingRetentionDays ?? c.recordingsRetentionDays)} días y las
          transcripciones {num(c.transcriptRetentionDays ?? c.transcriptsRetentionDays)} días.
          {c.announcementRequired === false ? "" : " Cada llamada se anuncia al interlocutor antes de grabar."}
        </p>
      </div>
    </div>
  );
}

function Estado({ salud, cargando }) {
  if (cargando) return <div className="pv3-grid" data-c="3">{[0, 1, 2].map((i) => <div key={i} className="pv3-skel" />)}</div>;
  if (!salud) return <div style={{ marginTop: 22 }}><Vacio>No se pudo cargar el estado del sistema.</Vacio></div>;

  const nivelTag = (n) => (n === "healthy" || n === "ok" ? "ok" : n === "warning" ? "warn" : "bad");
  const servicios = Object.entries(salud.services || {});

  return (
    <div className="pv3-view">
      <div className="pv3-card" style={{ marginTop: 22 }}>
        <div className="pv3-row">
          <span className="pv3-lab">DIAGNÓSTICO</span>
          <span className="pv3-tag" data-t={nivelTag(salud.summary?.level)}>{salud.summary?.level || "—"}</span>
        </div>
        <p className="pv3-p" style={{ marginTop: 10 }}>{salud.summary?.message}</p>
      </div>

      <h2 className="pv3-h2">Servicios</h2>
      <div className="pv3-grid" data-c="3" style={{ marginTop: 0 }}>
        {servicios.map(([clave, item], i) => (
          <div key={clave} className="pv3-card" style={{ animationDelay: `${i * 45}ms` }}>
            <div className="pv3-row">
              <span className="pv3-lab">{clave.toUpperCase()}</span>
              <span className="pv3-tag" data-t={nivelTag(item.level)}>{item.level}</span>
            </div>
            {item.message ? <p className="pv3-p" style={{ marginTop: 10 }}>{item.message}</p> : null}
          </div>
        ))}
      </div>

      <h2 className="pv3-h2">Frescura de datos</h2>
      <div className="pv3-grid" data-c="2" style={{ marginTop: 0 }}>
        {["leads", "calls"].map((clave) => {
          const f = salud.freshness?.[clave] || {};
          return (
            <div key={clave} className="pv3-card">
              <div className="pv3-row">
                <span className="pv3-lab">{clave.toUpperCase()}</span>
                <span className="pv3-tag" data-t={nivelTag(f.level)}>{f.level || "—"}</span>
              </div>
              <p className="pv3-p" style={{ marginTop: 10 }}>{f.message || `Último registro: ${fecha(f.last || f.lastAt)}`}</p>
            </div>
          );
        })}
      </div>

      <h2 className="pv3-h2">Integraciones</h2>
      <div className="pv3-tablewrap">
        <table className="pv3-table">
          <thead><tr><th>INTEGRACIÓN</th><th>ESTADO</th><th>FALTA (OBLIGATORIO)</th><th>FALTA (RECOMENDADO)</th></tr></thead>
          <tbody>
            {(salud.env?.features || []).map((f) => (
              <tr key={f.id}>
                <td className="pv3-strong">{f.label}</td>
                <td><span className="pv3-tag" data-t={nivelTag(f.status)}>{f.status}</span></td>
                <td>{num(f.requiredMissing)}</td>
                <td>{num(f.recommendedMissing)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Equipo({ datos, onRecargar, acceso }) {
  const usuarios = datos.users || [];
  const [nuevo, setNuevo] = useState({ full_name: "", email: "", role: "agent", phone: "", password: "" });
  const [reinicio, setReinicio] = useState({});

  return (
    <div className="pv3-view">
      <h2 className="pv3-h2" style={{ marginTop: 22 }}>Dar de alta a alguien</h2>
      <div className="pv3-card">
        <div className="pv3-form">
          <Campo label="Nombre">
            <input className="pv3-input" value={nuevo.full_name}
              onChange={(e) => setNuevo({ ...nuevo, full_name: e.target.value })} />
          </Campo>
          <Campo label="Email">
            <input className="pv3-input" type="email" autoComplete="off" value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
          </Campo>
          <Campo label="Teléfono">
            <input className="pv3-input" type="tel" value={nuevo.phone}
              onChange={(e) => setNuevo({ ...nuevo, phone: e.target.value })} />
          </Campo>
          <Campo label="Rol">
            <select className="pv3-input" value={nuevo.role}
              onChange={(e) => setNuevo({ ...nuevo, role: e.target.value })}>
              <option value="agent">Agente — trabaja leads</option>
              <option value="manager">Manager — además ve informes</option>
              <option value="admin">Admin — además configura</option>
              <option value="owner">Owner — control total</option>
            </select>
          </Campo>
          <Campo label="Contraseña inicial">
            <input className="pv3-input" type="password" autoComplete="new-password" value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} />
          </Campo>
        </div>

        <p className="pv3-det">
          Admin y owner tendrán que confirmar cada acceso con un código enviado por email.
        </p>

        <Accion
          variante="light"
          onRun={async () => {
            if (!nuevo.email.trim() || !nuevo.password) {
              throw new Error("Hacen falta al menos el email y la contraseña.");
            }
            await enviar("/api/portal/users/create", "POST", nuevo);
            setNuevo({ full_name: "", email: "", role: "agent", phone: "", password: "" });
            await onRecargar();
          }}
        >
          Crear usuario
        </Accion>
      </div>

      <h2 className="pv3-h2">Quién tiene acceso</h2>
      {usuarios.length === 0 ? (
        <div style={{ marginTop: 22 }}><Vacio>No hay usuarios dados de alta.</Vacio></div>
      ) : (
        <div className="pv3-tablewrap" style={{ marginTop: 22 }}>
          <table className="pv3-table">
            <thead>
              <tr><th>NOMBRE</th><th>EMAIL</th><th>ROL</th><th>ESTADO</th><th>ALTA</th><th>ACCIONES</th></tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id || i}>
                  <td className="pv3-strong">{u.name || u.full_name || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td>
                    <select
                      className="pv3-input"
                      style={{ padding: "5px 30px 5px 10px", fontSize: 12.5 }}
                      defaultValue={u.role || "agent"}
                      aria-label={`Rol de ${u.email}`}
                      onChange={async (e) => {
                        await enviar("/api/portal/users/update", "PATCH", { id: u.id, role: e.target.value });
                        await onRecargar();
                      }}
                    >
                      {["agent", "manager", "admin", "owner"].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <span className="pv3-tag" data-t={u.is_active === false ? "bad" : "ok"}>
                      {u.is_active === false ? "Inactivo" : "Activo"}
                    </span>
                  </td>
                  <td>{fecha(u.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                      <Accion
                        confirmar={
                          u.is_active === false
                            ? `¿Reactivar el acceso de ${u.email}?`
                            : `¿Quitar el acceso a ${u.email}?`
                        }
                        onRun={async () => {
                          await enviar("/api/portal/users/update", "PATCH", {
                            id: u.id,
                            is_active: u.is_active === false,
                          });
                          await onRecargar();
                        }}
                      >
                        {u.is_active === false ? "Reactivar" : "Desactivar"}
                      </Accion>

                      <input
                        className="pv3-input"
                        type="password"
                        autoComplete="new-password"
                        placeholder="Nueva contraseña (10+)"
                        style={{ width: 160, padding: "6px 11px", fontSize: 12.5 }}
                        aria-label={`Nueva contraseña de ${u.email}`}
                        value={reinicio[u.id] || ""}
                        onChange={(e) => setReinicio({ ...reinicio, [u.id]: e.target.value })}
                      />
                      <Accion
                        onRun={async () => {
                          const clave = reinicio[u.id] || "";
                          if (clave.length < 10) throw new Error("Mínimo 10 caracteres.");
                          await enviar("/api/portal/users/reset-password", "POST", {
                            userId: u.id,
                            password: clave,
                          });
                          setReinicio({ ...reinicio, [u.id]: "" });
                        }}
                      >
                        Cambiar
                      </Accion>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="pv3-h2">Qué puede hacer cada uno</h2>
      {(() => {
        /* Era una pantalla aparte. Es información de las mismas personas, así
           que va debajo de la tabla de acceso en vez de en otro sitio. */
        const matriz = acceso?.permissionMatrix || {};
        const catalogo = matriz.catalog || [];
        const filas = matriz.rows || [];

        if (!acceso) return <Vacio>Cargando permisos…</Vacio>;
        if (filas.length === 0) return <Vacio>Todavía no hay nadie con acceso al portal.</Vacio>;

        return (
          <div className="pv3-tablewrap">
            <table className="pv3-table">
              <thead>
                <tr>
                  <th>USUARIO</th><th>ROL</th>
                  {catalogo.map((c) => (
                    <th key={c.id} title={c.description || c.label}>
                      {String(c.label || c.id).toUpperCase()}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.userId || f.email}>
                    <td className="pv3-strong">{f.email || "—"}</td>
                    <td><span className="pv3-tag" data-t="grey">{f.role || "viewer"}</span></td>
                    {(f.grants || []).map((g) => (
                      <td key={g.id}>
                        <span className="pv3-tag" data-t={g.enabled ? "ok" : "grey"}>
                          {g.enabled ? "Sí" : "No"}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })()}

      <h2 className="pv3-h2">Registro de actividad</h2>
      {(datos.auditLogs || []).length === 0 ? (
        <Vacio>Sin actividad registrada.</Vacio>
      ) : (
        <div className="pv3-tablewrap">
          <table className="pv3-table">
            <thead><tr><th>FECHA</th><th>ACTOR</th><th>ACCIÓN</th><th>DETALLE</th></tr></thead>
            <tbody>
              {(datos.auditLogs || []).slice(0, 50).map((a, i) => (
                <tr key={a.id || i}>
                  <td>{fecha(a.created_at)}</td>
                  <td>{a.actor_email || a.actor || "—"}</td>
                  <td className="pv3-strong">{a.action || "—"}</td>
                  <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis" }}>
                    {typeof a.details === "string" ? a.details : a.details ? JSON.stringify(a.details) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Ajustes({ datos, onRecargar }) {
  const c = datos.client || {};
  const s = datos.settings || {};
  const [ocupado, setOcupado] = useState(false);

  const [obj, setObj] = useState({
    monthly_target_leads: s.monthly_target_leads ?? 25,
    monthly_target_conversion: s.monthly_target_conversion ?? 20,
    default_deal_value: s.default_deal_value ?? 250,
    realtime_refresh_seconds: s.realtime_refresh_seconds ?? 15,
    daily_report_email: s.daily_report_email || "",
    weekly_report_email: s.weekly_report_email || "",
  });

  const [marca, setMarca] = useState({
    brand_name: c.brand_name || "",
    tagline: c.tagline || "",
    industry: c.industry || "",
    owner_email: c.owner_email || "",
    brand_logo_url: c.brand_logo_url || "",
    primary_color: c.primary_color || "#ffffff",
    secondary_color: c.secondary_color || "#030303",
  });

  const [dominio, setDominio] = useState(c.custom_domain || "");

  async function abrirFacturacion() {
    setOcupado(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (json?.url) { window.location.href = json.url; return; }
      alert(json?.message || "El portal de facturación no está disponible ahora mismo.");
    } catch (e) {
      alert(e?.message || "No se pudo abrir la facturación.");
    } finally {
      setOcupado(false);
    }
  }

  const filas = [
    ["Marca", c.brand_name || c.name || "—"],
    ["Sector", c.industry || "—"],
    ["Propietario", c.owner_email || "—"],
    ["Número de entrada", c.twilio_number || "Sin asignar"],
    ["Número original", c.original_number || "—"],
    ["Dominio propio", c.custom_domain || "—"],
    ["Estado", c.is_active === false ? "Inactivo" : "Activo"],
  ];

  return (
    <div className="pv3-view">
      <div className="pv3-grid" data-c="2">
        <div className="pv3-card">
          <div className="pv3-lab">CUENTA</div>
          <div style={{ marginTop: 14, display: "grid", gap: 11 }}>
            {filas.map(([k, v]) => (
              <div key={k} className="pv3-row">
                <span className="pv3-small">{k}</span>
                <span className="pv3-strong" style={{ fontSize: 13, textAlign: "right" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="pv3-card">
          <div className="pv3-lab">OBJETIVOS</div>
          <div style={{ marginTop: 14, display: "grid", gap: 11 }}>
            <div className="pv3-row"><span className="pv3-small">Leads al mes</span><span className="pv3-strong">{num(s.monthly_target_leads)}</span></div>
            <div className="pv3-row"><span className="pv3-small">Conversión objetivo</span><span className="pv3-strong">{num(s.monthly_target_conversion)}%</span></div>
            <div className="pv3-row"><span className="pv3-small">Valor por operación</span><span className="pv3-strong">{eur(s.default_deal_value)}</span></div>
            <div className="pv3-row"><span className="pv3-small">Refresco en tiempo real</span><span className="pv3-strong">{num(s.realtime_refresh_seconds)} s</span></div>
          </div>
          <p className="pv3-p" style={{ marginTop: 16, color: "var(--muted)" }}>
            Para cambiar objetivos, marca o plantillas, usa el panel completo en <a href="/portal" style={{ textDecoration: "underline" }}>/portal</a>.
          </p>
        </div>
      </div>

      <h2 className="pv3-h2">Objetivos y avisos</h2>
      <div className="pv3-card">
        <div className="pv3-form">
          <Campo label="Leads al mes">
            <input className="pv3-input" type="number" min="0" value={obj.monthly_target_leads}
              onChange={(e) => setObj({ ...obj, monthly_target_leads: Number(e.target.value) })} />
          </Campo>
          <Campo label="Conversión objetivo (%)">
            <input className="pv3-input" type="number" min="0" max="100" value={obj.monthly_target_conversion}
              onChange={(e) => setObj({ ...obj, monthly_target_conversion: Number(e.target.value) })} />
          </Campo>
          <Campo label="Valor por operación (€)">
            <input className="pv3-input" type="number" min="0" value={obj.default_deal_value}
              onChange={(e) => setObj({ ...obj, default_deal_value: Number(e.target.value) })} />
          </Campo>
          <Campo label="Refresco en directo (s)">
            <input className="pv3-input" type="number" min="5" value={obj.realtime_refresh_seconds}
              onChange={(e) => setObj({ ...obj, realtime_refresh_seconds: Number(e.target.value) })} />
          </Campo>
          <Campo label="Informe diario a">
            <input className="pv3-input" type="email" placeholder="nadie@ejemplo.es" value={obj.daily_report_email}
              onChange={(e) => setObj({ ...obj, daily_report_email: e.target.value })} />
          </Campo>
          <Campo label="Informe semanal a">
            <input className="pv3-input" type="email" placeholder="nadie@ejemplo.es" value={obj.weekly_report_email}
              onChange={(e) => setObj({ ...obj, weekly_report_email: e.target.value })} />
          </Campo>
        </div>
        <Accion variante="light" onRun={async () => {
          await enviar("/api/portal/settings/update", "PATCH", obj);
          await onRecargar();
        }}>
          Guardar objetivos
        </Accion>
      </div>

      <h2 className="pv3-h2">Marca</h2>
      <div className="pv3-card">
        <div className="pv3-form">
          <Campo label="Nombre comercial">
            <input className="pv3-input" value={marca.brand_name}
              onChange={(e) => setMarca({ ...marca, brand_name: e.target.value })} />
          </Campo>
          <Campo label="Eslogan">
            <input className="pv3-input" value={marca.tagline}
              onChange={(e) => setMarca({ ...marca, tagline: e.target.value })} />
          </Campo>
          <Campo label="Sector">
            <input className="pv3-input" value={marca.industry}
              onChange={(e) => setMarca({ ...marca, industry: e.target.value })} />
          </Campo>
          <Campo label="Email del propietario">
            <input className="pv3-input" type="email" value={marca.owner_email}
              onChange={(e) => setMarca({ ...marca, owner_email: e.target.value })} />
          </Campo>
          <Campo label="URL del logotipo">
            <input className="pv3-input" type="url" placeholder="https://…" value={marca.brand_logo_url}
              onChange={(e) => setMarca({ ...marca, brand_logo_url: e.target.value })} />
          </Campo>
          <Campo label="Color principal">
            <input className="pv3-input" type="color" style={{ height: 42, padding: 4 }} value={marca.primary_color}
              onChange={(e) => setMarca({ ...marca, primary_color: e.target.value })} />
          </Campo>
        </div>
        <Accion variante="light" onRun={async () => {
          await enviar("/api/portal/branding/update", "PATCH", marca);
          await onRecargar();
        }}>
          Guardar marca
        </Accion>
      </div>

      <h2 className="pv3-h2">Dominio propio</h2>
      <div className="pv3-card">
        <p className="pv3-p">
          Sirve el portal en tu propio dominio. Después hay que apuntar un CNAME
          desde el panel de tu proveedor de DNS.
        </p>
        <div className="pv3-form">
          <Campo label="Dominio">
            <input className="pv3-input" placeholder="portal.tuempresa.com" value={dominio}
              onChange={(e) => setDominio(e.target.value)} />
          </Campo>
        </div>
        <Accion onRun={async () => {
          if (!dominio.trim()) throw new Error("Escribe el dominio primero.");
          await enviar("/api/portal/domain/connect", "POST", { domain: dominio.trim() });
          await onRecargar();
        }}>
          Conectar dominio
        </Accion>
      </div>

      <h2 className="pv3-h2">Seguridad</h2>
      <div className="pv3-card">
        <p className="pv3-p">
          Cerrar sesión sólo cierra la de este navegador. Si te la has dejado
          abierta en otro sitio, o crees que alguien ha entrado en tu cuenta,
          ciérralas todas: los accesos abiertos dejan de valer al instante,
          incluido este.
        </p>
        <Accion
          confirmar="Se cerrarán todas las sesiones, también la tuya. Tendrás que volver a entrar. ¿Seguir?"
          onRun={async () => {
            await enviar("/api/portal/sesiones/revocar", "POST", {});
            // La sesión actual también queda invalidada, así que se va al login.
            window.location.replace("/login?next=/portal");
          }}
        >
          Cerrar todas las sesiones
        </Accion>
      </div>

      <h2 className="pv3-h2">Facturación</h2>
      <div className="pv3-card">
        <p className="pv3-p">Gestiona tu suscripción, método de pago y facturas en el portal de Stripe.</p>
        <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <button type="button" className="pv3-btn" data-v="light" onClick={abrirFacturacion} disabled={ocupado}>
            {ocupado ? "Abriendo…" : "Abrir facturación"}
          </button>
          <a className="pv3-btn" href="/api/portal/audit/export">Exportar auditoría</a>
        </div>
      </div>
    </div>
  );
}

/* ── renderizadores adaptativos ──────────────────────────────────────
   Los workspaces del portal (growth, revenue-os, strategy, enterprise,
   brand-lab, api-hub, integraciones, workflows, copilot…) comparten forma:
   un `summary` de cifras y listas de objetos {id, title|label, body|detail,
   value}. En vez de escribir una UI a medida para cada uno —frágil y
   duplicada— se dibujan con estas piezas, que toleran campos ausentes.
   ------------------------------------------------------------------- */

const CLAVES_TITULO = ["title", "label", "name", "nombre", "headline", "question"];
const CLAVES_CUERPO = ["body", "detail", "description", "message", "text", "summary", "answer", "hint"];
const CLAVES_VALOR = ["value", "count", "total", "score", "amount", "n"];

function primerCampo(objeto, claves) {
  for (const k of claves) {
    const v = objeto?.[k];
    if (typeof v === "string" && v.trim()) return v;
    if (typeof v === "number") return v;
  }
  return null;
}

/**
 * Las claves de la API son inglesas y camelCase. Sin traducir, un panel en
 * español acaba lleno de "waitingForReply". Lo que no esté aquí se separa por
 * palabras y se capitaliza, que ya es legible aunque quede en inglés.
 */
const TRADUCCIONES = {
  // Inbox
  totalThreads: "Conversaciones",
  requiresAttention: "Requieren atención",
  waitingForReply: "Esperando respuesta",
  withCalls: "Con llamadas",
  withRecordings: "Con grabación",
  withPayments: "Con pagos",

  // Calidad de voz
  total: "Llamadas analizadas",
  withRecording: "Con grabación",
  avgScore: "Nota media",
  avgDuration: "Duración media",
  avgCompliance: "Cumplimiento medio",
  capturedLeads: "Leads captados",

  // Guion comercial
  camposCubiertos: "Campos cubiertos",
  ultimaEdicion: "Última edición",
  recommendations: "Recomendaciones",
  suggestions: "Sugerencias",
};


function humanizar(clave) {
  if (TRADUCCIONES[clave]) return TRADUCCIONES[clave];
  return String(clave)
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Da formato a un valor suelto sin saber de qué métrica viene. */
function valorLegible(clave, valor) {
  if (valor == null) return "—";
  if (typeof valor === "boolean") return valor ? "Sí" : "No";
  if (Array.isArray(valor)) return num(valor.length);
  if (typeof valor === "object") return "—";
  if (typeof valor === "number") {
    const k = String(clave).toLowerCase();
    if (/revenue|value|amount|price|eur|invoice|ingres/.test(k)) return eur(valor);
    if (/rate|progress|coverage|percent|pct|readiness|probability/.test(k)) return `${num(Math.round(valor))}%`;
    if (/duration|seconds/.test(k)) return duracion(valor);
    return num(valor);
  }
  return String(valor);
}

/** Convierte cualquier objeto `summary` en una rejilla de tarjetas. */
function Resumenes({ resumen }) {
  const entradas = Object.entries(resumen || {}).filter(
    ([, v]) => v == null || typeof v !== "object" || Array.isArray(v)
  );
  if (entradas.length === 0) return null;

  return (
    <div className="pv3-grid" data-c={entradas.length >= 4 ? "4" : entradas.length === 3 ? "3" : "2"}>
      {entradas.slice(0, 8).map(([k, v], i) => (
        <Tarjeta key={k} label={humanizar(k).toUpperCase()} valor={valorLegible(k, v)} retraso={i * 55} />
      ))}
    </div>
  );
}

/** Dibuja una lista de objetos heterogéneos como tarjetas. */
function Lista({ titulo, items, columnas = "2" }) {
  const filas = Array.isArray(items) ? items.filter(Boolean) : [];
  if (filas.length === 0) return null;

  return (
    <>
      <h2 className="pv3-h2">{titulo}</h2>
      <div className="pv3-grid" data-c={columnas} style={{ marginTop: 0 }}>
        {filas.slice(0, 12).map((item, i) => {
          if (typeof item === "string") {
            return (
              <div key={i} className="pv3-card" style={{ animationDelay: `${i * 45}ms` }}>
                <p className="pv3-p">{item}</p>
              </div>
            );
          }

          const tit = primerCampo(item, CLAVES_TITULO);
          const cuerpo = primerCampo(item, CLAVES_CUERPO);
          const val = primerCampo(item, CLAVES_VALOR);
          const estado = item.status || item.level || item.state || item.severity;

          return (
            <div key={item.id || i} className="pv3-card" style={{ animationDelay: `${i * 45}ms` }}>
              <div className="pv3-row">
                <span className="pv3-lab">{String(tit ?? `Elemento ${i + 1}`).toUpperCase()}</span>
                {estado ? <span className="pv3-tag" data-t={tono(estado)}>{estado}</span> : null}
              </div>
              {val != null && val !== tit ? (
                <div className="pv3-stat" style={{ fontSize: 24 }}>
                  {valorLegible(item.suffix === "EUR" ? "revenue" : "value", val)}
                </div>
              ) : null}
              {cuerpo && cuerpo !== tit ? <p className="pv3-p" style={{ marginTop: 10 }}>{cuerpo}</p> : null}
              {Array.isArray(item.steps) && item.steps.length > 0 ? (
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--muted)" }}>
                  {item.steps.slice(0, 5).map((s, si) => (
                    <li key={si}>{typeof s === "string" ? s : primerCampo(s, CLAVES_TITULO) || "—"}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Traduce cualquier palabra de estado a uno de los cuatro tonos de píldora. */
function tono(estado) {
  const s = String(estado || "").toLowerCase();
  if (/(ok|ready|healthy|activ|good|done|complet|alta|high|won|pass)/.test(s)) return "ok";
  if (/(warn|pending|partial|medio|media|review|degraded|trial)/.test(s)) return "warn";
  if (/(error|fail|critical|missing|blocked|lost|down|risk)/.test(s)) return "bad";
  return "grey";
}

function Conversaciones({ inbox, cargando, onRecargar }) {
  const [abierto, setAbierto] = useState(null);
  const [canal, setCanal] = useState("whatsapp");
  const [mensaje, setMensaje] = useState("");

  if (cargando) return <div className="pv3-grid" data-c="4">{[0, 1, 2, 3].map((i) => <div key={i} className="pv3-skel" />)}</div>;
  if (!inbox) return <div style={{ marginTop: 22 }}><Vacio>No se pudo cargar el inbox.</Vacio></div>;

  const hilos = inbox.threads || [];
  const activo = hilos.find((h) => h.id === abierto) || null;

  return (
    <div className="pv3-view">
      <Resumenes resumen={inbox.summary} />

      {hilos.length === 0 ? (
        <div style={{ marginTop: 22 }}><Vacio>Todavía no hay conversaciones abiertas.</Vacio></div>
      ) : (
        <div className="pv3-grid" data-c="2" style={{ alignItems: "start" }}>
          <div style={{ display: "grid", gap: 8 }}>
            {hilos.slice(0, 40).map((h, i) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setAbierto(abierto === h.id ? null : h.id)}
                className="pv3-card"
                style={{
                  textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit",
                  animationDelay: `${i * 30}ms`,
                  borderColor: abierto === h.id ? "rgba(255,255,255,0.32)" : undefined,
                }}
              >
                <div className="pv3-row">
                  <span className="pv3-strong">{h.leadName}</span>
                  {h.requiresAttention ? <span className="pv3-tag" data-t="warn">Requiere atención</span> : <Tag estado={h.status} />}
                </div>
                <p className="pv3-p" style={{ marginTop: 8, fontSize: 13 }}>{h.lastPreview}</p>
                <div className="pv3-det">
                  {h.phone || "—"} · {num(h.callCount)} llamadas · {num(h.messageCount)} mensajes · {fecha(h.lastActivityAt)}
                </div>
              </button>
            ))}
          </div>

          <div className="pv3-card" style={{ position: "sticky", top: 20 }}>
            {!activo ? (
              <p className="pv3-p">Elige una conversación para ver su historial completo.</p>
            ) : (
              <>
                <div className="pv3-lab">{activo.leadName.toUpperCase()}</div>
                <div className="pv3-det" style={{ marginTop: 6 }}>
                  {activo.phone || "—"}{activo.email ? ` · ${activo.email}` : ""}
                  {activo.owner ? ` · ${activo.owner}` : ""}
                </div>
                {activo.interes ? <p className="pv3-p" style={{ marginTop: 12 }}>{activo.interes}</p> : null}
                {activo.next_action ? (
                  <div style={{ marginTop: 12 }}>
                    <span className="pv3-tag" data-t={tono(activo.next_action_priority)}>
                      {activo.next_action_priority}
                    </span>
                    <p className="pv3-p" style={{ marginTop: 8 }}>{activo.next_action}</p>
                  </div>
                ) : null}

                <div className="pv3-responder">
                  <div className="pv3-form">
                    <Campo label="Canal">
                      <select className="pv3-input" value={canal} onChange={(e) => setCanal(e.target.value)}>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="sms">SMS</option>
                        <option value="email">Email</option>
                      </select>
                    </Campo>
                  </div>

                  <textarea
                    className="pv3-input"
                    rows={3}
                    placeholder="Escribe la respuesta, o pide una sugerencia…"
                    value={mensaje}
                    onChange={(e) => setMensaje(e.target.value)}
                  />

                  <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
                    <Accion
                      onRun={async () => {
                        const json = await enviar("/api/portal/conversations/suggest", "POST", {
                          leadId: activo.leadId,
                          channel: canal,
                          goal: "followup",
                        });
                        const texto =
                          json?.data?.primary ||
                          json?.data?.body ||
                          json?.primary ||
                          json?.message;
                        if (!texto) throw new Error("No se pudo generar una sugerencia.");
                        setMensaje(texto);
                      }}
                    >
                      Sugerir respuesta
                    </Accion>

                    <Accion
                      variante="light"
                      confirmar={`¿Enviar este mensaje por ${canal} a ${activo.leadName}?`}
                      onRun={async () => {
                        if (!mensaje.trim()) throw new Error("Escribe el mensaje primero.");
                        await enviar("/api/portal/conversations/respond", "POST", {
                          leadId: activo.leadId,
                          channel: canal,
                          message: mensaje,
                          takeover: true,
                        });
                        setMensaje("");
                        await onRecargar();
                      }}
                    >
                      Enviar
                    </Accion>
                  </div>
                </div>

                <div style={{ marginTop: 18, display: "grid", gap: 10 }}>
                  {(activo.items || []).map((it, i) => (
                    <div
                      key={it.id || i}
                      style={{
                        padding: "10px 12px", borderRadius: 12,
                        border: "1px solid var(--line)", background: "rgba(0,0,0,0.4)",
                      }}
                    >
                      <div className="pv3-row">
                        <span className="pv3-lab">{String(it.channel || "evento").toUpperCase()}</span>
                        <span className="pv3-small">{fecha(it.created_at || it.at)}</span>
                      </div>
                      <p className="pv3-p" style={{ marginTop: 6, fontSize: 13 }}>
                        {it.preview || it.body || it.summary || it.type || "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Playbooks({ playbooks, cargando, onRecargar }) {
  const guardado = playbooks?.workspace || null;

  // null = "todavía no lo ha tocado nadie", y entonces se muestra lo guardado.
  // Así no hace falta sembrar el formulario desde un efecto, que provocaría
  // un render en cascada y, si se sincronizara, desharía lo que se escribe.
  const [editado, setEditado] = useState(null);

  if (cargando) {
    return <div className="pv3-grid" data-c="2">{[0, 1].map((i) => <div key={i} className="pv3-skel" />)}</div>;
  }
  if (!playbooks) {
    return <div style={{ marginTop: 22 }}><Vacio>No se pudieron cargar los playbooks.</Vacio></div>;
  }

  const f = editado || guardado || {};
  const campo = (k, v) => setEditado({ ...f, [k]: v });

  return (
    <div className="pv3-view">
      {playbooks.summary ? <Resumenes resumen={playbooks.summary} /> : null}

      <h2 className="pv3-h2">Guion de la cuenta</h2>
      <div className="pv3-card">
        <div className="pv3-form">
          <Campo label="Objetivo de la llamada">
            <input className="pv3-input" value={f.goal || ""}
              placeholder="Conseguir una cita presencial"
              onChange={(e) => campo("goal", e.target.value)} />
          </Campo>
          <Campo label="Tono">
            <input className="pv3-input" value={f.tone || ""}
              placeholder="Cercano, directo, sin tecnicismos"
              onChange={(e) => campo("tone", e.target.value)} />
          </Campo>
          <Campo label="Público">
            <input className="pv3-input" value={f.audience || ""}
              placeholder="Particulares que piden presupuesto"
              onChange={(e) => campo("audience", e.target.value)} />
          </Campo>
        </div>

        <Campo label="Apertura">
          <textarea className="pv3-input" rows={2} value={f.opening || ""}
            placeholder="Cómo debe presentarse la voz al descolgar"
            onChange={(e) => campo("opening", e.target.value)} />
        </Campo>

        <Campo label="Qué debe preguntar siempre">
          <textarea className="pv3-input" rows={3} value={f.questions || ""}
            placeholder="Un punto por línea"
            onChange={(e) => campo("questions", e.target.value)} />
        </Campo>

        <Campo label="Objeciones y cómo responderlas">
          <textarea className="pv3-input" rows={3} value={f.objections || ""}
            placeholder="«Me lo tengo que pensar» → preguntar contra qué compara"
            onChange={(e) => campo("objections", e.target.value)} />
        </Campo>

        <Campo label="Cierre">
          <textarea className="pv3-input" rows={2} value={f.closing || ""}
            placeholder="Cómo debe cerrar la conversación"
            onChange={(e) => campo("closing", e.target.value)} />
        </Campo>

        <Accion
          variante="light"
          onRun={async () => {
            await enviar("/api/playbooks", "PATCH", { workspace: f });
            await onRecargar();
          }}
        >
          Guardar guion
        </Accion>
      </div>

      <Lista titulo="Recomendaciones" items={playbooks.recommendations || playbooks.suggestions} />
    </div>
  );
}

/* ── plan insuficiente ───────────────────────────────────────────────── */

/**
 * Lo que queda fuera del plan.
 *
 * Se cuenta qué hace la pantalla y qué se está perdiendo, no un simple
 * "actualiza tu plan". Alguien que ve para qué sirve lo que no tiene decide;
 * alguien que ve un candado sin explicación, se va.
 */
function FueraDePlan({ vista, plan, onContratar, ocupado }) {
  const QUE_APORTA = {
    conversaciones: {
      titulo: "Cada cliente, en un solo hilo",
      texto:
        "Todas las llamadas, mensajes y notas de una misma persona juntas y en orden, con el histórico completo. Puedes responder desde aquí por SMS o WhatsApp sin salir del portal.",
    },
    voz: {
      titulo: "Saber cómo lo está haciendo la voz",
      texto:
        "Una nota por llamada, qué se le escapa al agente, qué objeciones aparecen más y si está cumpliendo el guion. Es lo que te permite corregirlo en vez de suponer.",
    },
    playbooks: {
      titulo: "Decidir tú cómo habla la voz",
      texto:
        "El objetivo de la llamada, el tono, qué tiene que preguntar siempre y cómo responder a cada objeción. Sin esto, el agente usa el guion genérico.",
    },
  }[vista] || {
    titulo: "Esta sección es del plan Pro",
    texto: "Tu plan actual no la incluye.",
  };

  return (
    <div className="pv3-view">
      <div className="pv3-card pv3-bloqueo">
        <span className="pv3-lab">INCLUIDO EN PRO · TU PLAN ES {String(plan).toUpperCase()}</span>
        <h2 className="pv3-bloqueo-titulo">{QUE_APORTA.titulo}</h2>
        <p className="pv3-p" style={{ marginTop: 12, fontSize: 15, maxWidth: "62ch" }}>
          {QUE_APORTA.texto}
        </p>

        <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
          <button
            type="button"
            className="pv3-btn"
            data-v="light"
            onClick={onContratar}
            disabled={ocupado}
          >
            {ocupado ? "Abriendo…" : "Pasar a Pro"}
          </button>
          <a className="pv3-btn" href="mailto:ventas@nesped.com?subject=Ampliar%20a%20Pro">
            Hablarlo con ventas
          </a>
        </div>
      </div>
    </div>
  );
}

class Aislante extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Sentry ya está montado en la app; si no estuviera, esto no debe fallar.
    try {
      window.Sentry?.captureException?.(error, {
        tags: { boundary: "portal.vista", vista: this.props.vista },
        extra: { componentStack: info?.componentStack },
      });
    } catch {
      /* la traza no puede impedir que se pinte el aviso */
    }
    console.error(`Portal: la vista "${this.props.vista}" ha fallado`, error);
  }

  componentDidUpdate(prev) {
    // Al cambiar de vista se limpia: si no, el error se quedaría pegado.
    if (prev.vista !== this.props.vista && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="pv3-view">
        <div className="pv3-card" style={{ marginTop: 22 }}>
          <div className="pv3-row">
            <span className="pv3-lab">ESTA SECCIÓN NO SE HA PODIDO PINTAR</span>
            <span className="pv3-tag" data-t="bad">Error</span>
          </div>
          <p className="pv3-p" style={{ marginTop: 12 }}>
            El resto del portal sigue funcionando: usa el menú de la izquierda
            para seguir trabajando. El fallo ya ha quedado registrado.
          </p>
          <p className="pv3-det">{String(this.state.error?.message || this.state.error)}</p>
          <Accion onRun={async () => this.setState({ error: null })}>Reintentar</Accion>
        </div>
      </div>
    );
  }
}

/* ── raíz ────────────────────────────────────────────────────────────── */

/** Encabezado de cada vista: antetítulo, título y una línea que la explica. */
const META = {
  resumen: ["PANEL", "Resumen", "Lo que ha pasado y lo que hay abierto ahora mismo."],
  leads: ["CAPTACIÓN", "Leads", "Todo lo que la voz ha capturado, en lista o por fases."],
  llamadas: ["REGISTRO", "Llamadas", "Cada conversación, con grabación y transcripción."],
  conversaciones: ["INBOX", "Conversaciones", "Cada hilo con su historial completo."],
  voz: ["CALIDAD", "Calidad de voz", "Cómo está funcionando el agente, llamada a llamada."],
  playbooks: ["GUION", "Guion comercial", "Cómo habla la voz y qué tiene que conseguir."],
  equipo: ["ORGANIZACIÓN", "Equipo", "Quién tiene acceso, qué puede hacer y qué ha hecho."],
  ajustes: ["CONFIGURACIÓN", "Ajustes", "Tu cuenta, tus objetivos y tu facturación."],
  estado: ["SISTEMA", "Estado", "Servicios, integraciones y frescura de los datos."],
};


export default function PortalV3() {
  const [vista, setVista] = useState("resumen");
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  /**
   * Cache por endpoint. Cada sección se pide una sola vez, la primera que se
   * abre: son consultas caras y pedirlas todas al entrar haría el portal
   * inservible en cuentas con histórico.
   */
  const [extra, setExtra] = useState({});
  const [cargando, setCargando] = useState({});

  /* `abrir` se define antes de que lleguen los datos del cliente, así que el
     plan viaja por referencia en vez de por dependencia: si fuera dependencia,
     cambiaría la identidad de la función en cada carga. */
  const planActual = useRef(PLAN_POR_DEFECTO);

  useEffect(() => {
    let vivo = true;
    pedir("/api/portal/overview")
      .then((json) => { if (vivo && json) setDatos(json); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, []);

  /**
   * Relee el panel tras una escritura. No vacía `datos` antes de pedir: si lo
   * hiciera, la pantalla parpadearía a esqueleto en cada guardado.
   */
  const recargar = useCallback(async () => {
    const json = await pedir("/api/portal/overview");
    if (json) setDatos(json);
  }, []);

  /** Vuelve a pedir una sección concreta, tras tocar algo que le afecta. */
  const recargarSeccion = useCallback(async (id) => {
    const destino = [...VISTAS, ...VISTAS_OCULTAS].find((v) => v.id === id);
    if (!destino?.api) return;
    const json = await pedir(destino.api);
    if (json) setExtra((p2) => ({ ...p2, [id]: json.data ?? json }));
  }, []);

  /**
   * El cambio de vista se hace en el clic y no en un efecto: es un evento del
   * usuario, así que no encadena renders.
   */
  /**
   * Carga una sección si no está ya pedida. Devuelve una promesa para poder
   * esperar a varias a la vez.
   */
  const cargar = useCallback((id, yaPedidas) => {
    if (yaPedidas.has(id)) return Promise.resolve();
    yaPedidas.add(id);

    // "analitica" no es un endpoint: son ocho, y se piden en paralelo.
    if (id === "analitica") {
      setCargando((c) => ({ ...c, analitica: true }));
      return Promise.all(
        ENDPOINTS_ANALITICA.map(([clave, url]) =>
          pedir(url).then((j) => [clave, j?.data ?? null]).catch(() => [clave, null])
        )
      )
        .then((pares) => setExtra((p2) => ({ ...p2, analitica: Object.fromEntries(pares) })))
        .finally(() => setCargando((c) => ({ ...c, analitica: false })));
    }

    const destino = [...VISTAS, ...VISTAS_OCULTAS].find((v) => v.id === id);
    if (!destino?.api) return Promise.resolve();

    setCargando((c) => ({ ...c, [id]: true }));
    return pedir(destino.api)
      .then((json) => { if (json) setExtra((p2) => ({ ...p2, [id]: json.data ?? json })); })
      .catch(() => setExtra((p2) => ({ ...p2, [id]: null })))
      .finally(() => setCargando((c) => ({ ...c, [id]: false })));
  }, []);

  /**
   * Abre una vista y trae lo que necesite.
   *
   * Algunas vistas no tienen endpoint propio: se calculan a partir de otras
   * —la torre de control cruza facturación, salud, calidad y experimentos—,
   * así que se declaran sus dependencias y se piden todas de golpe.
   */
  const abrir = useCallback((id) => {
    setVista(id);

    // Sin plan no se piden sus datos: la API los rechazaría o, peor, los
    // daría, y no tiene sentido gastar una llamada en algo que no se pinta.
    if (!vistaIncluida(id, planActual.current)) return;

    const destino = [...VISTAS, ...VISTAS_OCULTAS].find((v) => v.id === id);
    if (!destino) return;

    const pendientes = [id, ...(destino.deps || [])].filter((x) => {
      const v2 = [...VISTAS, ...VISTAS_OCULTAS].find((n2) => n2.id === x);
      return x === "analitica" || v2?.api;
    });

    setExtra((previo) => {
      // El set marca lo ya presente para no repetir peticiones. Se lee dentro
      // del updater porque es donde se ve el estado más reciente.
      const yaPedidas = new Set(Object.keys(previo));
      pendientes.forEach((x) => cargar(x, yaPedidas));
      return previo;
    });
  }, [cargar]);

  const salir = useCallback(async () => {
    try { await fetch("/api/logout", { method: "POST" }); } catch {}
    window.location.href = "/login";
  }, []);

  const meta = META[vista] || ["PORTAL", "Nesped", ""];
  const marca = datos?.client?.brand_name || datos?.client?.name || "Nesped";
  const plan = planDe(datos?.client);
  planActual.current = plan;
  const [subiendoPlan, setSubiendoPlan] = useState(false);

  /** Lleva al checkout de Pro desde la pantalla de sección bloqueada. */
  const contratarPro = useCallback(async () => {
    setSubiendoPlan(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });
      const json = await res.json().catch(() => null);
      if (json?.url) { window.location.href = json.url; return; }
      alert(json?.message || "No se pudo abrir el pago. Escríbenos a ventas@nesped.com.");
    } catch (e) {
      alert(e?.message || "No se pudo abrir el pago.");
    } finally {
      setSubiendoPlan(false);
    }
  }, []);
  const alertasAbiertas = (datos?.alerts || []).length;
  const cargandoVista = Boolean(cargando[vista]);

  // Una vista derivada sigue cargando mientras le falte cualquiera de sus
  // fuentes: pintarla a medias enseñaría cifras que aún van a cambiar.
  const cargandoDeps = useMemo(() => {
    const d = VISTAS.find((v) => v.id === vista)?.deps || [];
    return cargandoVista || d.some((x) => cargando[x] || extra[x] === undefined);
  }, [vista, cargandoVista, cargando, extra]);
  const datosVista = extra[vista];

  function contenido() {
    // Puerta única: nada de comprobar el plan en cada rama y olvidarse en una.
    if (!vistaIncluida(vista, plan)) {
      return (
        <FueraDePlan
          vista={vista}
          plan={PLANES[plan]?.nombre || plan}
          onContratar={contratarPro}
          ocupado={subiendoPlan}
        />
      );
    }

    switch (vista) {
      case "resumen": return <Resumen datos={datos} />;
      case "leads": return <Leads datos={datos} onRecargar={recargar} />;
      case "llamadas": return <Llamadas datos={datos} />;
      case "ajustes": return <Ajustes datos={datos} onRecargar={recargar} />;

      case "equipo":
        return <Equipo datos={datos} onRecargar={recargar} acceso={extra.permisos} />;

      case "conversaciones":
        return (
          <Conversaciones
            inbox={datosVista}
            cargando={cargandoVista}
            onRecargar={() => recargarSeccion("conversaciones")}
          />
        );

      case "voz": return <Voz voz={datosVista} cargando={cargandoVista} />;
      case "estado": return <Estado salud={datosVista} cargando={cargandoVista} />;

      case "playbooks":
        return (
          <Playbooks
            playbooks={datosVista}
            cargando={cargandoVista}
            onRecargar={() => recargarSeccion("playbooks")}
          />
        );

      default: return null;
    }
  }


  return (
    <div className="pv3">
      <div className="pv3-layout">
        <aside className="pv3-side">
          <div className="pv3-brand">
            <span className="pv3-mark">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="#000" strokeWidth="2" />
                <circle cx="12" cy="12" r="3" fill="#000" />
              </svg>
            </span>
            <span>
              <b>{marca}</b>
              <small>PORTAL</small>
              {datos ? <span className="pv3-plan">PLAN {PLANES[plan]?.nombre?.toUpperCase() || plan.toUpperCase()}</span> : null}
            </span>
          </div>

          {VISTAS.map((v) =>
            v.grupo ? (
              <div key={v.grupo} className="pv3-group">{v.grupo.toUpperCase()}</div>
            ) : (
              <button
                key={v.id}
                type="button"
                className="pv3-nav"
                data-on={vista === v.id}
                data-plan={vistaIncluida(v.id, plan) ? undefined : "fuera"}
                onClick={() => abrir(v.id)}
                title={vistaIncluida(v.id, plan) ? undefined : "Incluido en el plan Pro"}
              >
                <span className="pv3-ico">{v.ico}</span>
                {v.label}
                {v.id === "resumen" && alertasAbiertas > 0 ? (
                  <span className="pv3-badge">{alertasAbiertas}</span>
                ) : null}
                {vistaIncluida(v.id, plan) ? null : <span className="pv3-candado">PRO</span>}
              </button>
            )
          )}

          <div className="pv3-side-foot">
            <button type="button" className="pv3-nav" onClick={salir}>
              <span className="pv3-ico">↩</span>
              Cerrar sesión
            </button>
          </div>
        </aside>

        <main className="pv3-main">
          <div className="pv3-top">
            <Cabecera eyebrow={meta[0]} titulo={meta[1]} sub={meta[2]} />
            <span className="pv3-live"><span className="pv3-dot" /> EN DIRECTO</span>
          </div>

          {error ? (
            <div style={{ marginTop: 22 }}><Vacio>{error}</Vacio></div>
          ) : !datos ? (
            <div className="pv3-grid" data-c="4">{[0, 1, 2, 3].map((i) => <div key={i} className="pv3-skel" />)}</div>
          ) : (
            <Aislante vista={vista}>{contenido()}</Aislante>
          )}
        </main>
      </div>
    </div>
  );
}
