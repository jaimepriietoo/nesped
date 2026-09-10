/* =========================================================================
   Máquina de estados de la Apertura Neural.

   Pura: ni React ni WebGL. Recibe "ahora estás ESCUCHANDO", integra muelles
   y devuelve el vector de magnitudes que el shader consume cada fotograma.

   Vive fuera de React a propósito. Estas magnitudes cambian sesenta veces
   por segundo; meterlas en useState sería repintar el árbol sesenta veces
   por segundo para no cambiar ni un nodo del DOM. La regla del proyecto es
   la de siempre: estado del producto en React, estado de escena aquí, bucle
   de render en su propio rAF.
   ========================================================================= */

import { BASE_ESTADO, ESTADOS, MUELLES } from "./tokens";

/* Qué muelle gobierna cada magnitud. Lo que se lee de lejos va lento; lo que
   tiene que explicar una causa va medio; lo que da filo, rápido. */
const MUELLE_DE = {
  energia: "lento",
  entra: "medio",
  sale: "medio",
  agita: "medio",
  pulso: "rapido",
  respira: "lento",
  ruido: "rapido",
  apertura: "lento",
  formacion: "lento",
  dirigido: "medio",
  fuga: "medio",
  respiracionHz: "lento",
};

const MAGNITUDES = Object.keys(BASE_ESTADO);

function objetivoDe(nombre) {
  const preset = ESTADOS[nombre] || ESTADOS.IDLE;
  const salida = {};
  for (const m of MAGNITUDES) {
    salida[m] = preset[m] !== undefined ? preset[m] : BASE_ESTADO[m];
  }
  return salida;
}

/**
 * Muelle amortiguado crítico.
 *
 * En vez de interpolar hacia el destino con un factor por fotograma —que
 * depende de a cuántos fps vaya el equipo y hace que Nesped se mueva
 * distinto en un portátil que en un móvil— se integra una ecuación con dt
 * real. A 30 fps y a 120 fps el movimiento dura lo mismo.
 */
function integrar(valor, velocidad, destino, muelle, dt) {
  const { rigidez, roce } = muelle;
  // Amortiguamiento crítico: 2·sqrt(k), ajustado por el roce del token.
  const c = 2 * Math.sqrt(rigidez) * roce;
  const a = (destino - valor) * rigidez - velocidad * c;
  const v = velocidad + a * dt;
  return [valor + v * dt, v];
}

export class NucleoEstado {
  constructor(inicial = "IDLE") {
    this.nombre = ESTADOS[inicial] ? inicial : "IDLE";
    this.v = objetivoDe(this.nombre);   // valores actuales
    this.destino = objetivoDe(this.nombre);
    this.vel = {};
    for (const m of MAGNITUDES) this.vel[m] = 0;

    this.t = 0;              // tiempo de escena, en segundos
    this.fase = 0;           // fase de respiración, acumulada aparte
    this.pulsoFase = 0;      // fase del habla
    this.destinoDir = [0, 0, 0];  // hacia dónde apunta ACTING/HANDOFF
    this.dir = [0, 0, 0];
    this.puntero = [0, 0];
    this.punteroSuave = [0, 0];

    /* Estado temporal: SUCCESS y ERROR no son sitios donde quedarse. Se pide
       "haz esto y vuelve", y la vuelta la gestiona la propia máquina para
       que ninguna pantalla tenga que acordarse de deshacerlo. */
    this.vuelveEn = 0;
    this.vuelveA = "IDLE";

    /* Amplitud instantánea de la voz cuando hay audio real. Sin audio se
       queda a -1 y el shader usa su propio pulso sintético: es mejor un
       ritmo inventado que un habla plana, pero si hay señal real se usa. */
    this.amplitud = -1;
  }

  /**
   * @param {string} nombre  uno de los once
   * @param {object} opciones
   *   - durante: segundos tras los que vuelve solo a `luego`
   *   - luego: a qué estado vuelve (por defecto IDLE)
   *   - hacia: [x,y] en coordenadas de pantalla normalizadas (-1..1) del
   *     objetivo real al que se dirige la energía en ACTING / HANDOFF
   */
  ir(nombre, opciones = {}) {
    if (!ESTADOS[nombre]) return;
    this.nombre = nombre;
    this.destino = objetivoDe(nombre);
    this.vuelveEn = opciones.durante || 0;
    this.vuelveA = opciones.luego || "IDLE";
    if (opciones.hacia) {
      this.destinoDir = [opciones.hacia[0], opciones.hacia[1], opciones.hacia[2] ?? 0.35];
    }
  }

  /** Mezcla manual entre dos estados. La usa la película: el scroll no
      "dispara" estados, los recorre. */
  mezclar(a, b, k) {
    const A = objetivoDe(a);
    const B = objetivoDe(b);
    const t = Math.min(1, Math.max(0, k));
    for (const m of MAGNITUDES) this.destino[m] = A[m] + (B[m] - A[m]) * t;
    this.nombre = t < 0.5 ? a : b;
  }

  /** Posición del puntero en coordenadas normalizadas. No la sigue: la usa
      para tensar la superficie del lado por el que estás. */
  mirarPuntero(x, y) {
    this.puntero[0] = x;
    this.puntero[1] = y;
  }

  /** Amplitud real de la voz, 0..1. Pasar -1 para volver al pulso sintético. */
  oirVoz(a) {
    this.amplitud = a;
  }

  avanzar(dt) {
    const paso = Math.min(dt, 0.05); // un frame perdido no puede dar un salto
    this.t += paso;

    if (this.vuelveEn > 0) {
      this.vuelveEn -= paso;
      if (this.vuelveEn <= 0) this.ir(this.vuelveA);
    }

    for (const m of MAGNITUDES) {
      const [valor, vel] = integrar(
        this.v[m], this.vel[m], this.destino[m], MUELLES[MUELLE_DE[m]], paso
      );
      this.v[m] = valor;
      this.vel[m] = vel;
    }

    /* La respiración se acumula por fase, no se calcula como sin(t·hz).
       Si se calculara así, cambiar la frecuencia daría un salto: el mismo
       instante pasaría a valer otra cosa. Acumulando, la frecuencia cambia
       y la onda sigue donde estaba. */
    this.fase += paso * this.v.respiracionHz * Math.PI * 2;
    this.pulsoFase += paso * (2.4 + this.v.pulso * 5.5) * Math.PI * 2;

    for (let i = 0; i < 3; i += 1) {
      this.dir[i] += (this.destinoDir[i] - this.dir[i]) * Math.min(1, paso * 4);
    }
    for (let i = 0; i < 2; i += 1) {
      this.punteroSuave[i] += (this.puntero[i] - this.punteroSuave[i]) * Math.min(1, paso * 2.6);
    }
  }

  /* Lo que se pasa al shader. Se devuelve el mismo objeto siempre para no
     crear basura sesenta veces por segundo. */
  lectura() {
    return this.v;
  }
}
