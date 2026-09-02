"use client";

import { useEffect, useRef, useState } from "react";

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
