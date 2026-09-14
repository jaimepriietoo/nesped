"use client";

import { useEffect, useRef, useState } from "react";

/* =========================================================================
   Una cifra que se cuenta sola al entrar en pantalla.

   Dos redes de seguridad, y no son paranoia: aquí una cifra congelada a cero
   no es "sin animación", es "0 % de llamadas atendidas" en la página de
   ventas. Si el observador no dispara —pestaña en segundo plano, pintado
   diferido, navegador empotrado— se arranca igual; y si tampoco corre el
   bucle de fotogramas, se pone el valor final de golpe.
   ========================================================================= */

function quieto() {
  return typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * @param {number} hasta     valor final
 * @param {number} decimales cuántos se escriben
 * @param {string} antes     lo que va delante (un "< ", por ejemplo)
 * @param {string} despues   unidad o sufijo
 * @param {number} retraso   segundos de espera, para escalonar una fila
 */
export function Contador({ hasta, decimales = 0, antes = "", despues = "", retraso = 0 }) {
  const ref = useRef(null);
  const [v, setV] = useState(() => (quieto() ? hasta : 0));

  useEffect(() => {
    const el = ref.current;
    if (!el || quieto()) return undefined;

    let raf = 0;
    let espera = 0;
    let arrancado = false;

    function arrancar() {
      if (arrancado) return;
      arrancado = true;
      io.disconnect();
      espera = window.setTimeout(() => {
        const t0 = performance.now();
        const dur = 1400;
        const paso = (ahora) => {
          const p = Math.min(1, (ahora - t0) / dur);
          // Frena al final en vez de pararse en seco: una cifra que se detiene
          // de golpe se lee como un salto, no como un recuento.
          setV(hasta * (1 - Math.pow(1 - p, 3)));
          if (p < 1) raf = requestAnimationFrame(paso);
        };
        raf = requestAnimationFrame(paso);
      }, retraso * 1000);
    }

    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) arrancar(); },
      { threshold: 0.3 });
    io.observe(el);

    const rescate = window.setTimeout(arrancar, 2600);
    const rescateFinal = window.setTimeout(() => setV(hasta), 5400);

    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(espera);
      window.clearTimeout(rescate);
      window.clearTimeout(rescateFinal);
    };
  }, [hasta, retraso]);

  return (
    <span ref={ref}>
      {antes}
      {v.toFixed(decimales).replace(".", ",")}
      {despues}
    </span>
  );
}
