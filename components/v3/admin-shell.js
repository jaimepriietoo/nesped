"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inter } from "next/font/google";
import "./admin.css";
import { Logo } from "./chrome";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap" });

/* =========================================================================
   Envoltorio de las pantallas de administración.

   Las cuatro páginas de /admin están maquetadas con utilidades de Tailwind
   sueltas, sin cabecera ni navegación entre ellas: para ir de una a otra
   había que escribir la URL. Esto les pone barra común y las mete bajo la
   clase `.adm`, que en admin.css armoniza paneles, tipografía y cifras con
   el resto del sitio sin tocar el marcado de dentro.
   ========================================================================= */

const SECCIONES = [
  { href: "/admin", label: "Panel" },
  { href: "/admin/overview", label: "Resumen" },
  { href: "/admin/clients", label: "Clientes" },
  { href: "/admin/domains", label: "Dominios" },
];

export function AdminShell({ children }) {
  const ruta = usePathname();

  return (
    <div className={`adm ${inter.className}`}>
      <header className="adm-top">
        <Link className="adm-logo" href="/" aria-label="Ir al sitio">
          <Logo />
        </Link>

        <nav className="adm-nav" aria-label="Administración">
          {SECCIONES.map((s) => (
            <a
              key={s.href}
              href={s.href}
              className="adm-link"
              // Sólo /admin necesita coincidencia exacta; el resto son prefijos.
              data-on={s.href === "/admin" ? ruta === "/admin" : ruta.startsWith(s.href)}
            >
              {s.label}
            </a>
          ))}
        </nav>

        <div className="adm-acciones">
          <a className="adm-btn" href="/portal">Portal</a>
          <Link className="adm-btn" data-v="light" href="/">Ver el sitio</Link>
        </div>
      </header>

      {children}
    </div>
  );
}
