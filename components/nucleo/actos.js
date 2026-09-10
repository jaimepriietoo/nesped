/* =========================================================================
   Los actos de la película y su contenido.

   Separado de la página para que se pueda leer la narración de un tirón: qué
   pasa, en qué orden y con qué palabras. Los tramos son fracciones de la
   película completa y tienen que casar con las claves de cámara de
   director.js —cada acto ocurre mientras la cámara está donde toca.
   ========================================================================= */

export const ACTOS = {
  /*
   * Cada acto deja tres centésimas de hueco con el siguiente.
   *
   * No es estética: `avanceActo` abre y cierra cada cartel con un margen a
   * cada lado, y con huecos más estrechos que ese margen dos actos están
   * encendidos a la vez. Pasaba al final —"Una inteligencia" y el cierre se
   * pisaban letra sobre letra— y no se ve venir leyendo los números.
   *
   * De paso queda lo que hacía falta: tramos donde no hay una sola palabra en
   * pantalla y sólo está Nesped.
   */
  revelacion: { desde: 0.000, hasta: 0.070 },
  despierta:  { desde: 0.100, hasta: 0.165 },
  escucha:    { desde: 0.195, hasta: 0.245 },
  dentro:     { desde: 0.275, hasta: 0.345 },
  voz:        { desde: 0.375, hasta: 0.470 },
  memoria:    { desde: 0.500, hasta: 0.585 },
  actua:      { desde: 0.615, hasta: 0.685 },
  trabajo:    { desde: 0.715, hasta: 0.830 },
  escala:     { desde: 0.860, hasta: 0.920 },
  cierre:     { desde: 0.950, hasta: 1.000 },
};

/**
 * Lo que Nesped separa de la frase del cliente.
 *
 * No son etiquetas decorativas: cada una sale de una parte concreta de la
 * llamada real que ya está publicada en el sitio. Si la muestra cambia, esto
 * se queda mintiendo, así que va emparejado con el segundo del audio del que
 * procede.
 */
export const CONCEPTOS = [
  { t: "PRESUPUESTO", en: 1.5 },
  { t: "AEROTERMIA", en: 1.5 },
  { t: "VIVIENDA UNIFAMILIAR", en: 1.5 },
  { t: "TIENE PRISA", en: 1.5 },
  { t: "NOMBRE: JAVIER", en: 9.4 },
  { t: "TELÉFONO CONFIRMADO", en: 18.0 },
];

/**
 * La memoria. Lo que Nesped ya sabía antes de esta llamada y que ahora toca
 * a la conversación de hoy.
 */
export const MEMORIA = [
  "Llamó hace tres semanas",
  "Preguntó por una caldera",
  "No cogió el seguimiento",
  "Zona con instalador libre",
  "Presupuestos de su calle: 4.200 €",
];

/**
 * Sobre qué actúa Nesped al colgar. Son las tres cosas que de verdad cambian
 * en el producto —ficha, agenda y aviso— con su antes y su después, porque
 * enseñar sólo el después no demuestra que lo haya hecho nadie.
 *
 * La trayectoria del haz que llega a cada una no está aquí: se mide en la
 * página, porque depende de dónde caiga la ficha en cada pantalla.
 */
export const TRABAJO = [
  {
    id: "contacto",
    meta: ["CONTACTO", "CRM"],
    t: "Javier · Aerotermia",
    antes: "Sin cualificar",
    despues: "Cualificado · 4.800 €",
  },
  {
    id: "agenda",
    meta: ["VISITA TÉCNICA", "AGENDA"],
    t: "Instalaciones Vega",
    antes: "Sin fecha",
    despues: "Jueves, 12:30",
  },
  {
    id: "aviso",
    meta: ["CONFIRMACIÓN", "WHATSAPP"],
    t: "Mensaje al cliente",
    antes: "Pendiente",
    despues: "Enviada",
  },
];
