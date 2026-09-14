/* =========================================================================
   Dirección de la película.

   El scroll no dispara animaciones: ES la línea de tiempo. Cada posición de
   la página corresponde a un fotograma concreto —posición de cámara, luz,
   estado de Nesped, texto visible— y avanzar o retroceder recorre la misma
   película en los dos sentidos.

   La diferencia con "cuando una sección entra, fundido" no es de acabado, es
   de naturaleza: con disparos, dos usuarios que hacen scroll a distinta
   velocidad ven cosas distintas y volver atrás no deshace nada. Aquí la
   posición determina la imagen, siempre.

   No se secuestra el scroll. Lo que se amortigua es la CÁMARA, que sigue a la
   rueda con inercia porque pesa. La página se mueve donde el navegador dice
   que se mueve; quitarle eso al usuario es de las pocas cosas que arruinan
   una web por muy bonita que sea.
   ========================================================================= */

/* ── Los nueve momentos ──────────────────────────────────────────────────
   Cada clave es un fotograma. Entre dos claves se interpola.

   `mira` no suele ser el centro del objeto: moviendo el punto al que apunta
   la cámara, Nesped se desplaza al lado CONTRARIO del encuadre. Así el texto
   de cada acto y el objeto nunca se pisan, y de paso cada plano tiene una
   composición distinta en vez de tenerlo todo centrado siempre.

   Ojo con los planos de dentro: entre 0,48 y 0,56 la cámara da la vuelta, y
   al invertirse la dirección de vista el eje horizontal se invierte con ella.
   Ahí el truco de apartar el objeto con `mira` deja de funcionar —el mismo
   número lo manda a un lado antes de girar y al otro después—, así que esos
   dos planos van centrados y el texto se coloca abajo.

   `estado` es a qué se parece Nesped en ese punto: se mezclan los dos
   estados vecinos con el mismo avance que la cámara, así que Nesped no
   "cambia de estado" en la portada, lo atraviesa. */
import { MOVIMIENTO } from "./tokens";

export const CLAVES = [
  // ACTO 0 — La oscuridad. Nesped ya está ahí; no hay luz que lo revele.
  { p: 0.000, cam: [0.00, 0.04, 5.20], mira: [-0.42, -0.28, 0], fov: 0.50,
    revelado: 0.00, barrido: 2.75, dentro: 0, replica: 0, escala: 1, estado: "DORMANT" },

  // Primera línea de luz. Aparece un borde, nada más.
  { p: 0.045, cam: [0.06, 0.05, 4.55], mira: [-0.42, -0.28, 0], fov: 0.53,
    revelado: 0.30, barrido: 2.05, dentro: 0, replica: 0, escala: 1, estado: "DORMANT" },

  // ACTO I — Despierta. La luz termina de describir el volumen.
  { p: 0.110, cam: [0.16, 0.06, 3.70], mira: [0.92, -0.06, 0], fov: 0.60,
    revelado: 1.00, barrido: 1.25, dentro: 0, replica: 0, escala: 1, estado: "IDLE" },

  // Sabe que estás ahí: la apertura se abre y empieza a entrar energía.
  { p: 0.180, cam: [0.05, 0.02, 2.70], mira: [-0.14, 0.34, 0], fov: 0.66,
    revelado: 1.00, barrido: 0.80, dentro: 0, replica: 0, escala: 1, estado: "LISTENING" },

  // ACTO II — La apertura ocupa la pantalla. Todavía estamos fuera.
  { p: 0.250, cam: [0.00, 0.00, 1.15], mira: [0, 0.05, -0.4], fov: 0.88,
    revelado: 1.00, barrido: 0.45, dentro: 0.22, replica: 0, escala: 1, estado: "LISTENING" },

  // Atravesamos. El material pasa por los lados de la cámara.
  { p: 0.320, cam: [0.00, 0.00, 0.05], mira: [0, 0, -1.0], fov: 1.05,
    revelado: 1.00, barrido: 0.10, dentro: 0.80, replica: 0, escala: 1, estado: "UNDERSTANDING" },

  // ACTO III — Dentro. La voz entra y se separa en significado.
  { p: 0.400, cam: [0.00, 0.00, -1.10], mira: [0, 0, -2.2], fov: 1.00,
    revelado: 1.00, barrido: -0.35, dentro: 1.00, replica: 0, escala: 1, estado: "UNDERSTANDING" },

  // ACTO IV — Memoria. Lo anterior toca lo de ahora.
  { p: 0.480, cam: [0.22, 0.06, -1.95], mira: [0, 0, -3.0], fov: 0.96,
    revelado: 1.00, barrido: -0.85, dentro: 1.00, replica: 0, escala: 1, estado: "THINKING" },

  // La decisión se forma y la cámara empieza a dar la vuelta.
  { p: 0.560, cam: [-0.30, 0.02, -2.90], mira: [0, 0, -1.2], fov: 0.88,
    revelado: 1.00, barrido: -1.5, dentro: 0.85, replica: 0, escala: 1, estado: "THINKING" },

  /* Salimos por el otro lado. Se ve a Nesped desde detrás: es el mismo
     objeto y a la vez un sitio nuevo, que es exactamente la sensación que
     tiene que quedar de haberlo atravesado. */
  { p: 0.625, cam: [0.10, 0.10, -3.60], mira: [-0.35, 0.20, 0], fov: 0.66,
    revelado: 1.00, barrido: -2.2, dentro: 0.15, replica: 0, escala: 1, estado: "SPEAKING" },

  // ACTO V — Actúa. La cámara orbita mientras la energía sale hacia fuera.
  { p: 0.700, cam: [1.75, 0.62, -1.85], mira: [0.32, 0.10, 0], fov: 0.60,
    revelado: 1.00, barrido: -3.0, dentro: 0, replica: 0, escala: 1, estado: "ACTING" },

  // ACTO VI — Mira a Nesped trabajar. De perfil, con la interfaz alrededor.
  { p: 0.780, cam: [1.55, 0.52, 2.55], mira: [0.82, 0.06, 0], fov: 0.56,
    revelado: 1.00, barrido: -3.9, dentro: 0, replica: 0, escala: 1, estado: "ACTING" },

  // ACTO VII — Escala. Se despliega en profundidad, no en cien copias.
  { p: 0.860, cam: [0.70, 0.16, 4.10], mira: [0.10, 0.62, -0.2], fov: 0.74,
    revelado: 1.00, barrido: -4.7, dentro: 0, replica: 1, escala: 1, estado: "ACTING" },

  { p: 0.915, cam: [0.22, 0.10, 4.55], mira: [0, 0.62, -0.1], fov: 0.70,
    revelado: 1.00, barrido: -5.4, dentro: 0, replica: 0.55, escala: 1, estado: "SUCCESS" },

  // ACTO VIII — Cierre. Volvemos al principio sabiendo lo que hace.
  { p: 1.000, cam: [0.00, 0.06, 3.35], mira: [0, 0.52, 0], fov: 0.62,
    revelado: 1.00, barrido: -6.1, dentro: 0, replica: 0, escala: 1, estado: "IDLE" },
];

const suave = (t) => t * t * (3 - 2 * t);
const mezcla = (a, b, t) => a + (b - a) * t;

function interpolar(k0, k1, t) {
  const s = suave(t);
  return {
    cam: [
      mezcla(k0.cam[0], k1.cam[0], s),
      mezcla(k0.cam[1], k1.cam[1], s),
      mezcla(k0.cam[2], k1.cam[2], s),
    ],
    mira: [
      mezcla(k0.mira[0], k1.mira[0], s),
      mezcla(k0.mira[1], k1.mira[1], s),
      mezcla(k0.mira[2], k1.mira[2], s),
    ],
    fov: mezcla(k0.fov, k1.fov, s),
    revelado: mezcla(k0.revelado, k1.revelado, s),
    barrido: mezcla(k0.barrido, k1.barrido, s),
    dentro: mezcla(k0.dentro, k1.dentro, s),
    replica: mezcla(k0.replica, k1.replica, s),
    escala: mezcla(k0.escala, k1.escala, s),
    estados: [k0.estado, k1.estado, s],
  };
}

export class Director {
  /**
   * @param {HTMLElement} pelicula  el bloque cuyo scroll ES la película
   * @param {object} direccion      objeto de cámara que lee el renderer
   * @param {() => NucleoEstado|null} buscarMaquina
   * @param {(p:number)=>void} alAvanzar  para que la interfaz pinte el avance
   */
  constructor({ pelicula, direccion, buscarMaquina, alAvanzar, antesDeCada }) {
    this.pelicula = pelicula;
    this.direccion = direccion;
    /* La máquina de estados llega con el núcleo, que se descarga aparte. Se
       recibe un buscador en vez del objeto para que el director pueda montarse
       antes y empezar a dirigir la cámara mientras el núcleo termina de
       llegar; en cuanto está, entra en la película sin sobresaltos. */
    this.buscarMaquina = buscarMaquina || (() => null);
    this.alAvanzar = alAvanzar || (() => {});
    /* Se llama antes de cada fotograma y puede congelar la película. Lo usa
       la portada para soltar la cámara cuando el scroll ya ha salido de la
       película y el núcleo se ancla en su esquina. */
    this.antesDeCada = antesDeCada || (() => {});
    this.congelado = false;
    this.p = 0;
    this.pSuave = 0;
    this.vel = 0;
    this.raf = 0;
    this.vivo = false;
    this.ultimo = 0;

    /* La obertura.

       La escena de apertura consiste en que Nesped salga de la oscuridad, y
       eso no puede depender de que alguien mueva la rueda: quien se queda
       mirando los primeros segundos vería un titular a un siete por ciento de
       opacidad y un objeto que no está. Así que los dos primeros segundos y
       pico los dirige el reloj, hasta justo donde la luz ya ha descrito la
       silueta. A partir de ahí, y en cuanto alguien hace scroll, manda el
       scroll.

       Con movimiento reducido no hay obertura: se entra con la luz puesta. */
    this.arriba = 0;
    this.recorrido = 0;
    this.alto = 0;

    this.obertura = 2.4;
    this.OBERTURA = 2.4;
    this.HASTA = 0.075;
    this.piso = 0;
    if (typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.obertura = 0;
      this.piso = this.HASTA;
    }
  }

  /**
   * Dónde está la película, sin tocar la maquetación.
   *
   * Medía con getBoundingClientRect() en cada fotograma, y eso obliga al
   * navegador a recalcular la maquetación sesenta veces por segundo. Con la
   * página que hay debajo —doce mil píxeles de alto— eso cuesta más que
   * pintar la escena entera.
   *
   * La posición y la altura del bloque sólo cambian cuando cambia el tamaño
   * de la ventana, así que se miden entonces y aquí sólo se lee el scroll,
   * que es un número que el navegador ya tiene.
   */
  medir() {
    if (this.recorrido <= 0) return 0;
    return Math.min(1, Math.max(0, (window.scrollY - this.arriba) / this.recorrido));
  }

  /** Vuelve a medir la caja de la película. Sólo al montar y al redimensionar. */
  remedir() {
    const caja = this.pelicula.getBoundingClientRect();
    this.arriba = caja.top + window.scrollY;
    this.recorrido = caja.height - window.innerHeight;
    this.alto = window.innerHeight;
  }

  montar() {
    this.vivo = true;
    this.ultimo = performance.now();
    this.remedir();

    /* La caja sólo cambia al redimensionar. Se vuelve a medir ahí y no en
       cada fotograma. */
    this.alRedimensionar = () => this.remedir();
    window.addEventListener("resize", this.alRedimensionar, { passive: true });

    /* Si se entra a media página —un enlace a #planes, o el navegador
       recuperando la posición anterior— no hay obertura que valga: la
       película ya está empezada. */
    const scroll = this.medir();
    if (scroll > 0.002) {
      this.obertura = 0;
      this.piso = this.HASTA;
    }

    this.p = this.obertura > 0 ? 0 : Math.max(scroll, this.piso);
    this.pSuave = this.p;
    this.aplicar(this.p);
    this.raf = requestAnimationFrame(this.tic);
  }

  tic = (ahora) => {
    if (!this.vivo) return;
    this.raf = requestAnimationFrame(this.tic);

    this.antesDeCada();
    // Congelada, el bucle sigue vivo: si se vuelve hacia arriba, la película
    // tiene que retomar exactamente donde estaba.
    if (this.congelado) return;

    const dt = Math.min(0.05, (ahora - this.ultimo) / 1000) || 0.016;
    this.ultimo = ahora;

    const scroll = this.medir();

    if (this.obertura > 0) {
      // El primer gesto de scroll cancela la obertura y toma el mando.
      if (scroll > 0.002) this.obertura = 0;
      else this.obertura = Math.max(0, this.obertura - dt);
      if (this.obertura === 0) this.piso = this.HASTA;
    }

    /* Terminada la obertura, la revelación no se deshace.

       El suelo se queda en donde la luz terminó de describir el objeto, así
       que volver arriba del todo devuelve a Nesped revelado y al titular
       legible, no a la oscuridad inicial. La escena de apertura pasa una vez;
       lo que se recorre en los dos sentidos es la película. */
    this.p = this.obertura > 0
      ? suave(1 - this.obertura / this.OBERTURA) * this.HASTA
      : Math.max(scroll, this.piso);

    /* La cámara llega con retraso a donde ha llegado la rueda. Es un muelle,
       no una interpolación por fotograma: así el retraso dura lo mismo en un
       monitor de 60 Hz que en uno de 144. */
    const k = MOVIMIENTO.camaraRigidez;
    const c = 2 * Math.sqrt(k) * MOVIMIENTO.camaraAmortiguacion;
    const a = (this.p - this.pSuave) * k - this.vel * c;
    this.vel += a * dt;
    this.pSuave += this.vel * dt;

    this.aplicar(this.pSuave);
    this.alAvanzar(this.pSuave);
  };

  aplicar(p) {
    let i = 0;
    while (i < CLAVES.length - 2 && p > CLAVES[i + 1].p) i += 1;
    const k0 = CLAVES[i];
    const k1 = CLAVES[i + 1];
    const t = k1.p === k0.p ? 0 : (p - k0.p) / (k1.p - k0.p);
    const v = interpolar(k0, k1, Math.min(1, Math.max(0, t)));

    const d = this.direccion;
    d.cam[0] = v.cam[0]; d.cam[1] = v.cam[1]; d.cam[2] = v.cam[2];
    d.mira[0] = v.mira[0]; d.mira[1] = v.mira[1]; d.mira[2] = v.mira[2];
    d.fov = v.fov;

    /* Móvil no es escritorio encogido.

       En horizontal no hay sitio para apartar el objeto a un lado y dejar el
       texto en el otro: se sale del encuadre. Así que el desplazamiento pasa
       a ser vertical —Nesped arriba, el texto debajo— y se abre el campo de
       visión para que quepa entero. La película es la misma; el encuadre no. */
    if (typeof window !== "undefined" && window.innerWidth < 760) {
      d.mira[0] = v.mira[0] * 0.28;
      d.mira[1] = v.mira[1] - 0.34;
      d.fov = v.fov * 1.18;
      /* Y la cámara se retira un poco. Sólo con abrir el campo de visión, en
         los planos cercanos el objeto se sale por los lados de una pantalla
         estrecha; alejándola además, entra entero sin deformar la
         perspectiva. */
      d.cam[0] = v.cam[0] * 1.18;
      d.cam[1] = v.cam[1] * 1.18;
      d.cam[2] = v.cam[2] * 1.18;
    }
    d.revelado = v.revelado;
    d.barrido = v.barrido;
    d.dentro = v.dentro;
    d.replica = v.replica;
    d.escala = v.escala;

    const maquina = this.buscarMaquina();
    if (maquina) {
      maquina.mezclar(v.estados[0], v.estados[1], v.estados[2]);
      /* En el acto de la acción la energía apunta hacia donde está la
         interfaz de verdad, no a un punto decorativo. */
      if (p > 0.66 && p < 0.86) maquina.destinoDir = [0.85, -0.35, 0.4];
      else maquina.destinoDir = [0, 0, 1];
    }
  }

  desmontar() {
    this.vivo = false;
    cancelAnimationFrame(this.raf);
    if (this.alRedimensionar) window.removeEventListener("resize", this.alRedimensionar);
  }
}

/**
 * Avance local de un acto.
 *
 * Devuelve 0 antes de entrar, sube a 1 mientras el acto es el protagonista y
 * vuelve a 0 al salir. Con esto el texto no se "activa": entra y sale con la
 * misma película, y retroceder lo deshace.
 */
export function avanceActo(p, desde, hasta, margen = 0.013) {
  if (p < desde - margen || p > hasta + margen) return 0;
  const entrada = Math.min(1, Math.max(0, (p - (desde - margen)) / margen));
  const salida = Math.min(1, Math.max(0, ((hasta + margen) - p) / margen));
  return Math.min(entrada, salida);
}

/**
 * Dónde cae el centro de la apertura en la pantalla, en píxeles.
 *
 * Se proyecta el origen del mundo con la misma cámara que usa el shader, así
 * que el resultado coincide al píxel con lo que se está viendo. Lo necesita
 * el acto de la acción: si el haz de energía no sale exactamente del vacío
 * central, deja de leerse como que sale de Nesped y pasa a ser una raya.
 */
export function proyectarNucleo(direccion, ancho, alto) {
  const { cam, mira, fov } = direccion;
  const v = [mira[0] - cam[0], mira[1] - cam[1], mira[2] - cam[2]];
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  const ade = [v[0] / n, v[1] / n, v[2] / n];

  /* der = normalize(cross(ade, arriba)) con arriba = (0,1,0), que se reduce
     a (-ade.z, 0, ade.x). Con el signo cambiado el eje horizontal queda del
     revés y el haz sale por el lado contrario del objeto. */
  const cx = -ade[2], cz = ade[0];
  const cn = Math.hypot(cx, cz) || 1;
  const der = [cx / cn, 0, cz / cn];
  // arr = cross(der, ade)
  const arr = [
    der[1] * ade[2] - der[2] * ade[1],
    der[2] * ade[0] - der[0] * ade[2],
    der[0] * ade[1] - der[1] * ade[0],
  ];

  const w = [-cam[0], -cam[1], -cam[2]];       // del ojo al origen
  const z = w[0] * ade[0] + w[1] * ade[1] + w[2] * ade[2];
  if (z <= 0.05) return null;                   // el núcleo queda detrás
  const x = w[0] * der[0] + w[1] * der[1] + w[2] * der[2];
  const y = w[0] * arr[0] + w[1] * arr[1] + w[2] * arr[2];

  /* El shader normaliza las coordenadas por la ALTURA, no por la anchura:
     xy = (frag*2 - res) / res.y. Deshacerlo por la anchura desplaza el punto
     en cuanto la ventana deja de ser cuadrada. */
  return {
    x: ancho / 2 + (x / (z * fov)) * (alto / 2),
    y: alto / 2 - (y / (z * fov)) * (alto / 2),
  };
}
