"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Marca el documento en cuanto este módulo se ejecuta.
 *
 * El CSS deja los bloques visibles por defecto y sólo los esconde cuando
 * existe esta marca. Así, si el paquete de JavaScript no llega a cargarse
 * —un chunk que falla, una extensión que lo bloquea, una red mala—, la
 * página se lee entera sin animación en vez de quedarse en blanco. Va en el
 * módulo y no en un efecto porque tiene que pasar antes del primer pintado.
 */
if (typeof document !== "undefined") {
  document.documentElement.dataset.rev = "1";
}

/**
 * Revela a sus hijos al entrar en pantalla.
 *
 * IntersectionObserver en vez de escuchar el scroll: el navegador lo
 * resuelve fuera del hilo principal y no cuesta un cálculo por frame. Se
 * desconecta al revelarse.
 */
export function Rev({ children, d = 0, as: Tag = "div", className = "", ...resto }) {
  const ref = useRef(null);
  // Con movimiento reducido se parte de "ya revelado": así no hay setState
  // síncrono dentro del efecto, que encadena renders.
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

    // Red de seguridad: si el callback no llega nunca (pestaña en segundo
    // plano, pintado diferido, navegadores empotrados) el bloque se quedaría
    // a opacidad 0 de forma permanente. Antes que sin animación, visible.
    const rescate = window.setTimeout(() => {
      setDentro(true);
      io.disconnect();
    }, 3000);

    return () => {
      window.clearTimeout(rescate);
      io.disconnect();
    };
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
