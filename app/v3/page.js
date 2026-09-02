"use client";

import { useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import "./v3.css";

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
const LOGOS = [
  {
    n: "Microsoft",
    svg: (
      <svg viewBox="0 0 23 23" aria-hidden="true">
        <path fill="#f25022" d="M1 1h10v10H1z" />
        <path fill="#7fba00" d="M12 1h10v10H12z" />
        <path fill="#00a4ef" d="M1 12h10v10H1z" />
        <path fill="#ffb900" d="M12 12h10v10H12z" />
      </svg>
    ),
  },
  {
    n: "Amazon",
    svg: (
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="#111">
        <path d="M14.7 14.6c-1.2.9-3 1.4-4.5 1.4-2.1 0-4-.8-5.4-2.1-.1-.1 0-.3.1-.2 1.6.9 3.5 1.5 5.5 1.5 1.4 0 2.9-.3 4.3-.9.2-.1.4.1.2.3zm.5-.6c-.2-.2-1.1-.1-1.5-.1-.1 0-.2-.1-.1-.2.7-.5 1.9-.4 2-.2.1.2 0 1.3-.7 1.9-.1.1-.2 0-.2-.1.2-.4.5-1.2.4-1.4z" />
        <path d="M13.3 12.6v-.6c0-.1.1-.2.2-.2.9 0 1.9 0 2.6-.4.5-.3.8-.8.8-1.4 0-.5-.2-1-.6-1.2-.4-.3-1-.3-1.5-.3-.9 0-1.8.3-2 1.4 0 .1-.1.2-.2.2l-1.3-.1c-.1 0-.2-.1-.2-.3.3-1.9 1.9-2.5 3.4-2.5.8 0 1.8.2 2.4.8.8.7.7 1.6.7 2.6v2.4c0 .7.3 1 .5 1.3.1.1.1.2 0 .3l-1 .9c-.1.1-.2.1-.3 0-.4-.3-.5-.5-.7-.8-.7.7-1.2 1-2.1 1-1.1 0-2-.7-2-2.1 0-1.1.6-1.8 1.4-2.2.7-.3 1.7-.4 2.5-.4v-.2c0-.4 0-.8-.2-1.1-.2-.3-.6-.4-.9-.4-.6 0-1.2.3-1.3 1z" />
      </svg>
    ),
  },
  {
    n: "Google",
    svg: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285f4" d="M22.5 12.2c0-.8-.1-1.4-.2-2.1H12v3.9h6c-.1 1-.8 2.5-2.2 3.5l3.4 2.6c2-1.8 3.3-4.6 3.3-7.9z" />
        <path fill="#34a853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.4-2.6c-.9.6-2.1 1.1-3.8 1.1-2.9 0-5.3-1.9-6.2-4.5l-3.5 2.7C4.1 20.5 7.8 23 12 23z" />
        <path fill="#fbbc05" d="M5.8 14.4c-.2-.7-.4-1.4-.4-2.2s.1-1.5.4-2.2L2.3 7.3C1.5 8.7 1 10.3 1 12.2s.5 3.5 1.3 4.9l3.5-2.7z" />
        <path fill="#ea4335" d="M12 5.5c2 0 3.4.9 4.2 1.6l3-2.9C17.4 2.5 14.9 1.4 12 1.4 7.8 1.4 4.1 3.9 2.3 7.3l3.5 2.7C6.7 7.4 9.1 5.5 12 5.5z" />
      </svg>
    ),
  },
];

const STATS = [
  { icon: "<", target: 120, suffix: "ms", decimals: 0, label: "Tiempo de respuesta" },
  { icon: "%", target: 99.99, suffix: "%", decimals: 2, label: "Disponibilidad" },
  { icon: "*", target: 24, suffix: "/7", decimals: 0, label: "Atención continua" },
  { icon: "#", target: 2.4, suffix: "M", decimals: 1, label: "Contexto por llamada" },
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

/* Importes y rutas de checkout: las de producción, sin tocar. */
const PLANES = [
  {
    name: "Starter",
    price: "97 €",
    billing: "mensual",
    sub: "Entrada rápida para validar experiencia y captación.",
    feats: ["Recepción IA básica", "Captura de leads", "Resumen por llamada", "Panel inicial"],
    href: "/api/stripe/public-checkout?plan=starter",
    cta: "Empezar con Starter",
    hi: false,
  },
  {
    name: "Pro",
    price: "197 €",
    billing: "mensual",
    sub: "La versión más seria para mostrar valor y cerrar clientes.",
    feats: ["Voz más natural", "Portal premium", "Métricas y resúmenes", "Soporte prioritario"],
    href: "/api/stripe/public-checkout?plan=pro",
    cta: "Contratar Pro",
    hi: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    billing: "arquitectura a medida",
    sub: "Despliegues multi-cliente, integraciones y rollouts premium.",
    feats: ["Branding avanzado", "Automatizaciones custom", "Mayor control operativo", "Onboarding dedicado"],
    href: "mailto:ventas@nesped.com?subject=Plan%20Enterprise%20Nesped",
    cta: "Hablar con ventas",
    hi: false,
  },
];

/** Revela al entrar en pantalla. IntersectionObserver, no scroll listener. */
function Rev({ children, d = 0, as: Tag = "div", className = "", ...resto }) {
  const ref = useRef(null);
  // Con movimiento reducido se parte de "ya revelado": así no hace falta
  // llamar a setState dentro del efecto, que encadena renders.
  const [dentro, setDentro] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || dentro) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setDentro(true);
        io.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [dentro]);

  return (
    <Tag
      ref={ref}
      className={`v3-rev ${dentro ? "is-in" : ""} ${className}`}
      style={{ "--d": `${d}s` }}
      {...resto}
    >
      {children}
    </Tag>
  );
}

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
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
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
      },
      { threshold: 0.25 }
    );
    io.observe(el);
    return () => {
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

export default function V3() {
  const [menu, setMenu] = useState(false);
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
      {/* ── Cabecera ─────────────────────────────────────────────────── */}
      <header className="v3-header">
        <div className="v3-header-inner">
          <a className="v3-logo" href="#top" aria-label="Inicio">
            <svg viewBox="0 0 52 52" aria-hidden="true">
              <g fill="#0a0a0a">
                <rect x="10" y="30" width="5" height="12" rx="2.5" />
                <rect x="19" y="22" width="5" height="20" rx="2.5" />
                <rect x="28" y="10" width="5" height="32" rx="2.5" />
                <rect x="37" y="26" width="5" height="16" rx="2.5" />
              </g>
            </svg>
          </a>

          <nav className="v3-nav" aria-label="Principal">
            {NAV.map((l, i) => (
              <a key={l.href} href={l.href} className={`v3-navlink ${i === 0 ? "is-active" : ""}`}>
                {l.label}
              </a>
            ))}
          </nav>

          <a className="v3-signin" href="/portal">Portal clientes</a>

          <button
            type="button"
            className="v3-burger"
            aria-label={menu ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </header>

      {menu ? (
        <>
          <div className="v3-overlay" onClick={() => setMenu(false)} />
          <div className="v3-menu">
            {NAV.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                className={`v3-mlink ${i === 0 ? "is-active" : ""}`}
                onClick={() => setMenu(false)}
              >
                {l.label}
              </a>
            ))}
            <a className="v3-msignin" href="/portal">Portal clientes</a>
          </div>
        </>
      ) : null}

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section id="top" className="v3-hero">
        <div className="v3-bg" aria-hidden="true">
          <video autoPlay muted loop playsInline>
            <source src={VIDEO_SRC} type="video/mp4" />
          </video>
        </div>

        <div className="v3-trust">
          {LOGOS.map((l) => (
            <span key={l.n} className="v3-av" title={l.n}>
              {l.svg}
            </span>
          ))}
          <span className="v3-trust-pill">Voz con IA para empresas</span>
        </div>

        <h1 className="v3-h1">
          <span>Convierte cada llamada</span>
          <span>en ingreso real</span>
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
            {PLANES.map((p, i) => (
              <Rev
                as="article"
                key={p.name}
                d={i * 0.09}
                className={`v3-card v3-plan ${p.hi ? "v3-plan--hi" : ""}`}
              >
                <span className="v3-card-meta">{p.hi ? "Recomendado" : "Plan"}</span>
                <h3 className="v3-h3">{p.name}</h3>
                <p className="v3-p">{p.sub}</p>
                <div className="v3-price">{p.price}</div>
                <div className="v3-billing">{p.billing}</div>
                <ul className="v3-feats">
                  {p.feats.map((f) => (
                    <li key={f}><span className="v3-tick">/</span>{f}</li>
                  ))}
                </ul>
                <a
                  className={`v3-btn ${p.hi ? "v3-btn--white" : "v3-btn--dark"}`}
                  href={p.href}
                >
                  {p.cta}
                </a>
              </Rev>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo ─────────────────────────────────────────────────────── */}
      <section id="demo" className="v3-section v3-section--line">
        <div className="v3-wrap">
          <Rev>
            <span className="v3-eyebrow">Demo real</span>
            <h2 className="v3-h2">Lanza una llamada y escucha la experiencia completa.</h2>
            <p className="v3-lede">
              Introduce tu teléfono y prueba la voz, el tono y el flujo de captura
              de lead tal y como los percibirá un usuario real.
            </p>
          </Rev>

          <div className="v3-grid" data-c="2">
            <Rev className="v3-card">
              <span className="v3-card-meta">Qué vas a oír</span>
              <h3 className="v3-h3">Voz, detección de necesidad y captura de lead</h3>
              <p className="v3-p">
                La demo reproduce una llamada real: tono comercial, memoria del
                contacto y el lead registrado al colgar.
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

      {/* ── Pie ──────────────────────────────────────────────────────── */}
      <footer className="v3-footer">
        <div className="v3-wrap">
          <div className="v3-foot-top">
            <div style={{ maxWidth: 300 }}>
              <span className="v3-eyebrow">Nesped</span>
              <p className="v3-p">
                La capa de voz con IA que convierte cada conversación en ingreso
                real.
              </p>
            </div>

            <div className="v3-foot-cols">
              <div>
                <span className="v3-foot-title">Producto</span>
                <a className="v3-foot-link" href="#producto">Cómo funciona</a>
                <a className="v3-foot-link" href="#senal">Señal</a>
                <a className="v3-foot-link" href="#demo">Demo real</a>
              </div>
              <div>
                <span className="v3-foot-title">Planes</span>
                <a className="v3-foot-link" href="/pricing">Pricing</a>
                <a className="v3-foot-link" href="/portal">Portal clientes</a>
                <a className="v3-foot-link" href="mailto:ventas@nesped.com">Hablar con ventas</a>
              </div>
              <div>
                <span className="v3-foot-title">Legal</span>
                <a className="v3-foot-link" href="/legal/voice-compliance">Política de grabaciones</a>
              </div>
            </div>
          </div>

          <div className="v3-foot-bottom">
            <span>© {new Date().getFullYear()} Nesped</span>
            <span>
              Tipografía display:{" "}
              <a
                href="http://www.onlinewebfonts.com/fonts"
                target="_blank"
                rel="noreferrer"
                style={{ color: "#fff", textDecoration: "underline", textUnderlineOffset: 3 }}
              >
                Web Fonts
              </a>{" "}
              · CC BY 4.0
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
