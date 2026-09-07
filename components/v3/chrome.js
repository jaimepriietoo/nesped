"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

/* =========================================================================
   Cabecera y pie compartidos por todas las páginas de /v3.

   Viven aquí y no duplicados en cada página para que un cambio de menú o
   de enlaces del pie no haya que repetirlo en cuatro sitios.
   ========================================================================= */

export const NAV = [
  { href: "/#producto", label: "Producto", id: "producto" },
  { href: "/#senal", label: "Señal", id: "senal" },
  { href: "/pricing", label: "Pricing", id: "pricing" },
  { href: "/#demo", label: "Demo", id: "demo" },
];

export function Logo() {
  return (
    <svg viewBox="0 0 52 52" aria-hidden="true">
      <g fill="#0a0a0a">
        <rect x="10" y="30" width="5" height="12" rx="2.5" />
        <rect x="19" y="22" width="5" height="20" rx="2.5" />
        <rect x="28" y="10" width="5" height="32" rx="2.5" />
        <rect x="37" y="26" width="5" height="16" rx="2.5" />
      </g>
    </svg>
  );
}

/**
 * @param {string} activo  id del enlace a marcar (o "" si ninguno)
 * @param {string} cta     texto del botón oscuro de la derecha
 * @param {string} ctaHref destino de ese botón
 */
export function Header({ activo = "", cta = "Portal clientes", ctaHref = "/portal" }) {
  const [menu, setMenu] = useState(false);

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

  return (
    <>
      <header className="v3-header">
        <div className="v3-header-inner">
          <Link className="v3-logo" href="/" aria-label="Inicio">
            <Logo />
          </Link>

          <nav className="v3-nav" aria-label="Principal">
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`v3-navlink ${activo === l.id ? "is-active" : ""}`}
              >
                {l.label}
              </a>
            ))}
          </nav>

          <a className="v3-signin" href={ctaHref}>{cta}</a>

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
            {NAV.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className={`v3-mlink ${activo === l.id ? "is-active" : ""}`}
                onClick={() => setMenu(false)}
              >
                {l.label}
              </a>
            ))}
            <a className="v3-msignin" href={ctaHref}>{cta}</a>
          </div>
        </>
      ) : null}
    </>
  );
}

export function Footer() {
  return (
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
              <Link className="v3-foot-link" href="/#producto">Cómo funciona</Link>
              <Link className="v3-foot-link" href="/#senal">Señal</Link>
              <Link className="v3-foot-link" href="/#demo">Demo real</Link>
            </div>
            <div>
              <span className="v3-foot-title">Planes</span>
              <a className="v3-foot-link" href="/pricing">Pricing</a>
              <a className="v3-foot-link" href="/login">Acceder</a>
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
          {/* La tipografía display es CC BY 4.0: la atribución es obligatoria,
              y una licencia CC BY exige nombrar la obra, no sólo enlazarla. */}
          <span>
            Tipografía{" "}
            <a
              href="https://www.onlinewebfonts.com/fonts"
              target="_blank"
              rel="noreferrer noopener"
              style={{ color: "#fff", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              BubbledotICG-FinePos
            </a>{" "}
            · CC BY 4.0
          </span>
        </div>
      </div>
    </footer>
  );
}
