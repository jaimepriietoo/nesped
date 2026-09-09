"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import { Footer, Header } from "@/components/v3/chrome";
import { Rev } from "@/components/v3/rev";
import { EscuchaLlamada } from "@/components/v3/escucha";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const VIDEO_SRC =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260809_012548_ef22562c-c0ae-4816-ad9d-f8922af4e6a7.mp4";

const NAV = [
  { href: "#producto", label: "Producto" },
  { href: "#senal", label: "Señal" },
  { href: "#planes", label: "Planes" },
  { href: "#demo", label: "Demo" },
];

/* Iconos de marca en SVG en línea: evitan cargar Font Awesome desde cdnjs,
   que tu CSP bloquea (style-src y font-src solo admiten Google Fonts). */
/**
 * Sello del hero.
 *
 * Aquí había tres logos —Microsoft, Amazon y Google— junto a "Voz con IA
 * para empresas". Ninguno es cliente ni socio. Eso da a entender un respaldo
 * que no existe, usa marcas registradas ajenas para insinuarlo, y en cuanto
 * alguien lo comprueba deja de creerse el resto de la página. En un producto
 * que se vende por miles de euros al mes, eso cuesta la venta.
 *
 * Se sustituye por lo que sí es verdad y además se puede comprobar: sobre
 * qué infraestructura corre. Es lo que un comprador técnico quiere saber, y
 * decirlo de frente transmite más seriedad que un logo prestado.
 */
const INFRAESTRUCTURA = ["OpenAI Realtime", "Telnyx", "Stripe"];

/**
 * El mecanismo, paso a paso.
 *
 * Falta en la página y es lo que separa "otra web de IA" de algo que se
 * compra por miles de euros al mes: quien evalúa quiere entender qué pasa
 * entre que suena el teléfono y aparece el lead. Sin esto, la promesa suena
 * a magia, y la magia no se compra, se desconfía de ella.
 */
const COMO_FUNCIONA = [
  {
    n: "01",
    t: "Tu número sigue siendo tuyo",
    d: "No cambias de número ni te portas nada. Desvías las llamadas que no coges —o todas— a la línea que te damos. Si mañana lo quitas, vuelve a sonar donde sonaba.",
  },
  {
    n: "02",
    t: "Descuelga al primer tono",
    d: "Sin menús ni «pulse uno». La voz saluda con el nombre de tu empresa y escucha. Si le interrumpen, calla; si hay ruido, espera. Como una persona.",
  },
  {
    n: "03",
    t: "Averigua y apunta",
    d: "Pregunta lo que hace falta, de uno en uno, y confirma el teléfono repitiéndolo. Al colgar el lead ya está en tu panel con lo que necesita y su valor estimado.",
  },
  {
    n: "04",
    t: "Te dice a quién llamar",
    d: "Puntúa cada contacto, propone el siguiente paso y manda el seguimiento. Tú entras por la mañana y ya está hecho.",
  },
];

/**
 * Objeciones.
 *
 * Se responden las que salen de verdad en una llamada de venta, incluidas
 * las incómodas: qué pasa si la voz falla, quién ve mis datos y qué ocurre
 * si me quiero ir. Esquivarlas no las elimina, sólo las deja sin respuesta
 * en la cabeza de quien decide.
 */
const PREGUNTAS = [
  {
    q: "¿Se nota que no es una persona?",
    a: "Escucha la muestra de arriba y júzgalo tú. Habla castellano de España, acusa recibo antes de contestar, duda cuando piensa y calla si le interrumpes. Lo que no hace es fingir ser humano: si alguien pregunta, lo dice.",
  },
  {
    q: "¿Y si no entiende lo que le piden?",
    a: "Lo dice y ofrece que le llames tú. No inventa precios, plazos ni disponibilidad; esa regla está en el guion y es la primera que comprobamos. Prefiere quedarse corto a prometer algo que no puedes cumplir.",
  },
  {
    q: "¿Cuánto tarda en estar funcionando?",
    a: "Un día. Damos de alta tu cuenta, escribimos el guion contigo y configuras el desvío desde tu operadora. Lo que más tarda es que decidas qué quieres que pregunte.",
  },
  {
    q: "¿Quién puede oír las llamadas?",
    a: "Sólo las personas a las que tú das acceso, y queda registrado quién ha entrado y cuándo. Las grabaciones se guardan 30 días y las transcripciones 90; después se borran solas.",
  },
  {
    q: "¿Se avisa de que la llamada se graba?",
    a: "Sí, antes de que empiece a hablar el agente. Es obligatorio y no es opcional en la configuración. Si quien llama no quiere, se le ofrece otra vía y no se insiste.",
  },
  {
    q: "¿Y si quiero dejarlo?",
    a: "No hay permanencia. Cancelas desde el portal, quitas el desvío y tu número vuelve a sonar donde sonaba. Los leads que ya tienes te los llevas en CSV.",
  },
];

/**
 * Cifras del hero.
 *
 * Venían del prompt genérico de IA con el que se maquetó la página ("120 ms
 * de inferencia", "2.4M de contexto"). Para un producto de voz eso no
 * significa nada y encima miente: nadie descuelga en 120 ms. Estas cuatro sí
 * describen lo que el cliente compra y se pueden sostener delante de él.
 */
const STATS = [
  { icon: "<", target: 1.2, suffix: " s", decimals: 1, label: "En descolgar" },
  { icon: "%", target: 100, suffix: "%", decimals: 0, label: "Llamadas atendidas" },
  { icon: "*", target: 24, suffix: "/7", decimals: 0, label: "Sin turnos ni bajas" },
  { icon: "#", target: 30, suffix: " días", decimals: 0, label: "Grabaciones guardadas" },
];

const PRODUCTO = [
  {
    meta: "Conversación",
    t: "Voz natural con memoria comercial",
    d: "La llamada no se queda en un audio sin contexto. Se convierte en lead útil, resumen accionable y siguiente paso recomendado.",
  },
  {
    meta: "Visibilidad",
    t: "Portal premium por cliente",
    d: "Métricas, pipeline, historial, automatizaciones y facturación presentados con el nivel visual que esperas de un SaaS serio.",
  },
  {
    meta: "Operación",
    t: "Una sola capa para captación y cierre",
    d: "WhatsApp, seguimiento, scoring, next-best-action y cobro viven dentro del mismo sistema, no repartidos en parches.",
  },
];

const SENAL = [
  {
    meta: "Captación",
    t: "Pipeline vivo",
    d: "Estado, responsable, valor estimado y memoria IA por cada lead que entra.",
  },
  {
    meta: "Orquestación",
    t: "Seguimiento multicanal",
    d: "SMS, WhatsApp, llamadas y recomendaciones de siguiente acción dentro del mismo panel.",
  },
  {
    meta: "Revenue",
    t: "Checkout y portal de billing",
    d: "Cobro directo, plan activo y configuración del acceso del cliente tras el pago.",
  },
];

/**
 * Planes. Los importes NO están aquí.
 *
 * Estaban, y por eso la portada anunciaba 97 € y 197 € mientras Stripe
 * cobraba 75 € y 150 €, y /pricing —que ya leía de Stripe— enseñaba los
 * buenos: la propia web se contradecía. Ahora los pide a /api/precios, que
 * los saca de Stripe. Para cambiar un precio se cambia allí y ya está.
 */
const PLANES = [
  {
    name: "Starter",
    plan: "starter",
    sub: "Entrada rápida para validar experiencia y captación.",
    feats: ["Recepción IA básica", "Captura de leads", "Resumen por llamada", "Panel inicial"],
    hi: false,
  },
  {
    name: "Pro",
    plan: "pro",
    sub: "La versión más seria para mostrar valor y cerrar clientes.",
    feats: ["Voz más natural", "Portal premium", "Métricas y resúmenes", "Soporte prioritario"],
    hi: true,
  },
  {
    name: "Enterprise",
    plan: "enterprise",
    sub: "Despliegues multi-cliente, integraciones y rollouts premium.",
    feats: ["Branding avanzado", "Automatizaciones custom", "Mayor control operativo", "Onboarding dedicado"],
    hi: false,
  },
];

/** Cuenta de 0 al objetivo con easeOutCubic, una sola vez. */
function Contador({ target, suffix, decimals, i }) {
  const ref = useRef(null);
  const [v, setV] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? target
      : 0
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    let raf = 0;
    let timer = 0;

    function arrancar() {
      io.disconnect();
      timer = window.setTimeout(() => {
        const t0 = performance.now();
        const dur = 1500 + i * 80;
        const paso = (now) => {
          const p = Math.min(1, (now - t0) / dur);
          setV(target * (1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(paso);
        };
        raf = requestAnimationFrame(paso);
      }, 480 + i * 90);
    }

    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        arrancar();
      },
      { threshold: 0.25 }
    );
    io.observe(el);

    // Dos redes de seguridad, porque aquí una cifra a cero no es "sin
    // animación": es "0 % de llamadas atendidas" en la portada, que miente.
    //  1) si IntersectionObserver no dispara, se arranca igualmente;
    //  2) si requestAnimationFrame tampoco corre —pestaña en segundo plano,
    //     pintado diferido—, se pone el valor final de golpe. Cuando la
    //     animación sí ha terminado esto es un no-op: ya vale `target`.
    const rescate = window.setTimeout(arrancar, 2500);
    const rescateFinal = window.setTimeout(() => setV(target), 5200);
    return () => {
      window.clearTimeout(rescate);
      window.clearTimeout(rescateFinal);
      io.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [target, i]);

  return (
    <span ref={ref} className="v3-stat-value">
      {v.toFixed(decimals)}
      {suffix}
    </span>
  );
}

export default function Home() {
  const [menu, setMenu] = useState(false);
  const [seccion, setSeccion] = useState("");
  const [precios, setPrecios] = useState(null);
  const [telefono, setTelefono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setMenu(false);
    }
    function onResize() {
      if (window.innerWidth >= 860) setMenu(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  /*
   * Aleja el vídeo del fondo en cuanto se hace scroll.
   *
   * Se guarda en un atributo y el movimiento lo hace el CSS: si se animara
   * desde JavaScript habría que tocar el estilo en cada fotograma. Aquí sólo
   * cambia un booleano, y como se compara antes de escribir, el atributo se
   * toca dos veces en toda la sesión en vez de en cada píxel de scroll.
   */
  useEffect(() => {
    const raiz = document.querySelector(".v3");
    if (!raiz) return undefined;

    let desplazado = false;
    const alHacerScroll = () => {
      const ahora = window.scrollY > 80;
      if (ahora === desplazado) return;
      desplazado = ahora;
      raiz.dataset.desplazado = String(ahora);
    };

    alHacerScroll();
    window.addEventListener("scroll", alHacerScroll, { passive: true });
    return () => window.removeEventListener("scroll", alHacerScroll);
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/precios")
      .then((r) => r.json())
      .then((j) => { if (vivo) setPrecios(j?.data || {}); })
      // Sin precios la tarjeta enseña "Consultar" y lleva a ventas: es
      // preferible a arriesgarse a mostrar una cifra que no se cobra.
      .catch(() => { if (vivo) setPrecios({}); });
    return () => { vivo = false; };
  }, []);

  /**
   * El menú son anclas de esta misma página, así que marcar una fija es
   * mentira en cuanto se hace scroll. Esto sigue la sección que se está
   * mirando: se queda la última que cruza la franja central del viewport.
   */
  useEffect(() => {
    const ids = ["producto", "como", "senal", "demo", "planes", "preguntas"];
    const nodos = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (nodos.length === 0) return undefined;

    const io = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setSeccion(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );

    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  /* Mismo contrato que ya usa tu web: POST { telefono, client_id }. */
  async function lanzarLlamada() {
    if (!telefono.trim()) {
      setEstado({ ok: false, text: "Introduce un teléfono para lanzar la demo." });
      return;
    }
    setCargando(true);
    setEstado(null);
    try {
      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, client_id: "demo" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setEstado({ ok: false, text: json.message || "No se pudo lanzar la llamada de prueba." });
        return;
      }
      setEstado({ ok: true, text: "Llamada lanzada. Revisa tu móvil para probar la experiencia real." });
    } catch {
      setEstado({ ok: false, text: "Error técnico al lanzar la llamada." });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className={`v3 ${inter.className}`}>
      <Header activo={seccion} />

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section id="top" className="v3-hero">
        <div className="v3-bg" aria-hidden="true">
          {/* poster: se ve al instante; preload none evita descargar 13,8 MB
                antes de que el navegador decida reproducir. */}
          <video autoPlay muted loop playsInline preload="none" poster="/fonts/poster.svg">
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        </div>

        <div className="v3-trust">
          <span className="v3-trust-pill">
            <span className="v3-punto" aria-hidden="true" />
            Voz con IA sobre {INFRAESTRUCTURA.join(" · ")}
          </span>
        </div>

        <h1 className="v3-h1">
          <span className="v3-line">Convierte cada llamada</span>
          <span className="v3-line">en ingreso real</span>
        </h1>

        <p className="v3-sub">
          Una capa de voz con IA que suena humana: capta, hace seguimiento,
          cierra y cobra dentro de una misma experiencia.
        </p>

        <div className="v3-cta-row">
          <a className="v3-btn v3-btn--white" href="#demo">Probar llamada real</a>
          <a className="v3-btn v3-btn--ghost" href="#planes">Ver planes</a>
        </div>

        <div className="v3-stats">
          {STATS.map((s, i) => (
            <div key={s.label} className="v3-stat">
              <span className="v3-stat-icon">{s.icon}</span>
              <Contador target={s.target} suffix={s.suffix} decimals={s.decimals} i={i} />
              <span className="v3-stat-label">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Producto ─────────────────────────────────────────────────── */}
      <section id="producto" className="v3-section">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Producto</span>
            <h2 className="v3-h2">Una experiencia que vende mejor porque parece producto de verdad.</h2>
            <p className="v3-lede">
              No es una demo bonita encima de automatizaciones sueltas. Es una capa
              coherente de voz, CRM, seguimiento y revenue pensada para que el
              cliente note orden, control y calidad.
            </p>
          </Rev>

          <div className="v3-grid" data-c="3">
            {PRODUCTO.map((c, i) => (
              <Rev as="article" key={c.t} d={i * 0.09} className="v3-card">
                <span className="v3-card-meta">{c.meta}</span>
                <h3 className="v3-h3">{c.t}</h3>
                <p className="v3-p">{c.d}</p>
              </Rev>
            ))}
          </div>
        </div>
      </section>

      {/* ── Señal ────────────────────────────────────────────────────── */}
      {/* ── Cómo funciona ────────────────────────────────────────────── */}
      <section id="como" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Cómo funciona</span>
            <h2 className="v3-h2">De que suene el teléfono<br />a tener el lead apuntado.</h2>
            <p className="v3-lede">
              Cuatro pasos. Ninguno te obliga a cambiar de número ni a tocar
              nada de lo que ya tienes montado.
            </p>
          </Rev>

          <ol className="v3-pasos">
            {COMO_FUNCIONA.map((p, i) => (
              <Rev as="li" key={p.n} d={i * 0.08} className="v3-paso">
                <span className="v3-paso-n">{p.n}</span>
                <div>
                  <h3 className="v3-h3">{p.t}</h3>
                  <p className="v3-p">{p.d}</p>
                </div>
              </Rev>
            ))}
          </ol>
        </div>
      </section>

      <section id="senal" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Señal</span>
            <h2 className="v3-h2">Indicadores que un cliente entiende al instante.</h2>
            <p className="v3-lede">
              El producto transmite control porque cada dato tiene contexto, cada
              lead tiene estado y cada acción deja una huella visible.
            </p>
          </Rev>

          <div className="v3-grid" data-c="3">
            {SENAL.map((c, i) => (
              <Rev as="article" key={c.t} d={i * 0.09} className="v3-card">
                <span className="v3-card-meta">{c.meta}</span>
                <h3 className="v3-h3">{c.t}</h3>
                <p className="v3-p">{c.d}</p>
              </Rev>
            ))}
          </div>

          <Rev d={0.2}>
            <div className="v3-chips">
              {["Clínicas", "Inmobiliarias", "Seguros", "Servicios", "Despachos", "Ventas consultivas"].map((c) => (
                <span key={c} className="v3-chip">{c}</span>
              ))}
            </div>
          </Rev>
        </div>
      </section>

      {/* ── Planes ───────────────────────────────────────────────────── */}
      {/* ── Demo ─────────────────────────────────────────────────────── */}
      <section id="demo" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Demo real</span>
            <h2 className="v3-h2">Escúchalo antes de creerte nada.</h2>
            <p className="v3-lede">
              Cuarenta segundos de una llamada del agente. Ninguna de las dos
              voces es una persona. Si prefieres oírlo en tu propio móvil,
              déjanos tu número y te llama.
            </p>
          </Rev>

          {/* Oírlo pesa más que cualquier párrafo, así que va antes que el
              formulario: pedir el teléfono es fricción y no todo el mundo la
              acepta sin haber oído nada primero. */}
          <Rev d={0.06}>
            <EscuchaLlamada />
          </Rev>

          <div className="v3-grid" data-c="2" style={{ marginTop: 22 }}>
            <Rev className="v3-card">
              <span className="v3-card-meta">Qué acabas de oír</span>
              <h3 className="v3-h3">Detecta la necesidad y se queda con el contacto</h3>
              <p className="v3-p">
                El agente entiende qué se le pide, pregunta sólo lo que falta,
                repite el teléfono para confirmarlo y deja el lead registrado
                antes de colgar.
              </p>
              <div className="v3-chips">
                <span className="v3-chip">Instancia: demo</span>
                <span className="v3-chip">Voz cloud lista</span>
                <span className="v3-chip">Realtime IA</span>
              </div>
            </Rev>

            <Rev className="v3-card" d={0.09}>
              <div className="v3-field">
                <label className="v3-label" htmlFor="v3-tel">Teléfono para la demo</label>
                <input
                  id="v3-tel"
                  className="v3-input"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+346XXXXXXXX"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                />
              </div>

              <button
                type="button"
                className="v3-btn v3-btn--white"
                style={{ marginTop: 16, width: "100%" }}
                onClick={lanzarLlamada}
                disabled={cargando}
              >
                {cargando ? "Lanzando llamada…" : "Probar llamada en vivo"}
              </button>

              <p
                className="v3-status"
                data-ok={estado ? String(estado.ok) : undefined}
                role="status"
                aria-live="polite"
              >
                {estado?.text || ""}
              </p>

              <p className="v3-legal">
                Al lanzar la demo aceptas que la llamada pueda ser grabada y
                transcrita con fines de calidad, seguridad y seguimiento
                comercial.{" "}
                <a href="/legal/voice-compliance">Ver política de grabaciones</a>
              </p>
            </Rev>
          </div>
        </div>
      </section>

      <section id="planes" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Planes</span>
            <h2 className="v3-h2">Listos para vender, cobrar y escalar.</h2>
            <p className="v3-lede">
              Pensados para que puedas activar desde la web pública o desde el
              portal sin romper el flujo comercial.
            </p>
          </Rev>

          <div className="v3-grid" data-c="3">
            {PLANES.map((p, i) => {
              const real = precios?.[p.plan];
              // Mientras llegan los precios se deja el hueco en blanco en vez
              // de enseñar una cifra provisional que luego cambia sola.
              const importe = precios === null ? "" : real?.precio || "Consultar";
              const contratable = Boolean(real);

              return (
                <Rev
                  as="article"
                  key={p.name}
                  d={i * 0.09}
                  className={`v3-card v3-plan ${p.hi ? "v3-plan--hi" : ""}`}
                >
                  <span className="v3-card-meta">{p.hi ? "Recomendado" : "Plan"}</span>
                  <h3 className="v3-h3">{p.name}</h3>
                  <p className="v3-p">{p.sub}</p>
                  <div className="v3-price" aria-busy={precios === null}>
                    {importe || "\u00a0"}
                  </div>
                  <div className="v3-billing">{real?.periodo || "según alcance"}</div>
                  <ul className="v3-feats">
                    {p.feats.map((f) => (
                      <li key={f}><span className="v3-tick">/</span>{f}</li>
                    ))}
                  </ul>
                  <a
                    className={`v3-btn ${p.hi ? "v3-btn--white" : "v3-btn--dark"}`}
                    href={
                      contratable
                        ? `/registro?plan=${p.plan}`
                        : `mailto:ventas@nesped.com?subject=${encodeURIComponent(`Plan ${p.name} de Nesped`)}`
                    }
                  >
                    {contratable ? `Contratar ${p.name}` : "Hablar con ventas"}
                  </a>
                </Rev>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Preguntas ────────────────────────────────────────────────── */}
      <section id="preguntas" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Lo que siempre preguntan</span>
            <h2 className="v3-h2">Las dudas de verdad,<br />respondidas de frente.</h2>
          </Rev>

          <div className="v3-preguntas">
            {PREGUNTAS.map((p, i) => (
              /* <details> nativo: se abre sin JavaScript, es accesible por
                 teclado de fábrica y el buscador lee el contenido aunque esté
                 plegado. Un acordeón hecho a mano no da nada de eso gratis. */
              <Rev as="details" key={p.q} d={i * 0.05} className="v3-pregunta">
                <summary>
                  <span>{p.q}</span>
                  <span className="v3-pregunta-mas" aria-hidden="true" />
                </summary>
                <p className="v3-p">{p.a}</p>
              </Rev>
            ))}
          </div>
        </div>
      </section>

      {/* ── Cierre ───────────────────────────────────────────────────── */}
      <section className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev className="v3-cta">
            <span className="v3-eyebrow">Siguiente paso</span>
            <h2 className="v3-h2">
              Si quieres venderlo como producto serio,
              <br />
              enséñalo como producto serio.
            </h2>
            <p className="v3-lede">
              El mejor argumento comercial no es explicarlo. Es abrir la
              plataforma, cobrar un plan y dejar al cliente viendo una
              experiencia impecable de punta a punta.
            </p>
            <div className="v3-cta-row">
              <a className="v3-btn v3-btn--white" href="/pricing">Ver planes</a>
              <a className="v3-btn" href="/portal">Entrar al portal</a>
              <a className="v3-btn" href="mailto:hola@nesped.com">Hablar con ventas</a>
            </div>
          </Rev>
        </div>
      </section>

      <Footer />
    </div>
  );
}
