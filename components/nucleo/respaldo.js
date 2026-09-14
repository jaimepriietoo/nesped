/* =========================================================================
   Nesped sin WebGL.

   Se pinta cuando no hay WebGL2, cuando el contexto se pierde, o cuando el
   sistema pide menos movimiento. No es un placeholder: es el mismo objeto —
   los mismos tres arcos, el mismo vacío, la misma retícula— resuelto en SVG.

   La accesibilidad no puede ser la excusa para que la alternativa parezca
   otra web. Lo que se quita es el viaje de cámara, la deformación y el
   movimiento continuo. Lo que se queda es la identidad.
   ========================================================================= */

import { COLOR_CSS } from "./tokens";
import { contornos, puntosLogo } from "./silueta";

const CONTORNOS = contornos(100);
const PUNTOS = puntosLogo(100);

/**
 * @param {string} estado  uno de los once; aquí sólo cambia la intensidad
 * @param {boolean} quieto true si el sistema pide movimiento reducido
 */
export function Respaldo({ estado = "IDLE", quieto = false, etiqueta }) {
  const activo = estado !== "DORMANT";
  const alerta = estado === "ERROR" || estado === "ATTENTION";

  return (
    <svg
      className="nsp-respaldo"
      viewBox="-150 -150 300 300"
      data-quieto={quieto ? "1" : undefined}
      data-estado={estado}
      role={etiqueta ? "img" : "presentation"}
      aria-label={etiqueta || undefined}
      aria-hidden={etiqueta ? undefined : "true"}
    >
      <defs>
        <radialGradient id="nsp-r-halo">
          <stop offset="0%" stopColor={COLOR_CSS.energia} stopOpacity={alerta ? 0.3 : 0.22} />
          <stop offset="55%" stopColor={COLOR_CSS.energia} stopOpacity="0.05" />
          <stop offset="100%" stopColor={COLOR_CSS.energia} stopOpacity="0" />
        </radialGradient>

        {/* El degradado del borde es lo que hace de luz: sin él los arcos son
            manchas negras sobre negro y la silueta desaparece. */}
        <linearGradient id="nsp-r-luz" x1="0" y1="0" x2="0.7" y2="1">
          <stop offset="0%" stopColor={COLOR_CSS.luz} stopOpacity="0.85" />
          <stop offset="45%" stopColor={COLOR_CSS.luz} stopOpacity="0.22" />
          <stop offset="100%" stopColor={COLOR_CSS.luz} stopOpacity="0.03" />
        </linearGradient>

        <linearGradient id="nsp-r-cuerpo" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#15181a" />
          <stop offset="100%" stopColor="#050607" />
        </linearGradient>

        <filter id="nsp-r-brillo" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      <circle r="118" fill="url(#nsp-r-halo)" />

      <g className="nsp-respaldo-cuerpo">
        {CONTORNOS.map(({ d, indice }) => (
          <g key={indice} className="nsp-respaldo-hoja" style={{ "--hoja": indice }}>
            <path d={d} fill="url(#nsp-r-cuerpo)" />
            <path d={d} fill="none" stroke="url(#nsp-r-luz)" strokeWidth="1.1" />
          </g>
        ))}
      </g>

      {/* La retícula. Con energía baja son las seis columnas del logo; con
          energía alta se atenúan, igual que en el shader la formación se
          deshace cuando Nesped se pone a trabajar. */}
      <g
        className="nsp-respaldo-puntos"
        fill={COLOR_CSS.energia}
        opacity={activo ? 0.5 : 0.95}
      >
        {PUNTOS.map((p) => (
          <circle
            key={`${p.col}-${p.k}`}
            cx={p.x}
            cy={p.y}
            r="1.5"
            style={{ "--i": p.col * 3 + p.k }}
          />
        ))}
      </g>
    </svg>
  );
}
