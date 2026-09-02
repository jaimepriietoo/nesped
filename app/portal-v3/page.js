"use client";

/**
 * Portal de cliente en el lenguaje visual v3.
 *
 * Vive en /portal-v3 (y no en /v3/portal) a propósito: el middleware de
 * proxy.js sólo exige sesión en rutas que empiezan por /portal o /admin, así
 * que colgarlo bajo /v3 lo dejaría público.
 *
 * No sustituye a /portal: convive con él. Lee los mismos endpoints reales.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import "./portal-v3.css";

/* ── utilidades ──────────────────────────────────────────────────────── */

const VISTAS = [
  { grupo: "Operación" },
  { id: "resumen", label: "Resumen", ico: "◆" },
  { id: "leads", label: "Leads", ico: "◇" },
  { id: "llamadas", label: "Llamadas", ico: "◉" },
  { id: "pipeline", label: "Pipeline", ico: "▤" },
  { grupo: "Inteligencia" },
  { id: "voz", label: "Calidad de voz", ico: "◎" },
  { id: "señales", label: "Señales", ico: "△" },
  { grupo: "Cuenta" },
  { id: "equipo", label: "Equipo", ico: "○" },
  { id: "estado", label: "Estado", ico: "▣" },
  { id: "ajustes", label: "Ajustes", ico: "▢" },
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
    window.location.replace("/login?next=/portal-v3");
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
          <div className="pv3-chart">
            {serie.map((d, i) => (
              <i
                key={d.clave}
                title={`${d.clave}: ${d.n}`}
                style={{ height: `${Math.max(3, (d.n / maximo) * 100)}%`, animationDelay: `${i * 35}ms`, opacity: d.n ? 1 : 0.22 }}
              />
            ))}
          </div>
          <div className="pv3-det">{num(serie.reduce((a, d) => a + d.n, 0))} llamadas en las últimas dos semanas</div>
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

function Leads({ datos }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos.leads || []).filter((l) => {
      if (filtro !== "todos" && (l.status || "new") !== filtro) return false;
      if (!q) return true;
      return [l.nombre, l.telefono, l.email, l.ciudad, l.interes]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [datos.leads, busqueda, filtro]);

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

      {visibles.length === 0 ? (
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
                <tr key={l.id || i}>
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
      </div>
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

function Pipeline({ datos }) {
  const porEstado = useMemo(() => {
    const mapa = Object.fromEntries(COLUMNAS_PIPELINE.map((c) => [c, []]));
    for (const l of datos.leads || []) {
      const s = l.status || "new";
      if (mapa[s]) mapa[s].push(l);
    }
    return mapa;
  }, [datos]);

  return (
    <div className="pv3-view">
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
                  <div
                    key={l.id || i}
                    style={{ padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 12, background: "rgba(0,0,0,0.35)" }}
                  >
                    <div className="pv3-strong" style={{ fontSize: 13 }}>{l.nombre || "Sin nombre"}</div>
                    <div className="pv3-small" style={{ marginTop: 3 }}>
                      {l.telefono || "—"}{l.valor_estimado ? ` · ${eur(l.valor_estimado)}` : ""}
                    </div>
                  </div>
                ))
              )}
              {porEstado[clave].length > 12 ? (
                <span className="pv3-small">+{num(porEstado[clave].length - 12)} más</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Señales({ datos }) {
  const insights = datos.insights || [];
  const rankings = datos.rankings || {};

  return (
    <div className="pv3-view">
      <div className="pv3-grid" data-c="2">
        <div className="pv3-card">
          <div className="pv3-lab">MEJORES DÍAS</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {(rankings.bestDays || []).length === 0 ? <span className="pv3-small">Aún sin datos suficientes.</span> : null}
            {(rankings.bestDays || []).slice(0, 5).map((d, i) => (
              <div key={i} className="pv3-row">
                <span className="pv3-small">{d.label || d.day || d.name || "—"}</span>
                <span className="pv3-strong">{num(d.count ?? d.total ?? d.value)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="pv3-card">
          <div className="pv3-lab">MEJORES HORAS</div>
          <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
            {(rankings.bestHours || []).length === 0 ? <span className="pv3-small">Aún sin datos suficientes.</span> : null}
            {(rankings.bestHours || []).slice(0, 5).map((h, i) => (
              <div key={i} className="pv3-row">
                <span className="pv3-small">{h.label || h.hour || h.name || "—"}</span>
                <span className="pv3-strong">{num(h.count ?? h.total ?? h.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h2 className="pv3-h2">Recomendaciones</h2>
      {insights.length === 0 ? (
        <Vacio>Todavía no hay suficiente histórico para generar recomendaciones.</Vacio>
      ) : (
        <div className="pv3-grid" data-c="2">
          {insights.slice(0, 10).map((s, i) => (
            <div key={s.id || i} className="pv3-card" style={{ animationDelay: `${i * 50}ms` }}>
              <div className="pv3-lab">{String(s.type || s.category || "SEÑAL").toUpperCase()}</div>
              <p className="pv3-p" style={{ marginTop: 10 }}>{s.title || s.message || s.text || "—"}</p>
              {s.description && s.description !== s.title ? (
                <p className="pv3-p" style={{ marginTop: 8, color: "var(--muted)" }}>{s.description}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
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

function Equipo({ datos }) {
  const usuarios = datos.users || [];
  return (
    <div className="pv3-view">
      {usuarios.length === 0 ? (
        <div style={{ marginTop: 22 }}><Vacio>No hay usuarios dados de alta.</Vacio></div>
      ) : (
        <div className="pv3-tablewrap" style={{ marginTop: 22 }}>
          <table className="pv3-table">
            <thead><tr><th>NOMBRE</th><th>EMAIL</th><th>ROL</th><th>ESTADO</th><th>ALTA</th></tr></thead>
            <tbody>
              {usuarios.map((u, i) => (
                <tr key={u.id || i}>
                  <td className="pv3-strong">{u.name || u.full_name || "—"}</td>
                  <td>{u.email || "—"}</td>
                  <td><span className="pv3-tag" data-t="grey">{u.role || "member"}</span></td>
                  <td>
                    <span className="pv3-tag" data-t={u.is_active === false ? "bad" : "ok"}>
                      {u.is_active === false ? "Inactivo" : "Activo"}
                    </span>
                  </td>
                  <td>{fecha(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

function Ajustes({ datos }) {
  const c = datos.client || {};
  const s = datos.settings || {};
  const [ocupado, setOcupado] = useState(false);

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

/* ── raíz ────────────────────────────────────────────────────────────── */

export default function PortalV3() {
  const [vista, setVista] = useState("resumen");
  const [datos, setDatos] = useState(null);
  const [voz, setVoz] = useState(null);
  const [salud, setSalud] = useState(null);
  const [cargandoVoz, setCargandoVoz] = useState(false);
  const [cargandoSalud, setCargandoSalud] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir("/api/portal/overview")
      .then((json) => { if (vivo && json) setDatos(json); })
      .catch((e) => { if (vivo) setError(e.message); });
    return () => { vivo = false; };
  }, []);

  /**
   * Voz y estado son consultas caras, así que sólo se piden al abrir su
   * pestaña. Se hace en el propio clic y no en un efecto: cambiar de vista es
   * un evento del usuario, y así no encadenamos renders.
   */
  const abrir = useCallback(
    (id) => {
      setVista(id);

      if (id === "voz" && !voz && !cargandoVoz) {
        setCargandoVoz(true);
        pedir("/api/portal/voice-center")
          .then((json) => { if (json) setVoz(json.data); })
          .catch(() => {})
          .finally(() => setCargandoVoz(false));
      }

      if (id === "estado" && !salud && !cargandoSalud) {
        setCargandoSalud(true);
        pedir("/api/portal/health")
          .then((json) => { if (json) setSalud(json.data); })
          .catch(() => {})
          .finally(() => setCargandoSalud(false));
      }
    },
    [voz, cargandoVoz, salud, cargandoSalud]
  );

  const salir = useCallback(async () => {
    try { await fetch("/api/logout", { method: "POST" }); } catch {}
    window.location.href = "/login";
  }, []);

  const meta = {
    resumen: ["PANEL", "Resumen", "Lo que ha pasado y lo que hay abierto ahora mismo."],
    leads: ["CAPTACIÓN", "Leads", "Todo lo que la voz ha capturado, con su estado y su valor."],
    llamadas: ["REGISTRO", "Llamadas", "Cada conversación, con grabación y transcripción."],
    pipeline: ["EMBUDO", "Pipeline", "Dónde está cada lead ahora mismo."],
    voz: ["CALIDAD", "Calidad de voz", "Cómo está funcionando el agente en cada llamada."],
    señales: ["ANÁLISIS", "Señales", "Patrones y recomendaciones sobre tus datos."],
    equipo: ["ORGANIZACIÓN", "Equipo", "Quién tiene acceso y qué ha hecho."],
    estado: ["SISTEMA", "Estado", "Servicios, integraciones y frescura de los datos."],
    ajustes: ["CONFIGURACIÓN", "Ajustes", "Tu cuenta, tus objetivos y tu facturación."],
  }[vista];

  const marca = datos?.client?.brand_name || datos?.client?.name || "Nesped";
  const alertasAbiertas = (datos?.alerts || []).length;

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
                onClick={() => abrir(v.id)}
              >
                <span className="pv3-ico">{v.ico}</span>
                {v.label}
                {v.id === "resumen" && alertasAbiertas > 0 ? (
                  <span className="pv3-badge">{alertasAbiertas}</span>
                ) : null}
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
            <>
              {vista === "resumen" && <Resumen datos={datos} />}
              {vista === "leads" && <Leads datos={datos} />}
              {vista === "llamadas" && <Llamadas datos={datos} />}
              {vista === "pipeline" && <Pipeline datos={datos} />}
              {vista === "voz" && <Voz voz={voz} cargando={cargandoVoz} />}
              {vista === "señales" && <Señales datos={datos} />}
              {vista === "equipo" && <Equipo datos={datos} />}
              {vista === "estado" && <Estado salud={salud} cargando={cargandoSalud} />}
              {vista === "ajustes" && <Ajustes datos={datos} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
