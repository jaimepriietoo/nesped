/* =========================================================================
   La silueta de la Apertura Neural en 2D.

   Misma geometría que el shader, resuelta en el servidor: se proyectan los
   tres arcos y se devuelven los contornos ya cerrados. La usa el respaldo sin
   WebGL, y podría usarla cualquier sitio donde haga falta Nesped quieto.

   Existe para que el respaldo no sea "otra web". Quien entra con movimiento
   reducido, o desde un navegador sin WebGL, tiene que ver EL MISMO objeto:
   los mismos tres arcos, el mismo vacío, el mismo ritmo. Lo que pierde es la
   luz y la profundidad, no la identidad.
   ========================================================================= */

import { MEMBRANAS } from "./tokens";

function girar(p, ax, ay) {
  // Alrededor de X
  let [x, y, z] = p;
  let c = Math.cos(ax), s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  // Alrededor de Y
  c = Math.cos(ay); s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  return [x, y, z];
}

/**
 * @param {number} escala  radio 1 del objeto → este radio en el lienzo
 * @param {number} muestras puntos por arco
 * @returns {{d: string, indice: number}[]} un contorno cerrado por membrana
 */
export function contornos(escala = 100, muestras = 74) {
  return MEMBRANAS.map((m, indice) => {
    const fuera = [];
    const dentro = [];

    for (let i = 0; i <= muestras; i += 1) {
      const u = i / muestras;
      const phi = m.centro - m.arco / 2 + u * m.arco;

      const rr = m.radio + m.ondaR[1] * Math.cos(m.ondaR[0] * phi + m.centro);
      const zz = m.z + m.zAmp * Math.sin(phi + m.centro);

      /* Afilado en las dos puntas, con la MISMA curva que el shader. Estuvo
         distinta un rato y el respaldo dibujaba unas puntas que no se parecían
         a nada: la alternativa sin WebGL tiene que ser el mismo objeto, no un
         primo lejano.

         El shader la calcula a partir de k —la posición dentro del arco medida
         con cosenos, para ahorrarse un arcotangente por paso— y aquí, que se
         resuelve una vez en el servidor, se llega a lo mismo desde u. */
      const k = Math.max(0, 1 - Math.pow(2 * u - 1, 2));
      const sn = Math.sqrt(k);
      const th = m.grosor * sn * (1.62 - 0.62 * sn);

      const centro = girar([Math.cos(phi) * rr, Math.sin(phi) * rr, zz],
        m.inclina[0], m.inclina[1]);

      /* La normal del contorno se toma radial: sobre un arco barrido es la
         dirección en la que crece el grosor, y evita derivar la tangente
         numéricamente para ganar una fracción de píxel. */
      const nx = Math.cos(phi), ny = Math.sin(phi);
      const a = girar([(rr + th) * nx, (rr + th) * ny, zz], m.inclina[0], m.inclina[1]);
      const b = girar([(rr - th) * nx, (rr - th) * ny, zz], m.inclina[0], m.inclina[1]);

      // Y invertida: en SVG crece hacia abajo.
      fuera.push([a[0] * escala, -a[1] * escala]);
      dentro.push([b[0] * escala, -b[1] * escala]);
      void centro;
    }

    const p = (pt) => `${pt[0].toFixed(2)},${pt[1].toFixed(2)}`;
    const d = [
      `M${p(fuera[0])}`,
      ...fuera.slice(1).map((pt) => `L${p(pt)}`),
      ...dentro.reverse().map((pt) => `L${p(pt)}`),
      "Z",
    ].join("");

    return { d, indice };
  });
}

/* Los puntos del logo dentro del vacío: las mismas seis columnas y las
   mismas alturas que el shader ordena cuando Nesped está dormido. */
export function puntosLogo(escala = 100) {
  const ALTURAS = [6, 4, 2, 3, 5, 6];
  const PASO_X = 0.128;
  const PASO_Y = 0.098;
  const puntos = [];
  ALTURAS.forEach((alt, col) => {
    for (let k = 0; k < alt; k += 1) {
      puntos.push({
        x: (col - 2.5) * PASO_X * escala,
        y: -(k - (alt - 1) / 2) * PASO_Y * escala,
        col,
        k,
      });
    }
  });
  return puntos;
}
