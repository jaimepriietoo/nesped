/* =========================================================================
   Apertura Neural — una sola fuente de verdad.

   Todo lo que define cómo se ve y cómo se mueve Nesped vive aquí: la
   geometría, el material, los colores y —sobre todo— los once estados y su
   gramática. Ni el shader ni la landing ni el portal inventan valores.

   La razón no es ordenarlo por gusto: si "escuchar" se anima distinto en la
   portada y en el panel, deja de ser un lenguaje y pasa a ser decoración.
   Cambiar aquí `AGITACION` cambia el carácter de Nesped en todo el producto.
   ========================================================================= */

/* ── Color ──────────────────────────────────────────────────────────────
   El sitio es negro y blanco. El único color vivo del sistema ya existía:
   es el `--ok` del portal. Se asciende a color de energía de la marca en
   vez de inventar otro, porque un cliente que ve el panel y luego la web
   tiene que reconocer el mismo verde.

   La energía NO es decoración: su intensidad dice qué está haciendo Nesped.
   Por eso hay dos: el verde de la señal y el blanco cálido del núcleo, que
   sólo aparece cuando la energía se concentra de verdad. */
export const COLOR = {
  fondo: [0.0, 0.0, 0.0],
  /* Blanco cálido, no puro: el blanco puro sobre negro absoluto vibra en
     los bordes y delata que es una pantalla, no un objeto. */
  luz: [0.965, 0.945, 0.906],
  energia: [0.494, 0.890, 0.741],   // #7ee3bd — el verde del portal
  energiaAlta: [0.804, 1.0, 0.937], // hacia dónde va al saturarse
  /* La cerámica oscura de las membranas. Casi negra: lo que la separa del
     fondo es la luz que le da, no su color. */
  materia: [0.043, 0.047, 0.051],
};

export const COLOR_CSS = {
  energia: "#7ee3bd",
  energiaTenue: "rgba(126, 227, 189, 0.18)",
  luz: "#f6f1e7",
  linea: "rgba(255, 255, 255, 0.09)",
};

/* ── Geometría ──────────────────────────────────────────────────────────
   Tres membranas asimétricas alrededor de un vacío central.

   Sus proporciones no son arbitrarias: salen de las alturas de las columnas
   del logo, [6,4,2,3,5,6], leídas por parejas. Cada pareja da el arco y el
   grosor de una membrana. De ahí que la silueta tenga el mismo ritmo
   irregular que la marca sin dibujar la marca en ningún sitio.

   Consecuencia buscada: desde algunos ángulos parece un anillo cerrado y
   desde otros está abierto, porque los tres arcos suman 5,6 de los 6,28
   radianes de una vuelta. Sobra hueco, y el hueco es lo que se ve. */
const N = (v) => v / 6;

export const MEMBRANAS = [
  {
    // (6,4): el arco largo, grosor medio. Es la que da la lectura de anillo.
    centro: 0.0,
    arco: N(6) * 2.62,
    radio: 0.90,
    grosor: N(4) * 0.26,
    // Inclinación: ninguna de las tres vive en el mismo plano, y por eso la
    // silueta cambia de familia al girar tres grados.
    inclina: [0.16, -0.08],
    // Desplazamiento y amplitud en el eje del vacío: la membrana no es plana,
    // sube y baja mientras recorre su arco.
    z: 0.02,
    zAmp: 0.26,
    // Armónicos del radio: el arco no es un círculo, respira hacia fuera.
    ondaR: [2.0, 0.085],
    // Costillas de grosor. Son las que desaparecen sin luz rasante.
    costillas: 9.0,
  },
  {
    // (2,3): el arco corto. Es el que rompe la simetría y hace que la
    // silueta cueste clasificar.
    centro: 2.28,
    arco: N(2) * 2.62,
    radio: 0.93,
    grosor: N(3) * 0.26,
    inclina: [-0.26, 0.20],
    z: 0.46,
    zAmp: 0.30,
    ondaR: [3.0, 0.06],
    costillas: 5.0,
  },
  {
    // (5,6): arco largo y la más gruesa. Ancla la masa hacia un lado.
    centro: 4.12,
    arco: N(5) * 2.62,
    radio: 0.96,
    grosor: N(6) * 0.26,
    inclina: [0.05, 0.24],
    z: -0.40,
    zAmp: 0.34,
    ondaR: [2.0, 0.11],
    costillas: 12.0,
  },
];

/* Radio del vacío central en reposo. La cámara cabe por él: es literalmente
   por donde se entra.

   No sale de aquí, sale de las tres membranas: cada una deja su borde
   interior en 0,70 / 0,78 / 0,66. Que no coincidan es deliberado —un agujero
   perfectamente circular se lee como un aro industrial— pero que anden cerca
   es lo que hace que las tres, juntas, se lean como UNA apertura y no como
   tres piezas sueltas alrededor de un hueco. */
export const VACIO = 0.70;

/* ── Movimiento ─────────────────────────────────────────────────────────
   Nesped tiene masa. Nada salta: todo llega por muelle amortiguado.

   `rigidez` alta = reacciona antes; `roce` alto = frena antes. Los valores
   están calibrados para que un cambio de estado tarde entre medio segundo
   y segundo y medio, que es el tiempo en el que algo grande cambia de
   dirección sin parecer nervioso ni muerto. */
export const MUELLES = {
  // Lo que se ve de lejos se mueve despacio: energía y apertura.
  lento: { rigidez: 3.2, roce: 1.0 },
  // Los flujos tienen que llegar a tiempo de explicar la causa.
  medio: { rigidez: 6.0, roce: 1.0 },
  // El pulso del habla y el temblor del error necesitan filo.
  rapido: { rigidez: 11.0, roce: 0.95 },
};

/* ── Los once estados ───────────────────────────────────────────────────
   Cada estado es una combinación de siete magnitudes. No hay animaciones
   sueltas: todo lo que Nesped hace es un punto en este espacio, y pasar de
   un estado a otro es viajar entre dos puntos con muelles.

   La gramática es la que se lee sin texto:

     entra  > 0   la energía va HACIA DENTRO   → Nesped recibe
     agita  > 0   la energía se mueve DENTRO   → comprende o piensa
     sale   > 0   la energía va HACIA FUERA    → ejecuta
     pulso  > 0   salidas RÍTMICAS             → habla
     respira      está disponible
     ruido  > 0   inestabilidad temporal       → atención o error
*/
export const ESTADOS = {
  /* Casi dormido. La energía es tan baja que se ordena sola en la retícula
     del logo dentro del vacío: es el único momento en que la marca aparece
     dentro del objeto, y aparece porque no hay nada que la deshaga. */
  DORMANT: {
    energia: 0.08, entra: 0.0, sale: 0.0, agita: 0.03,
    pulso: 0.0, respira: 0.35, ruido: 0.0, apertura: 0.82, formacion: 1.0,
    respiracionHz: 0.085,
  },

  /* Disponible. Dice "estoy aquí" y nada más. Es donde vive el producto el
     99 % del tiempo, así que tiene que aguantar mirarse una hora. */
  IDLE: {
    energia: 0.26, entra: 0.0, sale: 0.0, agita: 0.14,
    pulso: 0.0, respira: 1.0, ruido: 0.0, apertura: 1.0, formacion: 0.12,
    respiracionHz: 0.17,
  },

  /* Información entrando. Dirección inequívoca: hacia dentro. La apertura
     se abre un punto más, como una pupila. */
  LISTENING: {
    energia: 0.52, entra: 1.0, sale: 0.0, agita: 0.22,
    pulso: 0.0, respira: 0.7, ruido: 0.0, apertura: 1.16, formacion: 0.0,
    respiracionHz: 0.26,
  },

  /* Lo recibido empieza a ordenarse. Aparecen relaciones: la agitación sube
     pero el flujo de entrada baja, porque ya no entra, ya está dentro. */
  UNDERSTANDING: {
    energia: 0.66, entra: 0.28, sale: 0.0, agita: 0.62,
    pulso: 0.0, respira: 0.5, ruido: 0.0, apertura: 1.04, formacion: 0.42,
    respiracionHz: 0.3,
  },

  /* Movimiento interno puro. Nunca un giro constante: los filamentos se
     reorganizan y la superficie apenas se entera. */
  THINKING: {
    energia: 0.72, entra: 0.0, sale: 0.0, agita: 1.0,
    pulso: 0.0, respira: 0.35, ruido: 0.05, apertura: 0.9, formacion: 0.1,
    respiracionHz: 0.42,
  },

  /* Pulsos organizados hacia fuera. La actividad nace dentro, alcanza la
     membrana y sale como onda: por eso `pulso` y `sale` van juntos pero
     `agita` se mantiene alto, la voz viene de dentro. */
  SPEAKING: {
    energia: 0.82, entra: 0.0, sale: 0.55, agita: 0.7,
    pulso: 1.0, respira: 0.4, ruido: 0.0, apertura: 1.06, formacion: 0.0,
    respiracionHz: 0.5,
  },

  /* Energía dirigida a un objetivo real de la interfaz. Es el único estado
     con dirección: los demás son radiales. */
  ACTING: {
    energia: 0.9, entra: 0.0, sale: 1.0, agita: 0.5,
    pulso: 0.25, respira: 0.3, ruido: 0.0, apertura: 0.86, formacion: 0.0,
    respiracionHz: 0.38, dirigido: 1.0,
  },

  /* Expansión breve y se acabó. Sin confeti: lo que dice "hecho" es que
     todo vuelve a la calma inmediatamente después. */
  SUCCESS: {
    energia: 1.0, entra: 0.0, sale: 0.7, agita: 0.3,
    pulso: 0.0, respira: 0.5, ruido: 0.0, apertura: 1.3, formacion: 0.0,
    respiracionHz: 0.2,
  },

  /* Nesped necesita algo. Perceptible desde el rabillo del ojo sin parecer
     nervioso: la respiración se acelera y hay un ruido bajo constante. */
  ATTENTION: {
    energia: 0.6, entra: 0.0, sale: 0.2, agita: 0.35,
    pulso: 0.45, respira: 1.3, ruido: 0.22, apertura: 0.94, formacion: 0.0,
    respiracionHz: 0.62,
  },

  /* Inestabilidad y recuperación. Nesped no se muere nunca: el estado tiende
     solo hacia IDLE, y el texto del error lo pone la interfaz, no el objeto.
     Un fallo que sólo se ve como temblor es un fallo que nadie entiende. */
  ERROR: {
    energia: 0.44, entra: 0.0, sale: 0.0, agita: 0.5,
    pulso: 0.0, respira: 0.8, ruido: 1.0, apertura: 0.72, formacion: 0.0,
    respiracionHz: 0.55,
  },

  /* Parte de la energía se va hacia una persona. Es un ACTING que no vuelve:
     sale menos, pero lo que sale no regresa al núcleo. */
  HANDOFF: {
    energia: 0.7, entra: 0.0, sale: 0.8, agita: 0.25,
    pulso: 0.0, respira: 0.6, ruido: 0.0, apertura: 1.1, formacion: 0.0,
    respiracionHz: 0.28, dirigido: 1.0, fuga: 1.0,
  },
};

export const NOMBRES_ESTADO = Object.keys(ESTADOS);

/* Valores por defecto de las magnitudes que no todos los estados declaran.
   Se centraliza para que añadir una magnitud nueva no obligue a tocar los
   once estados. */
export const BASE_ESTADO = {
  energia: 0, entra: 0, sale: 0, agita: 0, pulso: 0, respira: 1,
  ruido: 0, apertura: 1, formacion: 0, dirigido: 0, fuga: 0,
  respiracionHz: 0.17,
};

/* ── Cámara ─────────────────────────────────────────────────────────────
   Distancia de reposo y campo de visión. La landing los mueve; el portal no
   los toca nunca. */
export const CAMARA = {
  distancia: 3.35,
  fov: 0.62,
  // Cuánto responde a la posición del puntero. Es tensión, no seguimiento:
  // dos centésimas de radián. Nesped sabe que estás ahí, no te persigue.
  atencionPuntero: 0.035,
};

/* ── Calidad ────────────────────────────────────────────────────────────
   Una web preciosa a 17 fps es una mala web. Cada nivel dice cuántos pasos
   de marcha, a qué resolución se pinta el núcleo y si hay halo.

   `escala` es la fracción del lienzo a la que se renderiza: el objeto es
   oscuro y suave, así que reescalar de 0,72 a 1 no se nota, y ahorra la
   mitad de los píxeles. */
/* `pasos` es la marcha de la superficie y `pasosVol` la del volumen.

   El volumen necesita muchos menos de los que parecería, y es por cómo están
   hechos los hilos de luz: no se integran muestreándolos —eso es lo que los
   convertía en una mancha— sino por la distancia mínima del rayo a cada uno,
   que es exacta y no depende del número de pasos. Lo que queda a pasos es la
   vaina, los anillos y la retícula, que son todos suaves. Por eso bajar de
   ochenta y ocho a cincuenta y seis no se nota y ahorra un tercio.

   `sombra` es el número de pasos de la sombra proyectada, y es el gasto extra
   más caro que hay: se paga por cada píxel que toca el objeto, encima de la
   marcha principal. En calidad baja va a cero —sin sombra el objeto sigue
   teniendo volumen porque lo dan el especular y el borde. */
export const CALIDAD = {
  alta:  { pasos: 110, pasosVol: 56, sombra: 12, escala: 1.0,  dprMax: 2.0, halo: true,  micro: true },
  media: { pasos: 76, pasosVol: 32, sombra: 10, escala: 0.85, dprMax: 1.5, halo: true,  micro: true },
  baja:  { pasos: 48, pasosVol: 18, sombra: 0,  escala: 0.65, dprMax: 1.0, halo: false, micro: false },
};

/* Cuándo bajar de nivel.

   `muestras` es cuántos fotogramas se juntan antes de decidir por la mediana:
   alto a propósito, porque bajar la calidad por un pico de dos fotogramas se
   ve peor que el pico. `urgente` es la excepción: un solo fotograma por
   encima de eso no es un pico, es un equipo que no puede, y ahí se baja al
   momento en vez de dejar la página agarrotada mientras se reúne la muestra. */
export const VIGILANCIA = { objetivoMs: 22, urgente: 125, muestras: 30, margen: 0.55 };

/**
 * Estado inicial de la cámara.
 *
 * Vive aquí y no en el renderer a propósito: quien monta la escena —la
 * portada, el banco de pruebas— necesita este objeto ANTES de que se haya
 * descargado la capa de WebGL, porque es el objeto que van a compartir. Si lo
 * creara el renderer, el director podría montarse antes que él y quedarse
 * dirigiendo la nada.
 */
export function direccionInicial() {
  return {
    cam: [0, 0.06, CAMARA.distancia],
    mira: [0, 0, 0],
    fov: CAMARA.fov,
    revelado: 1,      // 0 = oscuridad total; 1 = luz plena
    barrido: 0.9,     // ángulo de la luz clave
    dentro: 0,        // 0 fuera, 1 dentro de la apertura
    escala: 1,        // multiplicador global de exposición
    replica: 0,       // cuántas conversaciones llegan a la vez
    /* Cuánto se pinta del fondo de la escena.
       A 1 hay una caída radial de dos milésimas: parece nada y es lo que
       permite que en la escena de apertura la refracción distorsione algo
       visible —distorsionar negro puro da negro puro. A 0 el lienzo es negro
       absoluto, que es lo que hace falta cuando el núcleo va anclado encima
       del contenido y se mezcla en modo `screen`: si el fondo no es cero, se
       ve el rectángulo del lienzo. */
    fondo: 1,
  };
}
