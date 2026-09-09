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
import {
  PLANES, PLAN_POR_DEFECTO, planDe, planSiguiente,
  tieneFuncion, planQueIncluye, VALOR_BLOQUEADO,
} from "@/lib/planes";
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
   de Growth viendo qué le daría Intelligence es la mejor palanca de subida
   que hay, y esconderlo sólo consigue que no sepa que existe.
   ========================================================================= */

/*
 * Con qué pantalla se entra al portal.
 *
 * Inteligencia contesta "qué pasa", que es lo que alguien viene a saber antes
 * de ir a buscar nada. Pero quien no la tenga en su plan entra por Resumen:
 * recibir a alguien con un candado en la cara es la peor primera pantalla
 * posible, y además le esconde lo que sí ha pagado.
 */
function vistaDeEntrada(plan) {
  return tieneFuncion(plan, "inteligencia") ? "inteligencia" : "resumen";
}

/* Motivos de pérdida. Lista corta a propósito: son los que un negocio puede
   hacer algo al respecto, y una lista larga acaba en "otro" siempre. */
/* Cómo se llama cada acción recomendada en pantalla. */
const ACCION_NBA = {
  call: "LLAMAR",
  whatsapp: "ESCRIBIR POR WHATSAPP",
  sms: "MANDAR UN SMS",
  wait: "ESPERAR",
};

const MOTIVOS_PERDIDA = [
  ["precio", "Precio"],
  ["competencia", "Se fue con otro"],
  ["seguimiento", "Se enfrió por falta de seguimiento"],
  ["tiempo", "Plazos"],
  ["no_encaja", "No encajaba"],
  ["sin_respuesta", "Dejó de contestar"],
  ["otro", "Otro"],
];

/**
 * ¿Está la suscripción al corriente?
 *
 * Desde que la cuenta se crea ANTES de pagar, existir no basta para entrar:
 * hay cuentas reales sin un solo cobro. Quien decide es billing_status, que
 * escribe el webhook de Stripe.
 *
 * Sin estado se deja pasar a propósito. Las cuentas anteriores a este cambio
 * tienen la columna vacía y son clientes de verdad; cerrarles el portal por
 * un dato que nunca se rellenó sería echar a quien ya paga.
 */
const ESTADOS_SIN_ACCESO = new Set(["pendiente", "cancelado"]);

function suscripcionAlCorriente(cliente) {
  const estado = String(cliente?.billing_status || "").toLowerCase().trim();
  if (!estado) return true;
  return !ESTADOS_SIN_ACCESO.has(estado);
}

function vistaIncluida(idVista, plan) {
  const necesita = VISTAS.concat(VISTAS_OCULTAS).find((v) => v.id === idVista)?.funcion;
  // Una pantalla sin función declarada entra en todos los planes.
  return !necesita || tieneFuncion(plan, necesita);
}

const VISTAS = [
  { grupo: "Operación" },
  { id: "inteligencia", label: "Inteligencia", ico: "◆", api: "/api/portal/inteligencia", funcion: "inteligencia" },
  { id: "resumen", label: "Resumen", ico: "◇" },
  { id: "leads", label: "Contactos", ico: "◈" },
  { id: "llamadas", label: "Llamadas", ico: "◉" },
  { id: "conversaciones", label: "Conversaciones", ico: "◈", api: "/api/portal/inbox", funcion: "crm" },

  { grupo: "El agente" },
  { id: "agentes", label: "Automatismos", ico: "⚙", api: "/api/portal/agentes", funcion: "agentes" },
  { id: "voz", label: "Calidad de voz", ico: "◎", api: "/api/portal/voice-center", funcion: "llamadas" },
  { id: "playbooks", label: "Guion comercial", ico: "✎", api: "/api/playbooks", funcion: "llamadas" },

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
  const [motivoPerdida, setMotivoPerdida] = useState(lead.lost_reason || "");
  const [nota, setNota] = useState("");
  const [comentario, setComentario] = useState("");
  const [recordatorio, setRecordatorio] = useState("");
  const [cuando, setCuando] = useState("");
  const [sms, setSms] = useState("");
  const [historial, setHistorial] = useState({ notas: [], comentarios: [], recordatorios: [] });
  const [ficha, setFicha] = useState(null);

  // El historial se pide al abrir la ficha, no con la lista: son tres
  // consultas por lead y cargarlas para los 200 de la tabla no tiene sentido.
  useEffect(() => {
    let vivo = true;
    const q = `?lead_id=${encodeURIComponent(lead.id)}`;
    Promise.all([
      fetch(`/api/lead-notes${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/lead-comments${q}`).then((r) => r.json()).catch(() => null),
      fetch(`/api/lead-reminders${q}`).then((r) => r.json()).catch(() => null),
      /* Recorrido, historial de compras y siguiente acción vienen juntos en
         una sola llamada: pedirlos por separado montaba la ficha a trozos
         delante de quien la abre. */
      fetch(`/api/portal/contacto?id=${encodeURIComponent(lead.id)}`).then((r) => r.json()).catch(() => null),
    ]).then(([n, c, r, f]) => {
      if (!vivo) return;
      setHistorial({
        notas: n?.data || [],
        comentarios: c?.data || [],
        recordatorios: r?.data || [],
      });
      setFicha(f?.success ? f : null);
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

      {ficha?.siguiente?.disponible && (
        <>
          <h4 className="pv3-h4">Qué hacer ahora</h4>
          <div className="fc-nba" data-p={ficha.siguiente.prioridad}>
            <div className="fc-nba-acc">{ACCION_NBA[ficha.siguiente.accion] || "REVISAR"}</div>
            <p className="fc-nba-motivo">{ficha.siguiente.motivo}</p>
            {ficha.siguiente.mensaje ? (
              <p className="pv3-p" style={{ marginTop: 10, fontSize: 13, color: "var(--dim)" }}>
                «{ficha.siguiente.mensaje}»
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {lead.telefono ? (
                <a className="pv3-btn" data-v="light" href={`tel:${lead.telefono}`}>Llamar</a>
              ) : null}
              {lead.telefono ? (
                <a
                  className="pv3-btn"
                  href={`https://wa.me/${String(lead.telefono).replace(/[^0-9]/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
            </div>
          </div>
        </>
      )}

      {ficha?.perfil?.disponible && (
        <>
          <h4 className="pv3-h4">Como cliente</h4>
          <div className="fc-perfil">
            <div>
              <div className="fc-dato-lab">COMPRAS</div>
              <div className="fc-dato-val">{ficha.perfil.compras}</div>
            </div>
            {ficha.perfil.ticket != null && (
              <div>
                <div className="fc-dato-lab">TICKET MEDIO</div>
                <div className="fc-dato-val">{ficha.perfil.ticket} €</div>
              </div>
            )}
            {ficha.perfil.cadaDias != null && (
              <div>
                <div className="fc-dato-lab">VUELVE CADA</div>
                <div className="fc-dato-val">{ficha.perfil.cadaDias} d</div>
              </div>
            )}
            {ficha.perfil.sinComprar != null && (
              <div>
                <div className="fc-dato-lab">SIN COMPRAR</div>
                <div className="fc-dato-val" style={{ color: ficha.perfil.enfriandose ? "var(--warn)" : undefined }}>
                  {ficha.perfil.sinComprar} d
                </div>
              </div>
            )}
          </div>
          {ficha.perfil.enfriandose && (
            <p className="pv3-p" style={{ marginTop: 10, fontSize: 13, color: "var(--warn)" }}>
              Lleva más del doble de su tiempo habitual sin comprar.
            </p>
          )}
          {ficha.perfil.sinImportes && (
            <p className="pv3-p" style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)" }}>
              Sus operaciones no tienen importe anotado, así que no hay ticket medio.
            </p>
          )}
        </>
      )}

      {ficha?.recorrido?.length > 0 && (
        <>
          <h4 className="pv3-h4">Por dónde ha pasado</h4>
          <div className="fc-recorrido">
            {ficha.recorrido.slice(0, 20).map((h, i) => (
              <div className="fc-hito" key={`${h.cuando}-${i}`} data-t={h.tipo}>
                <div className="fc-hito-cab">
                  <span className="fc-hito-tit">{h.titulo}</span>
                  <span className="fc-hito-cuando">{fecha(h.cuando)}</span>
                </div>
                {h.detalle ? <p className="fc-hito-det">{h.detalle}</p> : null}
                {(h.duracion || h.sentimiento || h.intencion) && (
                  <div className="fc-etiquetas">
                    {h.duracion ? <span>{Math.floor(h.duracion / 60)}m {h.duracion % 60}s</span> : null}
                    {h.sentimiento ? <span>{h.sentimiento}</span> : null}
                    {h.intencion ? <span>{h.intencion}</span> : null}
                    {h.captado ? <span>datos captados</span> : null}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

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

        {/* Sólo al marcarla como perdida. Es la única pregunta que convierte
            una pérdida en algo que se puede aprender, y va con lista cerrada
            en vez de texto libre porque veinte redacciones distintas de
            "caro" no se pueden sumar después. */}
        {estado === "lost" && (
          <Campo label="¿Por qué se perdió?">
            <select
              className="pv3-input"
              value={motivoPerdida}
              onChange={(e) => setMotivoPerdida(e.target.value)}
            >
              <option value="">Sin especificar</option>
              {MOTIVOS_PERDIDA.map(([clave, texto]) => (
                <option key={clave} value={clave}>{texto}</option>
              ))}
            </select>
          </Campo>
        )}
      </div>

      <Accion
        variante="light"
        onRun={async () => {
          await enviar("/api/leads/update", "PATCH", {
            leadId: lead.id,
            status: estado,
            owner: owner || null,
            valor_estimado: valor === "" ? null : Number(valor),
            /* Se manda vacío si deja de estar perdida: un motivo de pérdida
               colgando de una operación ganada descuadraría el análisis. */
            lost_reason: estado === "lost" ? (motivoPerdida || null) : null,
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

/**
 * Qué está pasando.
 *
 * Es la primera pantalla del portal, y se diseñó al revés de lo habitual:
 * partiendo del caso vacío. Todo cliente nuevo entra aquí sin una sola
 * llamada, y va a pasar así sus primeras semanas. Un panel que sólo funciona
 * lleno es un panel que nadie ve funcionar el primer mes.
 *
 * La regla que ordena todo lo de abajo: no se enseña ni una cifra que no se
 * pueda sostener. Cada número lleva su método al lado, plegado pero a mano.
 * Un número que no se puede discutir no se usa para decidir, y el objetivo
 * aquí es que alguien decida a quién llama esta tarde.
 */
function Inteligencia({ datos }) {
  /* El armazón ya enseña su esqueleto mientras carga; esto sólo cubre el caso
     de que la llamada falle y no llegue nada. */
  if (!datos) return <Vacio>No hemos podido leer el estado de tus datos.</Vacio>;

  const { fuentes = [], cobertura = {}, modulos = [], titulares = [] } = datos;
  const activos = modulos.filter((m) => m.disponible);
  const dormidos = modulos.filter((m) => !m.disponible);
  const total = cobertura.modulosTotales || 1;

  return (
    <div className="pv3-view">
      <div className="iq-cabecera">
        <div>
          <h1 className="iq-titular">
            {activos.length === 0
              ? <>Todavía no hay nada<br />que contarte.</>
              : titulares.length === 0
                ? <>Nada exige tu atención<br />ahora mismo.</>
                : <>{titulares.length === 1 ? "Una cosa pide" : `${titulares.length} cosas piden`}<br />tu atención.</>}
          </h1>
          <p className="iq-sub">
            {activos.length === 0
              ? "Nesped no inventa datos. En cuanto entren llamadas, esta pantalla empieza a decirte qué mirar."
              : "Todo lo de aquí sale de tus datos. Cada cifra lleva debajo cómo se ha calculado."}
          </p>
        </div>

        <div className="iq-cobertura">
          <div>
            <div className="iq-cobertura-cifra">{activos.length}<small style={{ opacity: 0.4 }}>/{total}</small></div>
            <div className="iq-barra" aria-hidden="true">
              {Array.from({ length: total }, (_, i) => (
                <i key={i} data-on={i < activos.length ? "1" : "0"} />
              ))}
            </div>
          </div>
          <p className="iq-cobertura-txt">análisis con datos suficientes</p>
        </div>
      </div>

      {titulares.length > 0 && (
        <div className="iq-titulares">
          {titulares.map((t) => (
            <div className="iq-aviso" key={t.titulo} data-sev={t.severidad}>
              <div>
                <div className="iq-aviso-txt">{t.texto}</div>
                <p className="iq-aviso-como">{t.metodo}</p>
              </div>
              <span className="iq-fuente-est">{t.severidad === "alta" ? "ATENCIÓN" : "REVISAR"}</span>
            </div>
          ))}
        </div>
      )}

      <Copiloto hayDatos={activos.length > 0} />

      {activos.length > 0 && (
        <>
          <h2 className="pv3-h2">Lo que sabemos</h2>
          <div className="iq-rejilla">
            {activos.map((m) => (
              <div className="iq-modulo" key={m.titulo}>
                <div className="iq-modulo-lab">{m.titulo.toUpperCase()}</div>
                <div className="iq-cifra" data-sev={m.severidad}>
                  {m.valor}{m.unidad ? <small data-palabra={/^[a-záéíóúñ]/i.test(m.unidad) && m.unidad.length > 2 ? "1" : undefined}>{m.unidad}</small> : null}
                </div>
                <p className="iq-modulo-txt">{m.resumen}</p>
                <details className="iq-metodo">
                  <summary>Cómo se calcula</summary>
                  <p>{m.metodo}</p>
                </details>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="pv3-h2">
        {activos.length ? "Lo que falta para saber más" : "Lo que hace falta para empezar"}
      </h2>
      <div className="iq-rejilla">
        {dormidos.map((m) => (
          <div className="iq-modulo" data-off="1" key={m.titulo}>
            <div className="iq-modulo-lab">{m.titulo.toUpperCase()}</div>
            <p className="iq-modulo-falta" style={{ marginTop: 14 }}>
              {m.falta}
            </p>
            <p className="iq-modulo-falta" style={{ marginTop: "auto", color: "var(--dim)" }}>
              {m.porQue}
            </p>
          </div>
        ))}
      </div>

      <h2 className="pv3-h2">De dónde salen los datos</h2>
      <div className="pv3-card">
        {fuentes.map((f) => (
          <div className="iq-fuente" key={f.id}>
            <span className="iq-punto" data-e={f.estado} />
            <div>
              <div className="iq-fuente-nom">{f.nombre}</div>
              <p className="iq-fuente-por">
                {f.estado === "conectado" ? f.porQue : f.comoActivar}
              </p>
            </div>
            <span className="iq-fuente-est">
              {f.estado === "conectado" ? (f.detalle || "ACTIVA")
                : f.estado === "parcial" ? "PARCIAL"
                : f.bloqueada ? "NO DISPONIBLE" : "SIN CONECTAR"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Qué hace Nesped solo.
 *
 * El orden de los modos —avisar, preparar, hacerlo solo— no es decorativo:
 * describe cómo se gana la confianza. Nada arranca pudiendo ejecutar, y nada
 * puede llegar a "hacerlo solo" mientras el canal que necesita no exista.
 *
 * Se enseña el modo EFECTIVO, no el guardado. Si alguien dejó un agente en
 * automático y luego se cayó el canal, aquí sale lo que de verdad va a pasar.
 * Un interruptor que dice "encendido" con la bombilla fundida es peor que uno
 * apagado.
 */
/**
 * Preguntarle a Nesped.
 *
 * Es una caja de preguntar, no un chat, y es deliberado: un hilo invita a
 * charlar, y esto no conversa —contesta con lo que hay calculado y se calla—.
 * Sin historial tampoco puede arrastrar un error de una respuesta a la
 * siguiente.
 *
 * Debajo de cada respuesta salen los análisis con los que ha contestado. Una
 * respuesta que no se puede comprobar no vale más que una opinión, y de
 * opiniones sobre su propio negocio ya va servido quien lo dirige.
 */
function Copiloto({ hayDatos }) {
  const [pregunta, setPregunta] = useState("");
  const [pensando, setPensando] = useState(false);
  const [respuesta, setRespuesta] = useState(null);
  const [error, setError] = useState("");

  const SUGERENCIAS = [
    "¿Qué es lo más urgente ahora mismo?",
    "¿Estamos perdiendo llamadas?",
    "¿A quién debería llamar hoy?",
  ];

  async function preguntar(texto) {
    const q = String(texto || pregunta).trim();
    if (!q || pensando) return;

    setPensando(true);
    setError("");
    setRespuesta(null);
    try {
      const res = await fetch("/api/portal/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pregunta: q }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || "No he podido responder.");
        return;
      }
      setRespuesta(json);
    } catch {
      setError("No he podido responder. Revisa la conexión.");
    } finally {
      setPensando(false);
    }
  }

  return (
    <div className="iq-copiloto">
      <div className="iq-modulo-lab">PREGÚNTALE A NESPED</div>

      <form
        className="iq-pregunta"
        style={{ marginTop: 12 }}
        onSubmit={(e) => { e.preventDefault(); preguntar(); }}
      >
        <input
          className="pv3-input"
          placeholder={hayDatos ? "¿Por qué han bajado los cierres?" : "Todavía no hay datos que consultar"}
          value={pregunta}
          onChange={(e) => setPregunta(e.target.value)}
          disabled={pensando}
        />
        <button className="pv3-btn" data-v="light" type="submit" disabled={pensando || !pregunta.trim()}>
          {pensando ? "Mirando…" : "Preguntar"}
        </button>
      </form>

      {hayDatos && !respuesta && !pensando && (
        <div className="iq-sugerencias">
          {SUGERENCIAS.map((s) => (
            <button key={s} type="button" className="iq-sugerencia" onClick={() => { setPregunta(s); preguntar(s); }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="iq-respuesta" style={{ color: "var(--bad)" }}>{error}</p>}

      {respuesta && (
        <div className="iq-respuesta">
          {respuesta.respuesta}
          {respuesta.basadoEn?.length > 0 && (
            <div className="iq-fuentes">
              {respuesta.basadoEn.map((b) => (
                <span key={b.titulo}>{b.titulo}: {b.valor}</span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Agentes({ datos, onCambiado }) {
  const [tocando, setTocando] = useState("");
  const [aviso, setAviso] = useState("");

  if (!datos) return <Vacio>No hemos podido leer los automatismos.</Vacio>;

  const { agentes = [], modos = [] } = datos;

  async function cambiar(agenteId, modo) {
    setTocando(`${agenteId}:${modo}`);
    setAviso("");
    try {
      const res = await fetch("/api/portal/agentes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agenteId, modo }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setAviso(json?.message || "No se pudo cambiar.");
        return;
      }
      await onCambiado();
    } finally {
      setTocando("");
    }
  }

  return (
    <div className="pv3-view">
      <div className="ag-lista">
        {agentes.map((a) => (
          <div className="ag-tarjeta" key={a.id} data-bloqueado={a.puedeEjecutar ? undefined : "1"}>
            <div className="ag-fila">
              <div>
                <div className="ag-nombre">{a.nombre}</div>
                <p className="ag-que">{a.queHace}</p>
                <p className="ag-cuando">{a.cuandoActua}</p>
              </div>

              <div className="ag-modos">
                {modos.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="ag-modo"
                    aria-pressed={a.modoEfectivo === m.id}
                    title={m.descripcion}
                    disabled={
                      (m.id === "solo" && !a.puedeEjecutar) ||
                      tocando === `${a.id}:${m.id}`
                    }
                    onClick={() => cambiar(a.id, m.id)}
                  >
                    {m.nombre}
                  </button>
                ))}
              </div>
            </div>

            {a.motivoBloqueo && <p className="ag-bloqueo">{a.motivoBloqueo}</p>}
          </div>
        ))}
      </div>

      {aviso && <p className="pv3-p" style={{ marginTop: 14, color: "var(--bad)" }}>{aviso}</p>}

      <p className="pv3-p" style={{ marginTop: 20, fontSize: 13, color: "var(--muted)", maxWidth: "70ch" }}>
        Todo lo que haga un agente queda registrado con su hora en el historial
        de la cuenta, hagas lo que hagas con estos interruptores.
      </p>
    </div>
  );
}

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
                    {c.transcript || c.tiene_grabacion ? (
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
          <Grabacion key={llamadas[abierta].id} llamada={llamadas[abierta]} />
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

/**
 * El reproductor de una grabación.
 *
 * No pinta la dirección del proveedor. Antes sí: `<audio src={recording_url}>`
 * hacía que el navegador fuera DIRECTO a Telnyx, sin pasar por Nesped y sin
 * que nadie comprobara de qué empresa era esa llamada. Para que sonara, esa
 * dirección tenía que abrirse sin credenciales, así que cualquiera que
 * consiguiera una escuchaba la conversación de un cliente ajeno.
 *
 * Ahora se pide al servidor, que comprueba la sesión y la empresa y devuelve
 * una dirección firmada que caduca en diez minutos. Se pide al pulsar y no al
 * abrir la llamada: firmar por si acaso gastaría una firma cada vez que
 * alguien mira una transcripción.
 *
 * Lleva `key` con el id de la llamada donde se usa. Sin eso, al pasar de una
 * llamada a otra se quedaría sonando la dirección firmada de la anterior
 * mientras se lee la transcripción de la nueva. El `key` hace que React lo
 * monte de cero, que es más simple y más fiable que acordarse de limpiarlo.
 */
function Grabacion({ llamada }) {
  const [url, setUrl] = useState(null);
  const [estado, setEstado] = useState("quieto");

  if (!llamada?.tiene_grabacion) return null;

  if (url) {
    return <audio controls autoPlay src={url} style={{ width: "100%", marginTop: 14 }} />;
  }

  const pedir = async () => {
    setEstado("pidiendo");
    try {
      const res = await fetch(`/api/portal/grabacion?id=${encodeURIComponent(llamada.id)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.success && json.url) setUrl(json.url);
      else setEstado("sin-grabacion");
    } catch {
      setEstado("sin-grabacion");
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button type="button" className="pv3-btn" onClick={pedir} disabled={estado === "pidiendo"}>
        {estado === "pidiendo" ? "Preparando…" : "Escuchar la llamada"}
      </button>
      {estado === "sin-grabacion" ? (
        <p className="pv3-p" style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          Esta grabación ya no está disponible.
        </p>
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

/**
 * Códigos de recuperación.
 *
 * El segundo factor llega por correo. Si el correo no sale —el proveedor
 * caído, el dominio sin verificar— nadie entra al portal, y eso incluye a
 * quien tendría que arreglarlo.
 *
 * Estos códigos no dependen de ningún proveedor. Se enseñan UNA vez: sólo se
 * guarda su hash, así que ni nosotros podemos volver a verlos.
 */
/**
 * Consumo del mes contra el límite del plan.
 *
 * Se enseña siempre, no sólo al pasarse. Quien ve subir el contador puede
 * llamar antes de que le llegue una factura rara; enterarse cuando ya está
 * fuera no sirve para decidir nada.
 *
 * Pasarse no corta el servicio, y el texto lo dice: nadie tiene que temer que
 * dejen de cogerle el teléfono por un número de este panel.
 */
function ConsumoDelMes({ consumo }) {
  if (!consumo) return null;

  /* El umbral de aviso lo decide el servidor, en lib/server/cuotas.js. Aquí
     solo se pinta: si esta pantalla volviera a comparar contra 80 por su
     cuenta, habría dos definiciones de "va justo" y una se quedaría vieja. */
  const pct = Math.min(100, Math.round((consumo.proporcion || 0) * 100));
  const color = !consumo.dentro ? "var(--bad)" : consumo.cerca ? "var(--warn)" : "var(--ok)";

  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
      <div className="pv3-row">
        <span className="pv3-small">Este mes</span>
        <span className="pv3-strong" style={{ fontSize: 13 }}>
          {consumo.llamadas} llamadas · {consumo.minutos} min
        </span>
      </div>

      <div style={{ height: 4, background: "rgba(255,255,255,.12)", marginTop: 10, borderRadius: 2 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>

      <p className="pv3-p" style={{ marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
        {!consumo.dentro
          ? "Has superado lo previsto en tu plan. No cortamos nada: te escribimos para ajustarlo."
          : `${pct}% de lo previsto en tu plan (${consumo.limiteLlamadas} llamadas al mes).`}
      </p>
    </div>
  );
}

function CodigosRecuperacion() {
  const [disponibles, setDisponibles] = useState(null);
  const [codigos, setCodigos] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch("/api/portal/codigos-recuperacion")
      .then((r) => r.json())
      .then((j) => { if (vivo && j?.success) setDisponibles(j.disponibles); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  async function generar() {
    setOcupado(true);
    setError("");
    try {
      const res = await fetch("/api/portal/codigos-recuperacion", { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setError(json?.message || "No se pudieron generar.");
        return;
      }
      setCodigos(json.codigos);
      setDisponibles(json.codigos.length);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <p className="pv3-p" style={{ fontSize: 13.5, color: "var(--dim)" }}>
        Sirven para entrar si el código por correo no te llega. Cada uno vale
        una vez.
      </p>

      {codigos ? (
        <>
          <div
            style={{
              marginTop: 14, padding: 14,
              border: "1px solid var(--line)", borderRadius: 8,
              fontFamily: "var(--font-display)", fontSize: 14, lineHeight: 2,
              columnCount: 2, columnGap: 18,
            }}
          >
            {codigos.map((c) => <div key={c}>{c}</div>)}
          </div>
          <p className="pv3-p" style={{ marginTop: 12, fontSize: 13, color: "var(--warn)" }}>
            Guárdalos ahora. No se pueden volver a ver: sólo queda su huella.
          </p>
        </>
      ) : (
        <p className="pv3-p" style={{ marginTop: 10, fontSize: 13 }}>
          {disponibles === null
            ? "\u00a0"
            : disponibles > 0
              ? `Te quedan ${disponibles} sin usar.`
              : "No tienes ninguno. Si el correo falla, no podrás entrar."}
        </p>
      )}

      <button
        type="button"
        className="pv3-btn"
        data-v={disponibles === 0 ? "light" : undefined}
        style={{ marginTop: 12 }}
        onClick={generar}
        disabled={ocupado}
      >
        {ocupado ? "Generando…" : disponibles ? "Generar otros" : "Generar códigos"}
      </button>

      {disponibles > 0 && !codigos ? (
        <p className="pv3-p" style={{ marginTop: 8, fontSize: 12.5, color: "var(--muted)" }}>
          Generar otros anula los que ya tengas.
        </p>
      ) : null}

      {error ? (
        <p className="pv3-p" style={{ marginTop: 10, fontSize: 13, color: "var(--bad)" }}>{error}</p>
      ) : null}
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

  /* Qué se enseña de la suscripción. La columna la escribe el webhook de
     Stripe; hasta que no hay un cobro no dice nada, y en ese caso vale más
     un guion que inventarse un "activo". */
  const ESTADO_COBRO = {
    activo: ["Al corriente", "#7ee3bd"],
    pendiente: ["Pendiente de pago", "#ffcf8b"],
    moroso: ["Con un recibo devuelto", "#ffcf8b"],
    cancelado: ["Cancelada", "#ff9b9b"],
    active: ["Al corriente", "#7ee3bd"],
  };
  const claveCobro = String(c.billing_status || "").toLowerCase().trim();
  const [textoCobro, colorCobro] = ESTADO_COBRO[claveCobro] || ["Sin suscripción registrada", "var(--muted)"];

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
          <div className="pv3-lab">SUSCRIPCIÓN</div>
          <div style={{ marginTop: 14, display: "grid", gap: 11 }}>
            <div className="pv3-row">
              <span className="pv3-small">Plan</span>
              <span className="pv3-strong" style={{ fontSize: 13 }}>
                {PLANES[planDe(c)]?.nombre || "—"}
              </span>
            </div>
            <div className="pv3-row">
              <span className="pv3-small">Estado</span>
              <span className="pv3-strong" style={{ fontSize: 13, color: colorCobro }}>{textoCobro}</span>
            </div>
          </div>
          <ConsumoDelMes consumo={datos?.consumo} />

          <p className="pv3-p" style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
            Desde facturación puedes cambiar la tarjeta, descargarte las facturas
            o darte de baja. Sin permanencia.
          </p>
          <button
            type="button"
            className="pv3-btn"
            data-v="light"
            style={{ marginTop: 12 }}
            onClick={abrirFacturacion}
            disabled={ocupado}
          >
            {ocupado ? "Abriendo…" : "Facturación y facturas"}
          </button>
        </div>

        <div className="pv3-card">
          <div className="pv3-lab">ACCESO</div>
          <CodigosRecuperacion />
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
            Los cambias más abajo, en esta misma pantalla.
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
/**
 * Cuenta creada pero sin pagar.
 *
 * Se enseña en lugar del portal entero, no como un aviso encima: dejar ver
 * secciones vacías a quien no ha pagado no informa de nada y hace pensar que
 * el producto no funciona.
 */
function PagoPendiente({ plan, onPagar, ocupado }) {
  return (
    <div className="pv3-view">
      <div className="pv3-card pv3-bloqueo">
        <span className="pv3-lab">TE FALTA UN PASO</span>
        <h2 className="pv3-bloqueo-titulo">
          Tu cuenta está creada.<br />Falta activar el plan.
        </h2>
        <p className="pv3-p" style={{ marginTop: 12, fontSize: 15, maxWidth: "62ch" }}>
          Ya tienes tu acceso y tus datos guardados. En cuanto completes el pago del
          plan {plan} se abre el portal entero y tu agente empieza a coger llamadas.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          <button className="pv3-btn" onClick={onPagar} disabled={ocupado}>
            {ocupado ? "Abriendo el pago…" : `Activar el plan ${plan}`}
          </button>
          <a className="pv3-btn" href="mailto:ventas@nesped.com?subject=Activar%20mi%20plan">
            Hablar con nosotros antes
          </a>
        </div>
        <p className="pv3-p" style={{ marginTop: 18, fontSize: 13, opacity: 0.7 }}>
          Sin permanencia. Puedes darte de baja desde el portal cuando quieras.
        </p>
      </div>
    </div>
  );
}

/**
 * Una sección que el plan no incluye.
 *
 * Nunca dice "actualiza tu plan" a secas. Quien llega aquí no sabe lo que se
 * está perdiendo —por eso no lo tiene contratado— así que lo primero es
 * contarle qué hace esa función, y sólo después de dónde se saca.
 *
 * El texto sale de VALOR_BLOQUEADO, que vive junto a la definición de planes:
 * si alguien añade una función y no escribe su gancho, se ve enseguida.
 */
function FueraDePlan({ vista, plan, onSubir, ocupado }) {
  const necesita = [...VISTAS, ...VISTAS_OCULTAS].find((v) => v.id === vista)?.funcion;
  const destino = necesita ? planQueIncluye(necesita) : planSiguiente(plan);
  const valor = VALOR_BLOQUEADO[necesita] || {
    titulo: "Esta sección no entra en tu plan",
    gancho: "",
  };
  const planDestino = PLANES[destino];
  const porVentas = planDestino?.hablarConVentas;

  return (
    <div className="pv3-view">
      <div className="pv3-card pv3-bloqueo">
        <span className="pv3-lab">
          EN {String(planDestino?.nombre || "").toUpperCase()} · TU PLAN ES {String(PLANES[plan]?.nombre || plan).toUpperCase()}
        </span>
        <h2 className="pv3-bloqueo-titulo">{valor.titulo}</h2>
        <p className="pv3-p" style={{ marginTop: 12, fontSize: 15, maxWidth: "62ch" }}>
          {valor.gancho}
        </p>

        {planDestino && (
          <p className="pv3-p" style={{ marginTop: 18, fontSize: 13.5, color: "var(--muted)" }}>
            {planDestino.promesa}{" "}
            {porVentas
              ? "Enterprise se ajusta a cada caso, así que se habla antes."
              : `${planDestino.precio} € al mes, sin permanencia.`}
          </p>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
          {porVentas ? (
            <a
              className="pv3-btn"
              data-v="light"
              href={`mailto:ventas@nesped.com?subject=${encodeURIComponent("Nesped Enterprise")}`}
            >
              Hablar con nosotros
            </a>
          ) : (
            <button
              type="button"
              className="pv3-btn"
              data-v="light"
              onClick={() => onSubir(destino)}
              disabled={ocupado}
            >
              {ocupado ? "Abriendo…" : `Pasar a ${planDestino?.nombre}`}
            </button>
          )}
          <a className="pv3-btn" href="/pricing">Ver los planes</a>
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
  inteligencia: ["INTELIGENCIA", "Qué está pasando", "Lo que Nesped puede afirmar hoy sobre tu negocio, y con qué fundamento."],
  agentes: ["AUTOMATISMOS", "Qué hace Nesped solo", "Qué vigila, cuándo salta y cuánta libertad le das."],
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
      .then((json) => {
        if (!vivo || !json) return;
        setDatos(json);

        /* Y de paso, los datos de la pantalla con la que se entra.
           Antes sólo se pedía /overview y cada sección se cargaba al
           pulsarla. Funcionaba mientras la pantalla de entrada no tuviera
           endpoint propio; en cuanto lo tuvo, entrar al portal dejaba el
           esqueleto puesto para siempre, porque nadie llegaba a pulsar nada.

           Se mira el plan que viene en la respuesta, no el del render: pedir
           los datos de una sección que el plan no incluye es una llamada que
           la API va a rechazar. */
        const planInicial = planDe(json.client);
        setVista(vistaDeEntrada(planInicial));
        const inicial = vistaDeEntrada(planInicial);
        if (vistaIncluida(inicial, planInicial)) {
          const destino = VISTAS.find((v) => v.id === inicial);
          if (destino?.api) {
            setCargando((c) => ({ ...c, [inicial]: true }));
            pedir(destino.api)
              .then((r) => { if (vivo && r) setExtra((p2) => ({ ...p2, [inicial]: r.data ?? r })); })
              .catch(() => { if (vivo) setExtra((p2) => ({ ...p2, [inicial]: null })); })
              .finally(() => { if (vivo) setCargando((c) => ({ ...c, [inicial]: false })); });
          }
        }
      })
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
  /* El plan se copia a un ref para que `abrir` lo lea sin volver a crearse en
     cada render. Escribirlo aquí y no en el cuerpo del render importa: React
     puede descartar un render a medias, y un ref escrito en uno descartado
     deja el valor adelantado respecto a lo que se está pintando. */
  useEffect(() => { planActual.current = plan; }, [plan]);

  const [subiendoPlan, setSubiendoPlan] = useState(false);

  /* Al pago por la ruta con cuenta: lleva el client_id dentro de la sesión de
     Stripe, que es lo que permite activar el plan al volver el webhook. */
  const irAPagar = useCallback((planDestino) => {
    setSubiendoPlan(true);
    window.location.assign(`/api/suscripcion/iniciar?plan=${encodeURIComponent(planDestino)}`);
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
    /* Primero el pago, después el plan. Sin suscripción al corriente no hay
       sección que valga: enseñar el plan bloqueado a quien todavía no ha
       pagado nada confunde las dos cosas. */
    if (!suscripcionAlCorriente(datos?.client)) {
      return (
        <PagoPendiente
          plan={PLANES[plan]?.nombre || plan}
          onPagar={() => irAPagar(plan)}
          ocupado={subiendoPlan}
        />
      );
    }

    // Puerta única: nada de comprobar el plan en cada rama y olvidarse en una.
    if (!vistaIncluida(vista, plan)) {
      return (
        <FueraDePlan
          vista={vista}
          plan={plan}
          onSubir={irAPagar}
          ocupado={subiendoPlan}
        />
      );
    }

    switch (vista) {
      case "inteligencia": return <Inteligencia datos={datosVista} />;
      case "agentes": return <Agentes datos={datosVista} onCambiado={() => recargarSeccion("agentes")} />;
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
                title={vistaIncluida(v.id, plan) ? undefined : `Incluido en ${PLANES[planQueIncluye(v.funcion)]?.nombre || "un plan superior"}`}
              >
                <span className="pv3-ico">{v.ico}</span>
                {v.label}
                {v.id === "resumen" && alertasAbiertas > 0 ? (
                  <span className="pv3-badge">{alertasAbiertas}</span>
                ) : null}
                {vistaIncluida(v.id, plan) ? null : (
                  /* La etiqueta dice en qué plan está, no un genérico "PRO":
                     saber si te falta un escalón o dos cambia la decisión. */
                  <span className="pv3-candado">
                    {(PLANES[planQueIncluye(v.funcion)]?.nombre || "").toUpperCase()}
                  </span>
                )}
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
