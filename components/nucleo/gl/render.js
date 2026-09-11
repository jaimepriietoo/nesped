/* =========================================================================
   El bucle de render de la Apertura Neural.

   Separación estricta y a propósito:

     estado del producto  → React
     estado de escena     → NucleoEstado (muelles, fuera de React)
     bucle de render      → esto, un solo requestAnimationFrame

   Este archivo no importa React ni sabe que existe. Lee dos objetos mutables
   —el estado y la dirección de cámara— y pinta. Así el objeto puede ir a 60
   fps sin provocar un solo repintado del árbol.
   ========================================================================= */

import { CALIDAD, VIGILANCIA, direccionInicial } from "../tokens";
import {
  VS_CUAD, borrarDestino, crearDestino, programa, uniformes,
} from "./gl";
import { FS_BORRON, FS_BRILLO, FS_COMPONER, fsNucleo } from "./sombras";

const NIVELES = ["alta", "media", "baja"];

/** ¿Está dibujando la CPU en vez de la tarjeta gráfica? */
function esPorSoftware(gl) {
  try {
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const nombre = String(
      info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    ).toLowerCase();
    return /swiftshader|llvmpipe|software|microsoft basic|mesa offscreen/.test(nombre);
  } catch {
    return false;
  }
}

/* Se reexporta para que quien ya usaba el renderer como origen de la
   cámara siga funcionando; la definición vive en tokens.js. */
export { direccionInicial };

export class NucleoRender {
  constructor(lienzo, opciones = {}) {
    this.lienzo = lienzo;
    this.estado = opciones.estado;
    this.direccion = opciones.direccion || direccionInicial();
    this.alFallar = opciones.alFallar || (() => {});
    this.alCambiarCalidad = opciones.alCambiarCalidad || (() => {});

    this.nivel = opciones.nivel || "alta";
    this.vivo = false;
    this.visible = true;
    this.raf = 0;
    this.ultimo = 0;
    this.muestras = [];
    this.destinos = {};
    this.progs = {};
  }

  montar() {
    const gl = this.lienzo.getContext("webgl2", {
      /* Con alfa: el núcleo tiene que poder ir anclado encima del contenido y
         dejar ver la página por detrás sin recurrir a modos de mezcla, que
         cuestan una relectura del lienzo por fotograma. */
      alpha: true,
      antialias: false,          // se marcha, no se rasteriza: MSAA no hace nada
      depth: false,
      stencil: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false,
      premultipliedAlpha: true,
    });
    if (!gl) {
      this.alFallar(new Error("sin webgl2"));
      return false;
    }
    this.gl = gl;

    this.medioFloat = !!gl.getExtension("EXT_color_buffer_half_float") ||
                      !!gl.getExtension("EXT_color_buffer_float");

    /* Si no hay GPU de verdad, no se marcha nada.

       Pasa más de lo que parece: una máquina virtual, un portátil con la
       aceleración desactivada, un navegador en modo de compatibilidad. Ahí
       WebGL sigue existiendo pero lo dibuja la CPU, y una marcha de rayos por
       CPU no es "más lenta": deja la página entera agarrotada, con el scroll
       a tirones y los botones sin responder.

       Bajar de calidad no arregla eso, sólo lo hace menos evidente. Lo que
       corresponde es lo mismo que cuando no hay WebGL: la silueta en SVG, que
       es el mismo objeto, va instantánea y no bloquea nada. */
    /* En desarrollo se puede forzar la marcha aunque dibuje la CPU: es la
       única manera de revisar el objeto con un navegador sin tarjeta, que es
       con lo que se hacen las capturas de las pruebas. En producción esta
       rama no existe: el compilador la elimina. */
    const forzar = process.env.NODE_ENV !== "production" &&
      typeof window !== "undefined" && window.__nucleoIgnorarSoftware === true;

    if (!forzar && esPorSoftware(gl)) {
      this.alFallar(new Error("webgl por software"));
      return false;
    }

    try {
      this.construir();
    } catch (e) {
      this.alFallar(e);
      return false;
    }

    this.vao = gl.createVertexArray();  // WebGL2 exige uno atado aunque esté vacío
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    this.redimensionar();
    this.vivo = true;
    this.ultimo = performance.now();
    this.raf = requestAnimationFrame(this.fotograma);
    return true;
  }

  construir() {
    const gl = this.gl;
    const cfg = CALIDAD[this.nivel];

    if (this.progs.nucleo) gl.deleteProgram(this.progs.nucleo);

    this.progs.nucleo = programa(gl, VS_CUAD, fsNucleo(cfg));
    this.uNucleo = uniformes(gl, this.progs.nucleo);

    if (!this.progs.brillo) {
      this.progs.brillo = programa(gl, VS_CUAD, FS_BRILLO);
      this.uBrillo = uniformes(gl, this.progs.brillo);
      this.progs.borron = programa(gl, VS_CUAD, FS_BORRON);
      this.uBorron = uniformes(gl, this.progs.borron);
      this.progs.componer = programa(gl, VS_CUAD, FS_COMPONER);
      this.uComponer = uniformes(gl, this.progs.componer);
    }
  }

  redimensionar() {
    const gl = this.gl;
    if (!gl) return;
    const cfg = CALIDAD[this.nivel];
    const caja = this.lienzo.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, cfg.dprMax);

    const wCss = Math.max(1, Math.round(caja.width));
    const hCss = Math.max(1, Math.round(caja.height));
    this.lienzo.width = Math.max(1, Math.round(wCss * dpr));
    this.lienzo.height = Math.max(1, Math.round(hCss * dpr));

    /* El núcleo se pinta a una fracción del lienzo y se sube al componer. El
       objeto es oscuro y suave: a 0,85 no se distingue del 1,0 y se pintan
       casi la mitad de píxeles. En un raymarch eso no es una micro-optimización,
       es la diferencia entre 60 y 35 fps en un portátil. */
    const w = Math.max(2, Math.round(this.lienzo.width * cfg.escala));
    const h = Math.max(2, Math.round(this.lienzo.height * cfg.escala));

    const rehacer = !this.destinos.escena ||
      this.destinos.escena.ancho !== w || this.destinos.escena.alto !== h;
    if (!rehacer) return;

    for (const k of Object.keys(this.destinos)) borrarDestino(gl, this.destinos[k]);
    this.destinos = {};

    this.destinos.escena = crearDestino(gl, w, h, this.medioFloat);
    if (cfg.halo) {
      const w4 = Math.max(2, w >> 2);
      const h4 = Math.max(2, h >> 2);
      this.destinos.haloA = crearDestino(gl, w4, h4, this.medioFloat);
      this.destinos.haloB = crearDestino(gl, w4, h4, this.medioFloat);
    }
  }

  pasada(prog, uni, destino, ajustes) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, destino ? destino.fbo : null);
    const w = destino ? destino.ancho : this.lienzo.width;
    const h = destino ? destino.alto : this.lienzo.height;
    gl.viewport(0, 0, w, h);
    gl.useProgram(prog);
    ajustes(uni, gl);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  fotograma = (ahora) => {
    if (!this.vivo) return;
    this.raf = requestAnimationFrame(this.fotograma);

    const dt = Math.min(0.05, (ahora - this.ultimo) / 1000) || 0.016;
    this.ultimo = ahora;

    /* Pausa fuera de pantalla. Un raymarch corriendo detrás de una pestaña
       o bajo tres pantallazos de scroll es calor y batería a cambio de nada.
       El estado sigue avanzando —cuando vuelva no puede aparecer congelado—
       pero no se pinta. */
    if (!this.visible || document.hidden) {
      if (this.estado) this.estado.avanzar(dt);
      return;
    }

    const t0 = performance.now();
    this.pintar(dt);
    this.vigilar(performance.now() - t0);
  };

  pintar(dt) {
    const gl = this.gl;
    const est = this.estado;
    if (est) est.avanzar(dt);
    const v = est ? est.lectura() : null;
    const d = this.direccion;
    const cfg = CALIDAD[this.nivel];

    this.pasada(this.progs.nucleo, this.uNucleo, this.destinos.escena, (u) => {
      const D = this.destinos.escena;
      gl.uniform2f(u.get("uRes"), D.ancho, D.alto);
      gl.uniform1f(u.get("uTiempo"), est ? est.t : performance.now() / 1000);

      gl.uniform3f(u.get("uCam"), d.cam[0], d.cam[1], d.cam[2]);
      gl.uniform3f(u.get("uMira"), d.mira[0], d.mira[1], d.mira[2]);
      gl.uniform1f(u.get("uFov"), d.fov);

      const g = (k, def) => (v && v[k] !== undefined ? v[k] : def);
      gl.uniform1f(u.get("uEnergia"), g("energia", 0.3));
      gl.uniform1f(u.get("uEntra"), g("entra", 0));
      gl.uniform1f(u.get("uSale"), g("sale", 0));
      gl.uniform1f(u.get("uAgita"), g("agita", 0.1));
      gl.uniform1f(u.get("uPulso"), g("pulso", 0));
      gl.uniform1f(u.get("uRespira"), g("respira", 1));
      gl.uniform1f(u.get("uRuido"), g("ruido", 0));
      gl.uniform1f(u.get("uApertura"), g("apertura", 1));
      gl.uniform1f(u.get("uFormacion"), g("formacion", 0));
      gl.uniform1f(u.get("uDirigido"), g("dirigido", 0));
      gl.uniform1f(u.get("uFuga"), g("fuga", 0));
      gl.uniform1f(u.get("uFase"), est ? est.fase : 0);

      /* Si hay audio real, la fase del habla la marca la amplitud medida y
         no un seno inventado: que la onda coincida con lo que suena es justo
         lo que hace que parezca que habla en vez de que palpite.
         El shader usa sin(uPulsoFase) como envolvente, así que se le pasa el
         arcoseno de la amplitud y el seno la devuelve intacta. */
      const amp = est ? est.amplitud : -1;
      gl.uniform1f(u.get("uPulsoFase"),
        amp >= 0 ? Math.asin(Math.min(1, Math.max(0, amp))) : (est ? est.pulsoFase : 0));

      gl.uniform3f(u.get("uDir"), est ? est.dir[0] : 0, est ? est.dir[1] : 0, est ? est.dir[2] : 1);
      gl.uniform2f(u.get("uPuntero"),
        est ? est.punteroSuave[0] : 0, est ? est.punteroSuave[1] : 0);

      gl.uniform1f(u.get("uRevelado"), d.revelado);
      gl.uniform1f(u.get("uBarrido"), d.barrido);
      gl.uniform1f(u.get("uDentro"), d.dentro);
      gl.uniform1f(u.get("uEscala"), d.escala);
      gl.uniform1f(u.get("uReplica"), d.replica);
      gl.uniform1f(u.get("uFondo"), d.fondo === undefined ? 1 : d.fondo);
    });

    if (cfg.halo && this.destinos.haloA) {
      const A = this.destinos.haloA;
      const B = this.destinos.haloB;

      this.pasada(this.progs.brillo, this.uBrillo, A, (u) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.destinos.escena.tex);
        gl.uniform1i(u.get("uTex"), 0);
        /* Umbral bastante por encima de 1: sólo florece lo que ya está muy
           sobreexpuesto, que son los hilos de luz. Con el umbral pegado a 1,
           en los estados de mucha energía el halo se extendía por encima de
           las membranas y la obsidiana se volvía gris lechoso. */
        gl.uniform1f(u.get("uUmbral"), 1.3);
      });

      for (let i = 0; i < 2; i += 1) {
        this.pasada(this.progs.borron, this.uBorron, B, (u) => {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, A.tex);
          gl.uniform1i(u.get("uTex"), 0);
          gl.uniform2f(u.get("uPaso"), 1 / A.ancho, 0);
        });
        this.pasada(this.progs.borron, this.uBorron, A, (u) => {
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, B.tex);
          gl.uniform1i(u.get("uTex"), 0);
          gl.uniform2f(u.get("uPaso"), 0, 1 / A.alto);
        });
      }
    }

    this.pasada(this.progs.componer, this.uComponer, null, (u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.destinos.escena.tex);
      gl.uniform1i(u.get("uBase"), 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, (this.destinos.haloA || this.destinos.escena).tex);
      gl.uniform1i(u.get("uHalo"), 1);
      gl.uniform1f(u.get("uFuerzaHalo"), cfg.halo ? 0.62 : 0);
      gl.uniform1f(u.get("uFondo"), d.fondo === undefined ? 1 : d.fondo);
      gl.uniform2f(u.get("uRes"), this.lienzo.width, this.lienzo.height);
    });
  }

  /**
   * Calidad adaptativa.
   *
   * No mira los fps: mira cuánto tarda el pintado. Los fps mezclan el coste
   * de la escena con el del resto de la página, y bajar la calidad del núcleo
   * porque el navegador está ocupado maquetando no arregla nada.
   *
   * Sólo baja. Subir en caliente provocaría un vaivén de calidad en cuanto la
   * carga oscilase, y ver el objeto cambiando de nitidez cada dos segundos es
   * peor que tenerlo un punto por debajo de lo que aguanta el equipo.
   */
  vigilar(ms) {
    /* Salida de emergencia. Un fotograma que tarda más de un octavo de
       segundo no es un pico: es que este equipo no puede con esto. Esperar a
       reunir la muestra completa serían varios segundos de página agarrotada,
       y lo primero que hace alguien con una web agarrotada es cerrarla. */
    if (ms > VIGILANCIA.urgente) {
      this.muestras.length = 0;
      this.bajarNivel(ms);
      return;
    }

    const m = this.muestras;
    m.push(ms);
    if (m.length < VIGILANCIA.muestras) return;

    const orden = [...m].sort((a, b) => a - b);
    const mediana = orden[orden.length >> 1];
    m.length = 0;

    if (mediana <= VIGILANCIA.objetivoMs) return;
    this.bajarNivel(mediana);
  }

  bajarNivel(ms) {
    const i = NIVELES.indexOf(this.nivel);
    if (i < 0 || i >= NIVELES.length - 1) return;

    this.nivel = NIVELES[i + 1];
    try {
      this.construir();
      this.destinos.escena = null;
      this.redimensionar();
      this.alCambiarCalidad(this.nivel, ms);
    } catch (e) {
      this.alFallar(e);
    }
  }

  desmontar() {
    this.vivo = false;
    cancelAnimationFrame(this.raf);
    const gl = this.gl;
    if (!gl) return;
    for (const k of Object.keys(this.destinos)) borrarDestino(gl, this.destinos[k]);
    for (const k of Object.keys(this.progs)) gl.deleteProgram(this.progs[k]);
    if (this.vao) gl.deleteVertexArray(this.vao);
    /* Un contexto WebGL abandonado no se recoge al momento y el navegador
       sólo admite unos pocos: sin esto, navegar entre pantallas del portal
       acaba tumbando el más antiguo y dejando lienzos en negro. */
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
  }
}
