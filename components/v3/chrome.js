"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./logo";

/* =========================================================================
   Cabecera y pie compartidos por todas las páginas de /v3.

   Viven aquí y no duplicados en cada página para que un cambio de menú o
   de enlaces del pie no haya que repetirlo en cuatro sitios.
   ========================================================================= */

export { Logo };

export const NAV = [
  { href: "/#como", label: "Cómo funciona", id: "como" },
  { href: "/#demo", label: "Escúchalo", id: "demo" },
  { href: "/pricing", label: "Precios", id: "pricing" },
  { href: "/#preguntas", label: "Preguntas", id: "preguntas" },
];


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
              <Link className="v3-foot-link" href="/#como">Cómo funciona</Link>
              <Link className="v3-foot-link" href="/#demo">Escúchalo</Link>
              <Link className="v3-foot-link" href="/#preguntas">Preguntas</Link>
            </div>
            <div>
              <span className="v3-foot-title">Empezar</span>
              <a className="v3-foot-link" href="/pricing">Precios</a>
              <a className="v3-foot-link" href="/login">Acceder al portal</a>
              <a className="v3-foot-link" href="mailto:ventas@nesped.com">Hablar con ventas</a>
            </div>
            <div>
              <span className="v3-foot-title">Legal</span>
              <a className="v3-foot-link" href="/legal/aviso-legal">Aviso legal</a>
              <a className="v3-foot-link" href="/legal/privacidad">Privacidad</a>
              <a className="v3-foot-link" href="/legal/terminos">Términos</a>
              <a className="v3-foot-link" href="/legal/cookies">Cookies</a>
              <a className="v3-foot-link" href="/legal/voice-compliance">Grabaciones</a>
            </div>
            <div>
              <span className="v3-foot-title">Contacto</span>
              <a className="v3-foot-link" href="mailto:soporte@nesped.com">Soporte</a>
              <a className="v3-foot-link" href="mailto:privacidad@nesped.com">Privacidad</a>
              <a className="v3-foot-link" href="mailto:seguridad@nesped.com">Seguridad</a>
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
