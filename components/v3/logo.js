/* =========================================================================
   Marca de Nesped.

   El logo anterior eran cuatro barras de distinta altura: legible como
   "gráfico" y por tanto intercambiable con el de cualquier herramienta de
   analítica. No decía nada del producto ni se parecía al resto del sitio.

   Este parte de dos cosas que ya son tuyas:

   - La forma de una onda de voz, que es literalmente lo que vendes.
   - La retícula de puntos de la tipografía display, que es lo que hace que
     la web se reconozca de un vistazo.

   Las alturas no son decorativas: trazan una N —columna alta, descenso,
   columna alta— así que la onda y la inicial son la misma figura.
   ========================================================================= */

/** Altura de cada columna, en número de puntos. Dibuja la N. */
const COLUMNAS = [6, 4, 2, 3, 5, 6];

const PASO = 7.4;   // separación entre columnas
const RADIO = 2.05; // radio de cada punto
const CENTRO = 26;  // eje vertical del lienzo de 52

/**
 * @param {string} color  Color de los puntos. Por defecto casi negro, para
 *                        ir sobre el disco blanco de la cabecera.
 */
export function Logo({ color = "#0a0a0a", title = "" }) {
  const anchoTotal = (COLUMNAS.length - 1) * PASO;
  const x0 = CENTRO - anchoTotal / 2;

  return (
    <svg viewBox="0 0 52 52" role={title ? "img" : "presentation"} aria-hidden={title ? undefined : "true"}>
      {title ? <title>{title}</title> : null}
      <g fill={color}>
        {COLUMNAS.map((puntos, col) =>
          Array.from({ length: puntos }, (_, i) => {
            // Cada columna crece desde el centro hacia arriba y hacia abajo,
            // como una onda simétrica alrededor del eje.
            const desplazamiento = (i - (puntos - 1) / 2) * (RADIO * 2 + 1.35);
            return (
              <circle
                key={`${col}-${i}`}
                cx={x0 + col * PASO}
                cy={CENTRO + desplazamiento}
                r={RADIO}
              />
            );
          })
        )}
      </g>
    </svg>
  );
}
