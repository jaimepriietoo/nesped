"use client";

/**
 * Las tres pantallas de "El agente" que configuran cómo trabaja la IA:
 *
 *   ConfiguracionIA      cómo habla, qué puede, cuándo deriva, horario,
 *                        mensajes, instrucciones libres y una prueba en vivo.
 *   DepartamentosYAvisos los departamentos de la empresa y quién recibe
 *                        cada contacto por correo.
 *   Automatismos         el catálogo de piezas, su modo y lo último que hicieron.
 *
 * Viven aparte de page.js porque son pantallas de edición largas, con su
 * propio estado, y page.js ya pasa de las tres mil líneas.
 *
 * Todo lo que se enseña como "estado de la IA" sale de /api/portal/ia y
 * /api/portal/automatismos: la misma respuesta que usan las rutas para
 * decidir si llaman a OpenAI. Si aquí dice "apagada", es que lo está.
 */

import { useEffect, useMemo, useRef, useState } from "react";

/* ── piezas pequeñas ─────────────────────────────────────────────────── */

async function pedir(url, opciones) {
  const res = await fetch(url, { cache: "no-store", ...opciones, headers: { "Content-Type": "application/json", ...(opciones?.headers || {}) } });
  const json = await res.json().catch(() => null);
  if (res.status === 401) { window.location.replace("/login?next=/portal"); return null; }
  if (!res.ok || !json?.success) throw new Error(json?.message || "No se pudo completar la operación.");
  return json;
}

function Interruptor({ on, onChange, disabled, etiqueta }) {
  return (
    <button type="button" className="ia-switch" role="switch" aria-checked={on} aria-label={etiqueta} disabled={disabled}
      onClick={() => onChange?.(!on)}>
      <i />
    </button>
  );
}

/** Una lista de frases cortas editables: añadir, quitar. */
function Frases({ valor = [], onChange, sugerencias = [], placeholder, max = 20, disabled }) {
  const [nueva, setNueva] = useState("");
  const añadir = (t) => {
    const limpio = String(t || "").trim();
    if (!limpio || valor.includes(limpio) || valor.length >= max) return;
    onChange([...valor, limpio]);
    setNueva("");
  };
  return (
    <div className="ia-frases">
      <div className="ia-chips">
        {valor.map((f) => (
          <span key={f} className="ia-chip" data-on="1">
            {f}
            {!disabled && <button type="button" aria-label={`Quitar ${f}`} onClick={() => onChange(valor.filter((x) => x !== f))}>×</button>}
          </span>
        ))}
        {valor.length === 0 && <span className="pv3-small">Nada todavía.</span>}
      </div>
      {!disabled && (
        <div className="ia-anadir">
          <input className="pv3-input" placeholder={placeholder} value={nueva} maxLength={200}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); añadir(nueva); } }} />
          <button type="button" className="pv3-btn" onClick={() => añadir(nueva)} disabled={!nueva.trim()}>Añadir</button>
        </div>
      )}
      {!disabled && sugerencias.filter((s) => !valor.includes(s)).length > 0 && (
        <div className="ia-chips" style={{ marginTop: 8 }}>
          {sugerencias.filter((s) => !valor.includes(s)).slice(0, 6).map((s) => (
            <button type="button" key={s} className="ia-chip" onClick={() => añadir(s)}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Texto que se escribe solo, como si lo tecleara la IA. */
function Tecleado({ texto }) {
  const nodo = useRef(null);
  useEffect(() => {
    const el = nodo.current;
    if (!el) return undefined;
    const completo = String(texto || "");
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { el.textContent = completo; return undefined; }
    let i = 0; let id;
    const paso = () => {
      i = Math.min(completo.length, i + 2);
      el.textContent = completo.slice(0, i);
      if (i < completo.length) id = setTimeout(paso, 14);
    };
    el.textContent = "";
    id = setTimeout(paso, 120);
    return () => clearTimeout(id);
  }, [texto]);
  return <span ref={nodo}>{texto}</span>;
}

function Seccion({ n, titulo, sub, children }) {
  return (
    <section className="ia-seccion" style={{ animationDelay: `${(n || 0) * 45}ms` }}>
      <div className="ia-seccion-cab">
        <span className="ia-num">{String(n).padStart(2, "0")}</span>
        <div>
          <h2 className="ia-titulo">{titulo}</h2>
          {sub ? <p className="ia-sub">{sub}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

/** La tira de estado de la IA. Se enseña arriba en las tres pantallas. */
export function EstadoIA({ estado, compacto }) {
  if (!estado) return null;
  const funciones = Object.values(estado.funciones || {});
  return (
    <div className="ia-estado" data-on={estado.activa ? "1" : "0"}>
      <div className="ia-estado-cab">
        <span className="ia-estado-punto" />
        <strong>{estado.activa ? "La IA está activa" : "La IA está apagada"}</strong>
        {!estado.activa && <span className="pv3-small">{estado.motivo}</span>}
      </div>
      {!compacto && funciones.length > 0 && (
        <div className="ia-estado-funciones">
          {funciones.map((f) => (
            <div key={f.nombre} className="ia-estado-fn" data-on={f.activa ? "1" : "0"}>
              <span>{f.nombre}</span>
              <small>{f.activa ? "con IA" : f.sinIA}</small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DIAS = ["D", "L", "M", "X", "J", "V", "S"];
const DATOS_POSIBLES = ["nombre", "teléfono", "correo", "necesidad", "localidad", "empresa", "fecha preferida", "cómo nos ha conocido"];
const SUGERENCIAS = {
  puede: ["Dar el horario y la dirección", "Explicar los servicios", "Tomar nota de una incidencia", "Agendar una llamada de vuelta", "Confirmar una cita"],
  no_puede: ["Dar precios cerrados", "Prometer plazos", "Pedir datos bancarios o DNI", "Hablar de otros clientes", "Cancelar un servicio"],
  derivar_cuando: ["Piden hablar con una persona", "Hay una queja o una reclamación", "No sabe la respuesta", "Es un cliente importante", "Quieren dar de baja algo"],
  preguntas: ["¿Cómo te llamas?", "¿Qué necesitas exactamente?", "¿En qué localidad?", "¿Cuándo te viene bien que te llamemos?", "¿Eres ya cliente?"],
};

/* ── 1. Configuración de la IA ───────────────────────────────────────── */

export function ConfiguracionIA() {
  const [datos, setDatos] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [guardado, setGuardado] = useState(null);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [prueba, setPrueba] = useState("Hola, quería saber cuánto cuesta y si podéis venir esta semana.");
  const [respuesta, setRespuesta] = useState(null);
  const [probando, setProbando] = useState(false);
  const [verPrompt, setVerPrompt] = useState(false);

  useEffect(() => {
    let vivo = true;
    pedir("/api/portal/ia").then((j) => { if (!vivo || !j) return; setDatos(j); setCfg(j.data); setGuardado(JSON.stringify(j.data)); }).catch((e) => vivo && setError(e.message));
    return () => { vivo = false; };
  }, []);

  const cambiado = cfg && guardado && JSON.stringify(cfg) !== guardado;
  const puedeEditar = Boolean(datos?.puedeEditar);
  const set = (k, v) => setCfg((c) => ({ ...c, [k]: v }));

  async function guardar() {
    setOcupado(true); setError("");
    try {
      const j = await pedir("/api/portal/ia", { method: "PUT", body: JSON.stringify(cfg) });
      if (j) { setCfg(j.data); setGuardado(JSON.stringify(j.data)); }
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }

  async function probar() {
    setProbando(true); setRespuesta(null); setError("");
    try {
      const j = await pedir("/api/portal/ia/previsualizar", { method: "POST", body: JSON.stringify({ mensaje: prueba, config: cfg }) });
      if (j) setRespuesta(j);
    } catch (e) { setError(e.message); } finally { setProbando(false); }
  }

  if (error && !cfg) return <div className="pv3-empty">{error}</div>;
  if (!cfg) return <div className="pv3-empty">Leyendo la configuración…</div>;

  const tonos = datos.opciones.tonos;
  const autonomia = datos.opciones.autonomia;
  const deps = datos.departamentos || [];

  return (
    <div className="pv3-view ia-view">
      <EstadoIA estado={datos.estado} />

      <Seccion n={1} titulo="Cómo habla" sub="El tono es lo primero que nota quien escribe. Elige uno y mira el ejemplo.">
        <div className="ia-tonos">
          {Object.entries(tonos).map(([id, t]) => (
            <button type="button" key={id} className="ia-tono" aria-pressed={cfg.tono === id} disabled={!puedeEditar} onClick={() => set("tono", id)}>
              <strong>{t.nombre}</strong>
              <span>{t.descripcion}</span>
              <em>“{t.ejemplo}”</em>
            </button>
          ))}
        </div>
        <div className="ia-autonomia">
          <div className="pv3-row" style={{ marginBottom: 10 }}>
            <span className="pv3-lab">AUTONOMÍA</span>
            <span className="pv3-strong">{autonomia[cfg.autonomia]?.nombre}</span>
          </div>
          <div className="ia-pasos" role="radiogroup" aria-label="Nivel de autonomía">
            {[1, 2, 3, 4].map((n) => (
              <button type="button" key={n} role="radio" aria-checked={cfg.autonomia === n} className="ia-paso" data-lleno={n <= cfg.autonomia ? "1" : "0"} disabled={!puedeEditar}
                onClick={() => set("autonomia", n)} title={autonomia[n].nombre}><i /></button>
            ))}
          </div>
          <p className="pv3-p" style={{ marginTop: 10 }} key={cfg.autonomia}>{autonomia[cfg.autonomia]?.descripcion}</p>
        </div>
      </Seccion>

      <Seccion n={2} titulo="Qué puede hacer y qué no" sub="Lo que esté aquí lo cumple siempre. Lo que no esté, lo decide con sentido común.">
        <div className="pv3-grid" data-c="2" style={{ marginTop: 6 }}>
          <div>
            <div className="pv3-lab" data-ok="1">PUEDE</div>
            <Frases valor={cfg.puede} onChange={(v) => set("puede", v)} sugerencias={SUGERENCIAS.puede} placeholder="Ej.: Explicar los servicios" disabled={!puedeEditar} />
          </div>
          <div>
            <div className="pv3-lab" data-bad="1">NO PUEDE, NUNCA</div>
            <Frases valor={cfg.no_puede} onChange={(v) => set("no_puede", v)} sugerencias={SUGERENCIAS.no_puede} placeholder="Ej.: Dar precios cerrados" disabled={!puedeEditar} />
          </div>
        </div>
      </Seccion>

      <Seccion n={3} titulo="Cuándo pasa a una persona" sub="En estos casos deja de resolver, recoge nombre y teléfono, y dice que le llaman.">
        <Frases valor={cfg.derivar_cuando} onChange={(v) => set("derivar_cuando", v)} sugerencias={SUGERENCIAS.derivar_cuando} placeholder="Ej.: Piden hablar con una persona" disabled={!puedeEditar} />
        <div className="pv3-lab" style={{ marginTop: 18 }}>REGLAS DE DERIVACIÓN POR DEPARTAMENTO</div>
        <p className="pv3-p" style={{ margin: "6px 0 10px", fontSize: 13 }}>“Si el contacto…” → “va a…”. Para lo que las palabras clave de cada departamento no cubren.</p>
        <div className="ia-reglas">
          {(cfg.reglas_derivacion || []).map((r, i) => (
            <div key={i} className="ia-regla">
              <span className="pv3-small">si</span>
              <input className="pv3-input" value={r.si} maxLength={200} disabled={!puedeEditar} placeholder="habla de una obra nueva"
                onChange={(e) => set("reglas_derivacion", cfg.reglas_derivacion.map((x, k) => (k === i ? { ...x, si: e.target.value } : x)))} />
              <span className="pv3-small">→</span>
              <select className="pv3-input" value={r.departamento} disabled={!puedeEditar}
                onChange={(e) => set("reglas_derivacion", cfg.reglas_derivacion.map((x, k) => (k === i ? { ...x, departamento: e.target.value } : x)))}>
                {deps.map((d) => <option key={d.clave} value={d.clave}>{d.nombre}</option>)}
              </select>
              {puedeEditar && <button type="button" className="pv3-btn" onClick={() => set("reglas_derivacion", cfg.reglas_derivacion.filter((_, k) => k !== i))}>Quitar</button>}
            </div>
          ))}
          {puedeEditar && (cfg.reglas_derivacion || []).length < 20 && (
            <button type="button" className="pv3-btn" onClick={() => set("reglas_derivacion", [...(cfg.reglas_derivacion || []), { si: "", departamento: deps[0]?.clave || "otro" }])}>+ Añadir regla</button>
          )}
        </div>
      </Seccion>

      <Seccion n={4} titulo="Qué pregunta y qué recoge" sub="Una pregunta por mensaje, sin interrogar. Y sólo los datos que hagan falta.">
        <div className="pv3-lab">PREGUNTAS</div>
        <Frases valor={cfg.preguntas} onChange={(v) => set("preguntas", v)} sugerencias={SUGERENCIAS.preguntas} placeholder="Ej.: ¿En qué localidad?" max={10} disabled={!puedeEditar} />
        <div className="pv3-lab" style={{ marginTop: 18 }}>DATOS QUE RECOGE</div>
        <div className="ia-chips" style={{ marginTop: 8 }}>
          {DATOS_POSIBLES.map((d) => {
            const on = (cfg.datos || []).includes(d);
            return (
              <button type="button" key={d} className="ia-chip" data-on={on ? "1" : "0"} disabled={!puedeEditar}
                onClick={() => set("datos", on ? cfg.datos.filter((x) => x !== d) : [...cfg.datos, d])}>{d}</button>
            );
          })}
        </div>
        <p className="pv3-small" style={{ marginTop: 8 }}>Nunca pide DNI, dirección completa ni datos de pago, esté lo que esté aquí.</p>
      </Seccion>

      <Seccion n={5} titulo="Horario y mensajes" sub="Dentro del horario atiende; fuera, contesta con el mensaje de fuera de horario y recoge los datos.">
        <div className="pv3-grid" data-c="2" style={{ marginTop: 6 }}>
          <div>
            <div className="pv3-lab">DÍAS</div>
            <div className="ia-dias">
              {DIAS.map((d, i) => {
                const on = (cfg.horario?.dias || []).includes(i);
                return (
                  <button type="button" key={i} className="ia-dia" aria-pressed={on} disabled={!puedeEditar}
                    onClick={() => set("horario", { ...cfg.horario, dias: on ? cfg.horario.dias.filter((x) => x !== i) : [...cfg.horario.dias, i].sort() })}>{d}</button>
                );
              })}
            </div>
            <div className="ia-horas">
              <label className="pv3-small">de <input className="pv3-input" type="time" value={cfg.horario?.desde || "09:00"} disabled={!puedeEditar} onChange={(e) => set("horario", { ...cfg.horario, desde: e.target.value })} /></label>
              <label className="pv3-small">a <input className="pv3-input" type="time" value={cfg.horario?.hasta || "18:00"} disabled={!puedeEditar} onChange={(e) => set("horario", { ...cfg.horario, hasta: e.target.value })} /></label>
            </div>
          </div>
          <div>
            <div className="pv3-lab">MENSAJE DE BIENVENIDA <small className="pv3-small">(vacío = no manda nada)</small></div>
            <textarea className="pv3-input ia-textarea" rows={3} maxLength={600} value={cfg.mensaje_bienvenida} disabled={!puedeEditar}
              placeholder="Hola, soy la recepción de {empresa}. Cuéntame qué necesitas y te ayudo."
              onChange={(e) => set("mensaje_bienvenida", e.target.value)} />
            <div className="pv3-lab" style={{ marginTop: 12 }}>MENSAJE DE FUERA DE HORARIO</div>
            <textarea className="pv3-input ia-textarea" rows={3} maxLength={600} value={cfg.mensaje_fuera_horario} disabled={!puedeEditar}
              onChange={(e) => set("mensaje_fuera_horario", e.target.value)} />
          </div>
        </div>
      </Seccion>

      <Seccion n={6} titulo="Lo que quieras añadir, con tus palabras" sub="Escribe aquí exactamente lo que quieres que haga o no haga. Manda sobre todo lo demás.">
        <textarea className="pv3-input ia-textarea" rows={6} maxLength={4000} value={cfg.instrucciones} disabled={!puedeEditar}
          placeholder={"Ejemplo:\nSomos una empresa de fibra en Valladolid. Si preguntan por cobertura, pide la dirección exacta y di que la comprobamos y llamamos hoy. Si hablan de una avería, pregunta si la luz del router está roja y pasa a soporte. Nunca digas que somos los más baratos."}
          onChange={(e) => set("instrucciones", e.target.value)} />
        <div className="pv3-small" style={{ textAlign: "right", marginTop: 4 }}>{(cfg.instrucciones || "").length} / 4000</div>
      </Seccion>

      <Seccion n={7} titulo="Pruébalo" sub="Escribe lo que diría un cliente y mira cómo contesta con esta configuración, aunque aún no la hayas guardado.">
        <div className="ia-prueba">
          <textarea className="pv3-input ia-textarea" rows={2} maxLength={2000} value={prueba} onChange={(e) => setPrueba(e.target.value)} />
          <button type="button" className="pv3-btn" data-v="light" onClick={probar} disabled={probando || !prueba.trim()}>{probando ? "Pensando…" : "Ver respuesta"}</button>
        </div>
        {respuesta && (
          <div className="ia-burbujas">
            <div className="ia-burbuja" data-quien="cliente">{prueba}</div>
            {respuesta.iaActiva ? (
              <div className="ia-burbuja" data-quien="ia"><Tecleado texto={respuesta.respuesta} /></div>
            ) : (
              <div className="ia-burbuja" data-quien="aviso">La IA está apagada ({respuesta.motivo}). No se puede generar una respuesta, pero esto es lo que sabría:</div>
            )}
            <button type="button" className="pv3-btn" style={{ alignSelf: "flex-start" }} onClick={() => setVerPrompt((v) => !v)}>{verPrompt ? "Ocultar" : "Ver"} lo que la IA tiene delante</button>
            {verPrompt && <pre className="ia-prompt">{respuesta.prompt}</pre>}
          </div>
        )}
      </Seccion>

      {error && <p className="pv3-p" style={{ color: "var(--bad)", marginTop: 12 }}>{error}</p>}

      {puedeEditar && (
        <div className="ia-barra" data-cambiado={cambiado ? "1" : "0"}>
          <span className="pv3-small">{cambiado ? "Hay cambios sin guardar." : "Todo guardado."}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {cambiado && <button type="button" className="pv3-btn" onClick={() => setCfg(JSON.parse(guardado))} disabled={ocupado}>Descartar</button>}
            <button type="button" className="pv3-btn" data-v="light" onClick={guardar} disabled={!cambiado || ocupado}>{ocupado ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      )}
      {!puedeEditar && <p className="pv3-small" style={{ marginTop: 16 }}>Sólo el propietario o un administrador pueden cambiar esto.</p>}
    </div>
  );
}

/* ── 2. Departamentos y avisos ───────────────────────────────────────── */

export function DepartamentosYAvisos() {
  const [deps, setDeps] = useState(null);
  const [deSerie, setDeSerie] = useState(false);
  const [dest, setDest] = useState([]);
  const [notis, setNotis] = useState([]);
  const [puedeEditar, setPuedeEditar] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", cargo: "", departamentos: [], recibe_todo: false });

  async function cargar() {
    const [d, r] = await Promise.all([pedir("/api/portal/departamentos"), pedir("/api/portal/destinatarios")]);
    if (d) { setDeps(d.data); setDeSerie(d.deSerie); setPuedeEditar(Boolean(d.puedeEditar)); }
    if (r) { setDest(r.data); setNotis(r.notificaciones || []); }
  }
  useEffect(() => { cargar().catch((e) => setError(e.message)); }, []);

  async function guardarDeps() {
    setOcupado(true); setError("");
    try {
      const j = await pedir("/api/portal/departamentos", { method: "PUT", body: JSON.stringify({ departamentos: deps.map(({ clave, nombre, descripcion, palabras_clave, activo }, i) => ({ clave, nombre, descripcion: descripcion || "", palabras_clave: palabras_clave || [], orden: i, activo: activo !== false })) }) });
      if (j) { setDeps(j.data); setDeSerie(j.deSerie); }
    } catch (e) { setError(e.message); } finally { setOcupado(false); }
  }

  async function crearDest(e) {
    e.preventDefault(); setOcupado(true); setError("");
    try {
      const j = await pedir("/api/portal/destinatarios", { method: "POST", body: JSON.stringify(nuevo) });
      if (j) { setDest((d) => [...d, j.data]); setNuevo({ nombre: "", email: "", cargo: "", departamentos: [], recibe_todo: false }); }
    } catch (e2) { setError(e2.message); } finally { setOcupado(false); }
  }
  async function cambiarDest(id, cambios) {
    try {
      const j = await pedir("/api/portal/destinatarios", { method: "PATCH", body: JSON.stringify({ id, ...cambios }) });
      if (j) setDest((d) => d.map((x) => (x.id === id ? j.data : x)));
    } catch (e) { setError(e.message); }
  }
  async function borrarDest(id) {
    if (!window.confirm("¿Quitar a esta persona de los avisos?")) return;
    try { await pedir("/api/portal/destinatarios", { method: "DELETE", body: JSON.stringify({ id }) }); setDest((d) => d.filter((x) => x.id !== id)); } catch (e) { setError(e.message); }
  }

  if (error && !deps) return <div className="pv3-empty">{error}</div>;
  if (!deps) return <div className="pv3-empty">Leyendo departamentos…</div>;

  const claves = deps.map((d) => d.clave);

  return (
    <div className="pv3-view ia-view">
      <Seccion n={1} titulo="Departamentos" sub={deSerie ? "Son los de serie. Edítalos para que sean los de tu empresa: la IA usa la descripción para decidir." : "La IA lee la descripción de cada uno para decidir a cuál va cada contacto. Las palabras clave son el respaldo cuando la IA no está."}>
        <div className="ia-deps">
          {deps.map((d, i) => (
            <div key={d.clave} className="ia-dep" data-off={d.activo === false ? "1" : "0"}>
              <div className="ia-dep-cab">
                <input className="pv3-input ia-dep-nombre" value={d.nombre} maxLength={60} disabled={!puedeEditar} onChange={(e) => setDeps(deps.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))} />
                <code className="pv3-small">{d.clave}</code>
                <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                  <Interruptor on={d.activo !== false} disabled={!puedeEditar || d.clave === "otro"} etiqueta="Activo" onChange={(v) => setDeps(deps.map((x, k) => (k === i ? { ...x, activo: v } : x)))} />
                  {puedeEditar && d.clave !== "otro" && <button type="button" className="pv3-btn" onClick={() => setDeps(deps.filter((_, k) => k !== i))}>Quitar</button>}
                </div>
              </div>
              <input className="pv3-input" style={{ marginTop: 8 }} placeholder="Qué va aquí, en una frase (lo lee la IA)" value={d.descripcion || ""} maxLength={400} disabled={!puedeEditar}
                onChange={(e) => setDeps(deps.map((x, k) => (k === i ? { ...x, descripcion: e.target.value } : x)))} />
              <div style={{ marginTop: 8 }}>
                <Frases valor={d.palabras_clave || []} onChange={(v) => setDeps(deps.map((x, k) => (k === i ? { ...x, palabras_clave: v } : x)))} placeholder="Palabra clave (respaldo sin IA)" max={30} disabled={!puedeEditar} />
              </div>
            </div>
          ))}
        </div>
        {puedeEditar && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" className="pv3-btn" onClick={() => {
              const nombre = window.prompt("Nombre del departamento nuevo");
              if (!nombre) return;
              const clave = nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || `dep-${deps.length}`;
              if (claves.includes(clave)) { setError("Ya hay un departamento con ese nombre."); return; }
              setDeps([...deps.filter((d) => d.clave !== "otro"), { clave, nombre, descripcion: "", palabras_clave: [], activo: true }, ...deps.filter((d) => d.clave === "otro")]);
            }}>+ Añadir departamento</button>
            <button type="button" className="pv3-btn" data-v="light" onClick={guardarDeps} disabled={ocupado}>{ocupado ? "Guardando…" : "Guardar departamentos"}</button>
          </div>
        )}
      </Seccion>

      <Seccion n={2} titulo="Quién recibe cada contacto" sub="Cuando un contacto queda clasificado, llega por correo a quien atienda ese departamento. Quien tenga 'copia de todo' recibe todos; quien tenga Dirección recibe además los importantes.">
        {dest.length === 0 ? <div className="pv3-empty">Todavía no hay nadie. Sin destinatarios, los contactos se clasifican pero no se avisa a nadie por correo.</div> : (
          <div className="pv3-tablewrap" style={{ marginTop: 6 }}>
            <table className="pv3-table">
              <thead><tr><th>PERSONA</th><th>CARGO</th><th>RECIBE</th><th>COPIA DE TODO</th><th>ACTIVO</th><th /></tr></thead>
              <tbody>
                {dest.map((p) => (
                  <tr key={p.id}>
                    <td><div className="pv3-strong">{p.nombre}</div><div className="pv3-small">{p.email}</div></td>
                    <td>{p.cargo || "—"}</td>
                    <td>
                      <div className="ia-chips">
                        {deps.map((d) => {
                          const on = (p.departamentos || []).includes(d.clave);
                          return <button type="button" key={d.clave} className="ia-chip" data-on={on ? "1" : "0"} disabled={!puedeEditar}
                            onClick={() => cambiarDest(p.id, { departamentos: on ? p.departamentos.filter((x) => x !== d.clave) : [...(p.departamentos || []), d.clave] })}>{d.nombre}</button>;
                        })}
                      </div>
                    </td>
                    <td><Interruptor on={Boolean(p.recibe_todo)} disabled={!puedeEditar} etiqueta="Copia de todo" onChange={(v) => cambiarDest(p.id, { recibe_todo: v })} /></td>
                    <td><Interruptor on={p.activo !== false} disabled={!puedeEditar} etiqueta="Activo" onChange={(v) => cambiarDest(p.id, { activo: v })} /></td>
                    <td>{puedeEditar && <button type="button" className="pv3-btn" onClick={() => borrarDest(p.id)}>Quitar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {puedeEditar && (
          <form className="ia-nuevo" onSubmit={crearDest}>
            <div className="pv3-lab">AÑADIR PERSONA</div>
            <div className="ia-nuevo-campos">
              <input className="pv3-input" placeholder="Nombre" required maxLength={80} value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
              <input className="pv3-input" placeholder="correo@empresa.es" type="email" required value={nuevo.email} onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })} />
              <input className="pv3-input" placeholder="Cargo (opcional)" maxLength={80} value={nuevo.cargo} onChange={(e) => setNuevo({ ...nuevo, cargo: e.target.value })} />
            </div>
            <div className="ia-chips" style={{ marginTop: 10 }}>
              {deps.map((d) => {
                const on = nuevo.departamentos.includes(d.clave);
                return <button type="button" key={d.clave} className="ia-chip" data-on={on ? "1" : "0"} onClick={() => setNuevo({ ...nuevo, departamentos: on ? nuevo.departamentos.filter((x) => x !== d.clave) : [...nuevo.departamentos, d.clave] })}>{d.nombre}</button>;
              })}
            </div>
            <div className="pv3-row" style={{ marginTop: 10, justifyContent: "flex-start", gap: 14 }}>
              <label className="pv3-small" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Interruptor on={nuevo.recibe_todo} etiqueta="Copia de todo" onChange={(v) => setNuevo({ ...nuevo, recibe_todo: v })} /> copia de todos los contactos
              </label>
              <button type="submit" className="pv3-btn" data-v="light" disabled={ocupado || !nuevo.nombre || !nuevo.email}>{ocupado ? "Guardando…" : "Añadir"}</button>
            </div>
          </form>
        )}
      </Seccion>

      <Seccion n={3} titulo="Últimos avisos enviados" sub="Cada intento queda apuntado, salga o no.">
        {notis.length === 0 ? <div className="pv3-empty">Todavía no se ha mandado ningún aviso.</div> : (
          <div className="pv3-tablewrap" style={{ marginTop: 6 }}>
            <table className="pv3-table">
              <thead><tr><th>CUÁNDO</th><th>A</th><th>POR QUÉ</th><th>ESTADO</th></tr></thead>
              <tbody>
                {notis.map((n) => (
                  <tr key={n.id}>
                    <td>{new Date(n.created_at).toLocaleString("es-ES")}</td>
                    <td>{n.email}</td>
                    <td>{n.motivo}</td>
                    <td><span className="pv3-tag" data-t={n.estado === "enviado" ? "ok" : n.estado === "fallido" ? "bad" : "grey"}>{n.estado}</span>{n.error ? <div className="pv3-small">{n.error}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      {error && <p className="pv3-p" style={{ color: "var(--bad)", marginTop: 12 }}>{error}</p>}
    </div>
  );
}

/* ── 3. Automatismos ─────────────────────────────────────────────────── */

const NOMBRE_MODO = { avisar: "Solo avisar", preparar: "Preparar y esperar", solo: "Hacerlo solo" };
const NOMBRE_RESULTADO = { hecho: ["ok", "Hecho"], preparado: ["warn", "Preparado"], avisado: ["warn", "Avisado"], omitido: ["grey", "Omitido"], fallido: ["bad", "Falló"] };

export function Automatismos({ canalEnPlan = true }) {
  const [datos, setDatos] = useState(null);
  const [canal, setCanal] = useState(null);
  const [error, setError] = useState("");
  const [tocando, setTocando] = useState("");
  const pendiente = useRef({});

  async function cargar() {
    const [j, c] = await Promise.all([pedir("/api/portal/automatismos"), pedir("/api/portal/agentes").catch(() => null)]);
    if (j) setDatos(j);
    if (c) setCanal(c);
  }

  /* Los agentes de canal de siempre (rescate, reactivación, seguimiento,
     citas): viven en client_settings y los ejecutan los barridos internos.
     Se enseñan aquí para que todo lo que actúa esté en una pantalla. */
  async function cambiarCanal(agenteId, modo) {
    setTocando(agenteId); setError("");
    try {
      await pedir("/api/portal/agentes", { method: "PATCH", body: JSON.stringify({ agenteId, modo }) });
      const c = await pedir("/api/portal/agentes"); if (c) setCanal(c);
    } catch (e) { setError(e.message); } finally { setTocando(""); }
  }
  useEffect(() => { cargar().catch((e) => setError(e.message)); }, []);

  const grupos = useMemo(() => {
    const m = new Map();
    for (const a of datos?.data || []) { if (!m.has(a.categoria)) m.set(a.categoria, []); m.get(a.categoria).push(a); }
    return [...m.entries()];
  }, [datos]);

  const [pulso, setPulso] = useState("");
  async function cambiar(tipo, cambios) {
    setTocando(tipo); setError("");
    if (cambios.activo === true) { setPulso(tipo); setTimeout(() => setPulso(""), 900); }
    setDatos((d) => ({ ...d, data: d.data.map((a) => (a.id === tipo ? { ...a, ...cambios, config: { ...a.config, ...(cambios.config || {}) } } : a)) }));
    try { await pedir("/api/portal/automatismos", { method: "PATCH", body: JSON.stringify({ tipo, ...cambios }) }); }
    catch (e) { setError(e.message); await cargar().catch(() => {}); }
    finally { setTocando(""); }
  }

  function cambiarConfig(tipo, clave, valor) {
    clearTimeout(pendiente.current[tipo]);
    setDatos((d) => ({ ...d, data: d.data.map((a) => (a.id === tipo ? { ...a, config: { ...a.config, [clave]: valor } } : a)) }));
    pendiente.current[tipo] = setTimeout(() => { cambiar(tipo, { config: { [clave]: valor } }); }, 600);
  }

  if (error && !datos) return <div className="pv3-empty">{error}</div>;
  if (!datos) return <div className="pv3-empty">Leyendo los automatismos…</div>;

  const puedeEditar = datos.puedeEditar;
  const activos = datos.data.filter((a) => a.activo).length;

  return (
    <div className="pv3-view ia-view">
      {datos.pausa?.global && (
        <div className="ia-estado" data-on="0"><div className="ia-estado-cab"><span className="ia-estado-punto" /><strong>Todo en pausa por el interruptor de emergencia</strong><span className="pv3-small">{datos.pausa.motivo || "Nada actúa hasta que se quite la pausa."}</span></div></div>
      )}
      <EstadoIA estado={datos.ia} compacto />

      <div className="au-resumen">
        <div><div className="pv3-lab">ACTIVOS</div><div className="au-cifra">{activos}<small>/{datos.data.length}</small></div></div>
        <div><div className="pv3-lab">HACIENDO SOLOS</div><div className="au-cifra">{datos.data.filter((a) => a.activo && a.modo === "solo").length}</div></div>
        <div><div className="pv3-lab">ÚLTIMAS 24 H</div><div className="au-cifra">{(datos.ejecuciones || []).filter((e) => Date.now() - new Date(e.created_at).getTime() < 864e5).length}<small> acciones</small></div></div>
        <p className="pv3-p" style={{ fontSize: 13, alignSelf: "end" }}>Tres modos: <strong>avisar</strong> detecta y te lo dice; <strong>preparar</strong> lo deja hecho esperando a alguien; <strong>solo</strong> lo ejecuta. Todo queda registrado.</p>
      </div>

      {grupos.map(([categoria, piezas], gi) => (
        <section key={categoria} className="ia-seccion" style={{ animationDelay: `${gi * 45}ms` }}>
          <div className="ia-seccion-cab"><span className="ia-num">{String(gi + 1).padStart(2, "0")}</span><h2 className="ia-titulo">{categoria}</h2></div>
          <div className="au-lista">
            {piezas.map((a) => (
              <div key={a.id} className="au-pieza" data-on={a.activo ? "1" : "0"} data-pulso={pulso === a.id ? "1" : undefined}>
                <div className="au-pieza-cab">
                  <Interruptor on={a.activo} disabled={!puedeEditar || a.fijo || tocando === a.id} etiqueta={a.nombre} onChange={(v) => cambiar(a.id, { activo: v })} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ag-nombre">{a.nombre}{a.fijo && <span className="pv3-tag" data-t="grey" style={{ marginLeft: 8 }}>siempre</span>}</div>
                    <p className="ag-que">{a.queHace}</p>
                    <p className="ag-cuando">{datos.disparos[a.cuando]}{a.necesitaIA ? " · necesita la IA" : ""}{a.canal === "whatsapp" ? " · necesita WhatsApp (pendiente de conectar): hoy sólo prepara" : ""}</p>
                  </div>
                  {a.modos.length > 1 && (
                    <div className="ag-modos">
                      {a.modos.map((m) => (
                        <button key={m} type="button" className="ag-modo" aria-pressed={a.modo === m} disabled={!puedeEditar || !a.activo} title={NOMBRE_MODO[m]} onClick={() => cambiar(a.id, { modo: m })}>{NOMBRE_MODO[m]}</button>
                      ))}
                    </div>
                  )}
                </div>
                {a.activo && (a.campos || []).length > 0 && (
                  <div className="au-config">
                    {a.campos.map((c) => (
                      <label key={c.clave} className="pv3-small au-campo">
                        {c.label}
                        {c.tipo === "numero" && <input className="pv3-input" type="number" min={c.min} max={c.max} value={a.config?.[c.clave] ?? c.porDefecto ?? ""} disabled={!puedeEditar} onChange={(e) => cambiarConfig(a.id, c.clave, Number(e.target.value))} />}
                        {c.tipo === "hora" && <input className="pv3-input" type="time" value={a.config?.[c.clave] ?? c.porDefecto} disabled={!puedeEditar} onChange={(e) => cambiarConfig(a.id, c.clave, e.target.value)} />}
                        {c.tipo === "email" && <input className="pv3-input" type="email" placeholder="persona@empresa.es" value={a.config?.[c.clave] ?? ""} disabled={!puedeEditar} onChange={(e) => cambiarConfig(a.id, c.clave, e.target.value)} />}
                        {c.tipo === "departamento" && <input className="pv3-input" placeholder="clave del departamento (ej. ventas)" value={a.config?.[c.clave] ?? ""} disabled={!puedeEditar} onChange={(e) => cambiarConfig(a.id, c.clave, e.target.value)} />}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}

      {!canalEnPlan && (
        <section className="ia-seccion">
          <div className="ia-seccion-cab"><span className="ia-num">{String(grupos.length + 1).padStart(2, "0")}</span><div><h2 className="ia-titulo">Agentes de canal</h2><p className="ia-sub">Los que llaman o escriben a los contactos por su cuenta —rescate, reactivación, seguimiento, citas— entran en Enterprise. Enterprise se ajusta a cada caso, así que se habla antes.</p></div></div>
          <a className="pv3-btn" data-v="light" href={`mailto:ventas@nesped.com?subject=${encodeURIComponent("Nesped Enterprise")}`}>Hablar con nosotros</a>
        </section>
      )}

      {canalEnPlan && canal?.agentes?.length > 0 && (
        <section className="ia-seccion">
          <div className="ia-seccion-cab"><span className="ia-num">{String(grupos.length + 1).padStart(2, "0")}</span><div><h2 className="ia-titulo">Agentes de canal</h2><p className="ia-sub">Los que llaman o escriben a los contactos por su cuenta. Hasta que el canal no esté conectado, sólo avisan.</p></div></div>
          <div className="au-lista">
            {canal.agentes.map((a) => (
              <div key={a.id} className="au-pieza" data-on={a.modoEfectivo !== "avisar" ? "1" : "0"}>
                <div className="au-pieza-cab">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="ag-nombre">{a.nombre}</div>
                    <p className="ag-que">{a.queHace}</p>
                    <p className="ag-cuando">{a.cuandoActua}</p>
                    {a.motivoBloqueo && <p className="ag-bloqueo">{a.motivoBloqueo}</p>}
                  </div>
                  <div className="ag-modos">
                    {(canal.modos || []).map((m) => (
                      <button key={m.id} type="button" className="ag-modo" aria-pressed={a.modoEfectivo === m.id} title={m.descripcion}
                        disabled={!puedeEditar || (m.id === "solo" && !a.puedeEjecutar) || tocando === a.id} onClick={() => cambiarCanal(a.id, m.id)}>{m.nombre}</button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="ia-seccion">
        <div className="ia-seccion-cab"><span className="ia-num">{String(grupos.length + 2).padStart(2, "0")}</span><h2 className="ia-titulo">Lo último que han hecho</h2></div>
        {(datos.ejecuciones || []).length === 0 ? <div className="pv3-empty">Todavía nada. En cuanto entre un contacto, aquí se ve qué hizo cada pieza y por qué.</div> : (
          <div className="pv3-tablewrap" style={{ marginTop: 6 }}>
            <table className="pv3-table">
              <thead><tr><th>CUÁNDO</th><th>PIEZA</th><th>MODO</th><th>RESULTADO</th><th>DETALLE</th></tr></thead>
              <tbody>
                {datos.ejecuciones.map((e) => {
                  const [t, txt] = NOMBRE_RESULTADO[e.resultado] || ["grey", e.resultado];
                  return (
                    <tr key={e.id}>
                      <td>{new Date(e.created_at).toLocaleString("es-ES")}</td>
                      <td>{e.nombre}</td>
                      <td>{NOMBRE_MODO[e.modo] || e.modo}</td>
                      <td><span className="pv3-tag" data-t={t}>{txt}</span></td>
                      <td style={{ maxWidth: 360, whiteSpace: "normal" }}>{e.detalle?.motivo || e.detalle?.error || (e.detalle ? Object.entries(e.detalle).filter(([k]) => k !== "destinatarios").map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`).join(" · ") : "")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && <p className="pv3-p" style={{ color: "var(--bad)", marginTop: 12 }}>{error}</p>}
      {!puedeEditar && <p className="pv3-small" style={{ marginTop: 16 }}>Sólo el propietario o un administrador pueden cambiar los automatismos.</p>}
    </div>
  );
}
