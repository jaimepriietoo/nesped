"use client";

/* =========================================================================
   Portada.

   La página es una película controlada por el scroll, no una pila de
   secciones. Un único lienzo fijo detrás de TODO —Nesped no aparece y
   desaparece entre bloques— y encima, carteles cuya visibilidad la decide la
   posición de la película, no un observador de intersección.

   Lo que NO cambia respecto de la versión anterior, y a propósito:

     · el h1 y su promesa;
     · la llamada de demostración contra /api/demo-call;
     · los precios pedidos a /api/precios, que salen de Stripe;
     · el aviso de grabación y su enlace legal;
     · la muestra de llamada real y su transcripción;
     · cabecera, pie, anclas del menú y preguntas.

   Lo que sí cambia es que ahora todo eso vive dentro de una escena continua,
   y que el estado del núcleo lo mueven hechos reales: cuando suena la
   muestra, Nesped escucha o habla según quién esté hablando; cuando se lanza
   la llamada de prueba, Nesped ejecuta.
   ========================================================================= */

import { useCallback, useEffect, useRef, useState } from "react";
import { Inter } from "next/font/google";
import "@/components/v3/v3.css";
import "@/components/nucleo/pelicula.css";
import { Footer, Header } from "@/components/v3/chrome";
import { Rev } from "@/components/v3/rev";
import { Contador } from "@/components/v3/contador";
import GUION from "@/components/v3/muestra-guion.json";
import { NucleoVivo } from "@/components/nucleo/nucleo";
import { direccionInicial } from "@/components/nucleo/tokens";
import { ACTOS, CONCEPTOS, MEMORIA, TRABAJO } from "@/components/nucleo/actos";
import { Revelado } from "@/components/nucleo/texto";
import { SenalContinua, pintarSenal } from "@/components/nucleo/senal";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

/* Lo que hay debajo de verdad. Se cambia aquí cuando cambie la pila: decir
   una cosa y usar otra en la página de un producto de voz es feo. */
const INFRAESTRUCTURA = ["ElevenLabs", "Twilio", "Stripe"];

/**
 * El mecanismo, paso a paso.
 *
 * La película cuenta qué hace Nesped; esto cuenta cómo se monta. Quien
 * evalúa necesita las dos cosas, y la segunda no se puede contar con una
 * cámara.
 */
const COMO_FUNCIONA = [
  {
    n: "01",
    t: "Tu número sigue siendo tuyo",
    d: "No cambias de número ni te portas nada. Desvías las llamadas que no coges —o todas— a la línea que te damos. Si mañana lo quitas, vuelve a sonar donde sonaba.",
  },
  {
    n: "02",
    t: "Descuelga al primer tono",
    d: "Sin menús ni «pulse uno». La voz saluda con el nombre de tu empresa y escucha. Si le interrumpen, calla; si hay ruido, espera. Como una persona.",
  },
  {
    n: "03",
    t: "Averigua y apunta",
    d: "Pregunta lo que hace falta, de uno en uno, y confirma el teléfono repitiéndolo. Al colgar el contacto ya está en tu panel con lo que necesita y su valor estimado.",
  },
  {
    n: "04",
    t: "Te dice a quién llamar",
    d: "Puntúa cada contacto, propone el siguiente paso y manda el seguimiento. Tú entras por la mañana y ya está hecho.",
  },
];

/**
 * Objeciones.
 *
 * Se responden las que salen de verdad en una llamada de venta, incluidas
 * las incómodas: qué pasa si la voz falla, quién ve mis datos y qué ocurre
 * si me quiero ir. Esquivarlas no las elimina, sólo las deja sin respuesta
 * en la cabeza de quien decide.
 */
const PREGUNTAS = [
  {
    q: "¿Se nota que no es una persona?",
    a: "Pruébalo en la demo: déjanos tu número y te llama. Habla castellano de España, acusa recibo antes de contestar, duda cuando piensa y calla si le interrumpes. Lo que no hace es fingir ser humano: si alguien pregunta, lo dice.",
  },
  {
    q: "¿Y si no entiende lo que le piden?",
    a: "Lo dice y ofrece que le llames tú. No inventa precios, plazos ni disponibilidad; esa regla está en el guion y es la primera que comprobamos. Prefiere quedarse corto a prometer algo que no puedes cumplir.",
  },
  {
    q: "¿Cuánto tarda en estar funcionando?",
    a: "Un día. Damos de alta tu cuenta, escribimos el guion contigo y configuras el desvío desde tu operadora. Lo que más tarda es que decidas qué quieres que pregunte.",
  },
  {
    q: "¿Quién puede oír las llamadas?",
    a: "Sólo las personas a las que tú das acceso, y queda registrado quién ha entrado y cuándo. Las grabaciones se guardan 30 días y las transcripciones 90; después se borran solas.",
  },
  {
    q: "¿Se avisa de que la llamada se graba?",
    a: "Sí, antes de que empiece a hablar el agente. Es obligatorio y no es opcional en la configuración. Si quien llama no quiere, se le ofrece otra vía y no se insiste.",
  },
  {
    q: "¿Y si quiero dejarlo?",
    a: "No hay permanencia. Cancelas desde el portal, quitas el desvío y tu número vuelve a sonar donde sonaba. Los contactos que ya tienes te los llevas en CSV.",
  },
];

/**
 * Cifras. Cuatro, y las cuatro se pueden sostener delante de un cliente.
 * Van aquí abajo y no en la portada porque la portada ya no necesita
 * números: enseña el producto trabajando.
 */
const CIFRAS = [
  { hasta: 1.2, dec: 1, antes: "< ", despues: " s", l: "En descolgar" },
  { hasta: 100, dec: 0, despues: " %", l: "Llamadas atendidas" },
  { hasta: 24, dec: 0, despues: "/7", l: "Sin turnos ni bajas" },
  { hasta: 30, dec: 0, despues: " días", l: "Grabaciones guardadas" },
];

/* Lo que se lleva quien contrata, en tres frases. Sin tarjetas: la jerarquía
   la hace la tipografía. */
const LLEVA = [
  {
    meta: "Conversación",
    t: "Voz con memoria comercial",
    d: "La llamada no se queda en un audio sin contexto. Sale de ahí un contacto con su resumen, su valor estimado y el siguiente paso escrito.",
  },
  {
    meta: "Visibilidad",
    t: "Un panel por cliente",
    d: "Métricas, contactos, historial, automatismos y facturación en el mismo sitio, con el nivel de acabado que se le pide a un producto que se paga todos los meses.",
  },
  {
    meta: "Operación",
    t: "Captación y cierre en una capa",
    d: "WhatsApp, seguimiento, puntuación, siguiente acción y cobro dentro del mismo sistema, no repartidos entre cuatro herramientas pegadas con cinta.",
  },
];

/* Duración del audio de muestra, para repartir el acto de la voz. Sale del
   propio guion: la última frase más lo que dura decirla. */
const FIN_GUION = GUION[GUION.length - 1].t + 3.4;

const acotar = (v) => Math.min(1, Math.max(0, v));

/* ─────────────────────────────────────────────────────────────────────
   Los dos actos que pintan detalle fotograma a fotograma viven fuera del
   componente. No dependen de props ni de estado —sólo leen el DOM que ya
   está montado— y sacándolos de dentro dejan de recrearse en cada render
   y de aparecer como dependencias de un efecto que se monta una vez.
   ───────────────────────────────────────────────────────────────────── */

/**
 * Escribe una propiedad CSS sólo si ha cambiado.
 *
 * Parece una tontería y no lo es: cada escritura invalida el estilo de ese
 * nodo aunque el valor sea el mismo, y aquí hay del orden de cincuenta
 * escrituras por fotograma repartidas entre diez carteles. Con tres decimales
 * la mayoría de los fotogramas no cambian nada en la mayoría de los nodos.
 */
function poner(el, nombre, valor) {
  const clave = "__" + nombre;
  if (el[clave] === valor) return;
  el[clave] = valor;
  el.style.setProperty(nombre, valor);
}

/**
 * Las listas de nodos se buscan una vez y se guardan en el propio elemento.
 *
 * querySelectorAll recorre el árbol, y hacerlo en cada fotograma para los
 * nueve renglones de la conversación y los seis conceptos es trabajo repetido
 * sobre algo que no cambia nunca.
 */
function cachear(caja, clave, selector) {
  if (!caja[clave]) caja[clave] = [...caja.querySelectorAll(selector)];
  return caja[clave];
}

/* ── Acto III: la voz ─────────────────────────────────────────────────
   El avance del acto se convierte en segundo del audio real, y con ese
   segundo se decide qué ha separado ya Nesped. Los conceptos no están
   repartidos a ojo: cada uno lleva el segundo de la llamada publicada en el
   que se dice, así que lo que se ve aparecer es lo que de verdad se oye. */
function pintarVoz(carteles, p) {
  const caja = carteles.current.voz;
  if (!caja || caja.dataset.on !== "1") return;
  const tramo = ACTOS.voz;
  const s = acotar((p - tramo.desde) / (tramo.hasta - tramo.desde));
  const segundo = s * FIN_GUION;

  cachear(caja, "__conceptos", "[data-concepto]").forEach((el) => {
    const en = Number(el.dataset.concepto);
    const a = acotar((segundo - en) / 1.6);
    poner(el, "--a", a.toFixed(3));
    const vivo = a > 0.75 ? "1" : "0";
    if (el.dataset.vivo !== vivo) el.dataset.vivo = vivo;
  });
}

/* ── Acto VI: mira a Nesped trabajar ──────────────────────────────────
   Las tres fichas no aparecen a la vez: llega la energía a una, cambia el
   dato, y sólo entonces sale hacia la siguiente. La cadena es la
   explicación —causa y efecto en el mismo plano— y por eso el mismo
   número mueve el haz y el dato. */
function pintarTrabajo(carteles, direccion, proyectar, p) {
  const caja = carteles.current.trabajo;
  if (!caja || caja.dataset.on !== "1") return;
  const tramo = ACTOS.trabajo;
  const s = acotar((p - tramo.desde) / (tramo.hasta - tramo.desde));

  pintarHaces(caja, direccion, proyectar);

  cachear(caja, "__pasos", "[data-paso]").forEach((el) => {
    const i = Number(el.dataset.paso);
    /* Cada paso ocupa su tercio y solapa un poco con el siguiente: sin
       solape la cadena se ve como tres cosas sueltas en vez de una. */
    const inicio = 0.14 + i * 0.24;
    const e = acotar((s - inicio + 0.12) / 0.16);
    const a = acotar((s - inicio) / 0.22);
    poner(el, "--e", e.toFixed(3));
    poner(el, "--a", a.toFixed(3));
  });
}

/**
 * Dibuja los haces desde la apertura hasta cada ficha.
 *
 * Los dos extremos se miden, ninguno se escribe a mano. El origen se proyecta
 * con la misma cámara que está usando el shader —así sale exactamente del
 * vacío central por muy raro que sea el ángulo— y el destino sale de dónde ha
 * caído la ficha en esta pantalla.
 *
 * Antes eran coordenadas fijas sobre un lienzo estirado: el haz llegaba a la
 * ficha en una resolución concreta y se quedaba a medio camino en todas las
 * demás. Un rayo que no toca nada no explica ninguna causa, que es justo lo
 * único que este acto tiene que conseguir.
 */
function pintarHaces(caja, direccion, proyectar) {
  const svg = caja.querySelector(".pel-haces");
  if (!svg || !direccion) return;

  /* Las cajas de las fichas se miden cuando cambia el tamaño de la ventana,
     no en cada fotograma.

     getBoundingClientRect() obliga al navegador a recalcular la maquetación, y
     hacerlo cuatro veces por fotograma sobre una página de doce mil píxeles de
     alto cuesta más que pintar la escena. Lo único que cambia entre fotogramas
     es de dónde SALE el haz, que es matemática pura sobre la cámara. */
  const clave = `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`;
  if (svg.dataset.caja !== clave) {
    const c = caja.getBoundingClientRect();
    if (c.width < 2 || c.height < 2) return;
    svg.dataset.caja = clave;
    svg.setAttribute("viewBox", `0 0 ${c.width} ${c.height}`);
    svg.__ancho = c.width;
    svg.__alto = c.height;
    svg.__destinos = [...caja.querySelectorAll(".pel-ficha")].map((ficha) => {
      const f = ficha.getBoundingClientRect();
      return {
        izq: f.left - c.left, der: f.right - c.left,
        arr: f.top - c.top, abj: f.bottom - c.top,
      };
    });
    svg.__grupos = [...svg.querySelectorAll("g[data-paso]")].map((g) => ({
      g, rutas: [...g.querySelectorAll("path")],
    }));
  }

  const origen = proyectar(direccion, svg.__ancho, svg.__alto);
  if (!origen) return;

  svg.__destinos.forEach((f, i) => {
    const trazo = svg.__grupos[i];
    if (!trazo) return;

    /* El haz llega al punto del borde de la ficha más cercano al núcleo, no
       siempre a su lado izquierdo. En escritorio las fichas están a la derecha
       y da igual; en móvil están debajo, y apuntar al lado izquierdo dibujaba
       una curva que cruzaba media pantalla para entrar por donde no era. */
    const dx = Math.min(Math.max(origen.x, f.izq), f.der);
    const dy = Math.min(Math.max(origen.y, f.arr), f.abj);

    // Curva, no recta: la energía tiene inercia, no puntería.
    const c1x = origen.x + (dx - origen.x) * 0.5;
    const c2x = origen.x + (dx - origen.x) * 0.62;
    const d =
      `M${origen.x.toFixed(1)},${origen.y.toFixed(1)} ` +
      `C${c1x.toFixed(1)},${origen.y.toFixed(1)} ` +
      `${c2x.toFixed(1)},${dy.toFixed(1)} ${dx.toFixed(1)},${dy.toFixed(1)}`;

    if (trazo.d !== d) {
      trazo.d = d;
      trazo.rutas.forEach((ruta) => ruta.setAttribute("d", d));

      /* Longitud aproximada de la curva, no medida.

         getTotalLength() sobre un trazo que se acaba de cambiar obliga a
         rehacer su geometría, y es lo único que hacía falta de ella: un
         número para recortar el trazo. La media entre la cuerda y el
         perímetro de control se queda a menos de un uno por ciento en curvas
         tan suaves como estas, y no toca el DOM. */
      const cuerda = Math.hypot(dx - origen.x, dy - origen.y);
      const red =
        Math.hypot(c1x - origen.x, 0) +
        Math.hypot(c2x - c1x, dy - origen.y) +
        Math.hypot(dx - c2x, 0);
      poner(trazo.g, "--largo", ((cuerda + red) * 0.5).toFixed(1));
    }
  });
}

export default function Home() {
  const [telefono, setTelefono] = useState("");
  const [cargando, setCargando] = useState(false);
  const [estado, setEstado] = useState(null);
  const [anclado, setAnclado] = useState("0");
  const [seccion, setSeccion] = useState("");

  const raiz = useRef(null);
  const pelicula = useRef(null);
  const senal = useRef(null);
  const escenario = useRef(null);
  const barra = useRef(null);
  const carteles = useRef({});
  const control = useRef(null);
  /* La cámara la crea la página, no el núcleo.

     El director y el núcleo se cargan por separado y no hay garantía de en
     qué orden resuelven. Si el objeto de cámara lo creara el núcleo, el
     director podía montarse antes y quedarse dirigiendo un `null`. Creándolo
     aquí, los dos reciben el mismo objeto llegue quien llegue primero. */
  const direccion = useRef(direccionInicial());
  const director = useRef(null);
  const ancladoRef = useRef("0");
  /* El temporizador que apaga el motor cuando el fundido final ha acabado. */
  const apagar = useRef(0);

  const guardarCartel = useCallback((id) => (el) => {
    if (el) carteles.current[id] = el;
    else delete carteles.current[id];
  }, []);

  /* ── La película ──────────────────────────────────────────────────────
     El director se carga aparte, igual que el núcleo: hasta que no hay algo
     que dirigir no hace falta traerlo. */
  useEffect(() => {
    let vivo = true;
    let soltar = () => {};

    import("@/components/nucleo/director").then(({ Director, avanceActo, proyectarNucleo }) => {
      if (!vivo || !pelicula.current) return;

      /* La película termina, y Nesped termina con ella.

         Antes se quedaba anclado en una esquina el resto de la página,
         despierto, reaccionando a la muestra de llamada. Sonaba bien y no lo
         era: por debajo seguía corriendo una marcha de rayos a pantalla
         completa mientras se leen precios y preguntas frecuentes, y un objeto
         flotando sobre el texto no añade nada que el texto no diga ya. Ahora
         se disuelve con el último plano y el motor se apaga. Donde Nesped
         vuelve a estar vivo es donde tiene sentido que lo esté: dentro del
         portal, trabajando. */
      const mirarFinal = () => {
        const caja = pelicula.current;
        if (!caja) return;
        /* Se ancla cuando la película ya ha salido de escena de verdad, no
           en el fotograma exacto en que termina. Con el umbral pegado al
           final, el último acto —el cierre, con sus botones— se pintaba sobre
           un núcleo ya recogido en una esquina. */
        const fin = window.scrollY + window.innerHeight * 0.5 >= d.arriba + d.recorrido + window.innerHeight;

        const modo = fin ? "fin" : "0";
        if (modo !== ancladoRef.current) {
          ancladoRef.current = modo;
          setAnclado(modo);
        }

        if (fin === d.congelado) return;
        d.congelado = fin;

        /* El motor se apaga cuando el fundido ha terminado, no en el mismo
           fotograma: apagarlo antes deja el último cuadro congelado a la
           vista mientras se desvanece, que es justo lo que se quería evitar.
           Y al volver a entrar se enciende sin esperar a nada. */
        clearTimeout(apagar.current);
        const motor = control.current?.motor;
        if (fin) {
          apagar.current = setTimeout(() => {
            if (ancladoRef.current === "fin" && control.current?.motor) {
              control.current.motor.pausado = true;
            }
          }, 900);
        } else if (motor) {
          motor.pausado = false;
        }
      };

      const d = new Director({
        pelicula: pelicula.current,
        direccion: direccion.current,
        buscarMaquina: () => control.current?.maquina || null,
        antesDeCada: mirarFinal,
        alAvanzar: (p) => {
          pintarSenal(senal.current, p);
          if (barra.current) barra.current.style.setProperty("--p", p.toFixed(4));

          /* La cabecera se atenúa sólo en la primera pantalla. Vuelve entera
             en cuanto la película arranca, y con el ratón encima o al tabular
             se enciende siempre. */
          raiz.current?.style.setProperty(
            "--pel-chrome",
            (0.3 + Math.min(1, p / 0.05) * 0.7).toFixed(3)
          );

          for (const [id, tramo] of Object.entries(ACTOS)) {
            const el = carteles.current[id];
            if (!el) continue;
            const v = avanceActo(p, tramo.desde, tramo.hasta);
            /* `--s` es por dónde va el frente de luz dentro del acto y `--v`
               si el cartel está o no. Se separan porque el frente tiene que
               avanzar en el mismo sentido que el scroll, y la presencia
               tiene que subir al entrar y bajar al salir. */
            const s = acotar((p - tramo.desde) / (tramo.hasta - tramo.desde));
            poner(el, "--v", v.toFixed(3));
            poner(el, "--s", s.toFixed(3));
            const entrada = acotar((p - tramo.desde) / 0.022);
            const salida = acotar((p - tramo.hasta + 0.01) / 0.023);
            poner(el, "--entrada", entrada.toFixed(3));
            poner(el, "--salida", salida.toFixed(3));
            const on = v > 0.02 ? "1" : "0";
            if (el.dataset.on !== on) el.dataset.on = on;
          }

          pintarVoz(carteles, p);
          pintarTrabajo(carteles, direccion.current, proyectarNucleo, p);
        },
      });

      d.montar();

      director.current = d;
      /* Sólo en desarrollo: poder llevar la película a un punto concreto
         desde la consola ahorra recorrer siete pantallas de scroll cada vez
         que se ajusta un fotograma. */
      if (process.env.NODE_ENV !== "production") window.__pelicula = d;
      soltar = () => {
        clearTimeout(apagar.current);
        d.desmontar();
      };
    });

    return () => { vivo = false; soltar(); };
  }, []);

  /* El menú son anclas de esta misma página: marcar una fija sería mentira
     en cuanto se hace scroll. */
  useEffect(() => {
    const ids = ["como", "demo", "preguntas"];
    const nodos = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (nodos.length === 0) return undefined;
    const io = new IntersectionObserver(
      (entradas) => {
        const visible = entradas
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setSeccion(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    nodos.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);

  /* Mismo contrato de siempre: POST { telefono, client_id }. */
  async function lanzarLlamada() {
    if (!telefono.trim()) {
      setEstado({ ok: false, text: "Introduce un teléfono para lanzar la demo." });
      control.current?.ir("ATTENTION", { durante: 1.6 });
      return;
    }
    setCargando(true);
    setEstado(null);
    control.current?.ir("ACTING", { hacia: [0, -0.4, 1] });
    try {
      const res = await fetch("/api/demo-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, client_id: "demo" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setEstado({ ok: false, text: json.message || "No se pudo lanzar la llamada de prueba." });
        control.current?.ir("ERROR", { durante: 2.4 });
        return;
      }
      setEstado({ ok: true, text: "Llamada lanzada. Revisa tu móvil para probar la experiencia real." });
      control.current?.ir("SUCCESS", { durante: 1.8 });
    } catch {
      setEstado({ ok: false, text: "Error técnico al lanzar la llamada." });
      control.current?.ir("ERROR", { durante: 2.4 });
    } finally {
      setCargando(false);
    }
  }

  return (
    <div ref={raiz} className={`pel v3 ${inter.className}`}>
      <div ref={barra} className="pel-avance" aria-hidden="true" />

      {/* Un solo lienzo para toda la página. */}
      <div
        ref={escenario}
        className="pel-escenario"
        data-anclado={anclado}
        aria-hidden="true"
      >
        <NucleoVivo
          estado="DORMANT"
          controlRef={control}
          direccionRef={direccion}
          atento
        />
      </div>

      <Header activo={seccion} />

      <div ref={pelicula} className="pel-pelicula">
        <div className="pel-plano">
          <SenalContinua referencia={senal} />

          {/* ── 00 · La oscuridad ────────────────────────────────────────
              No hay hero. Durante un instante parece que no hay nada, y lo
              que hay lo descubre la luz, no un fundido de opacidad. */}
          <div ref={guardarCartel("revelacion")} className="pel-cartel" data-sitio="abajo-izq" data-on="0">
            <div>
              <Revelado
                como="h1"
                clase="pel-h1"
                texto={"Convierte cada llamada\nen ingreso real"}
              />
              <p className="pel-pie">
                Voz con IA sobre {INFRAESTRUCTURA.join(" · ")}.
              </p>
            </div>
            <div className="pel-empuja">
              <i />
              HAZ SCROLL PARA DESPERTAR A NESPED
            </div>
          </div>

          {/* ── I · Despierta ────────────────────────────────────────── */}
          <div ref={guardarCartel("despierta")} className="pel-cartel" data-sitio="medio-der" data-on="0">
            <div>
              <span className="pel-eyebrow">ACTO I</span>
              <Revelado clase="pel-h2" texto="Ya está escuchando." />
              <p className="pel-pie">
                No hay nadie de guardia. No hay turno de noche. Cuando suena
                el teléfono a las once y media, contesta igual que a las diez
                de la mañana.
              </p>
            </div>
          </div>

          {/* ── II · Entra la voz ────────────────────────────────────── */}
          <div ref={guardarCartel("escucha")} className="pel-cartel" data-sitio="arriba-izq" data-on="0">
            <div>
              <Revelado clase="pel-palabra" texto="Escucha." />
            </div>
          </div>

          {/* ── II bis · Atravesamos la apertura ─────────────────────── */}
          <div ref={guardarCartel("dentro")} className="pel-cartel" data-sitio="centro" data-on="0">
            <div>
              <Revelado clase="pel-palabra" texto="Comprende." />
              <p className="pel-pie" style={{ marginInline: "auto" }}>
                Lo que entra por el teléfono es ruido con palabras dentro.
                Esto es lo que pasa entre esa frase y un contacto con nombre,
                necesidad y siguiente paso.
              </p>
            </div>
          </div>

          {/* ── III · La voz se convierte en significado ───────────────
              Aquí no se reproduce la conversación: eso está más abajo, con el
              audio de verdad y se puede escuchar. Lo que pasa en este plano es
              lo otro, lo que no se oye —que de una frase suelta salgan los
              datos con los que se trabaja después—, y con la transcripción
              delante nadie lo miraba: se ponía a leer. */}
          <div ref={guardarCartel("voz")} className="pel-cartel" data-sitio="abajo-izq" data-on="0">
            <div>
              <Revelado clase="pel-h2" texto="No oye palabras." />
              <Revelado clase="pel-palabra" texto="Entiende." />
              <p className="pel-pie">
                De una sola frase salen el qué, el dónde, la prisa y el nombre.
                Sin formularios y sin que nadie los teclee después.
              </p>
              <div className="pel-conceptos">
                {CONCEPTOS.map((c) => (
                  <span key={c.t} className="pel-concepto" data-concepto={c.en} data-vivo="0">
                    {c.t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── IV · Memoria ─────────────────────────────────────────── */}
          <div ref={guardarCartel("memoria")} className="pel-cartel" data-sitio="abajo-izq" data-on="0">
            <div>
              <Revelado clase="pel-palabra" texto="Recuerda." />
              <p className="pel-pie">
                Cada interacción cambia lo que Nesped sabe después. Javier no
                empieza de cero: ya había llamado.
              </p>
              <div className="pel-conceptos">
                {MEMORIA.map((m) => (
                  <span key={m} className="pel-concepto" style={{ "--a": 1 }}>
                    {m}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* ── V · Actúa ────────────────────────────────────────────── */}
          <div ref={guardarCartel("actua")} className="pel-cartel" data-sitio="arriba-izq" data-on="0">
            <div>
              <Revelado clase="pel-h2" texto="No sólo responde." />
              <Revelado clase="pel-palabra" texto="Actúa." />
            </div>
          </div>

          {/* ── VI · Mira a Nesped trabajar ──────────────────────────── */}
          <div ref={guardarCartel("trabajo")} className="pel-cartel" data-sitio="abajo-der" data-on="0">
            {/* Los haces salen del núcleo y llegan a cada ficha. El trazo y
                el dato se mueven con el mismo número: eso es lo que hace que
                se lea "Nesped ha hecho esto" y no "esto ha cambiado". */}
            {/* Las trayectorias las calcula pintarHaces(): proyecta el centro
                de la apertura y mide dónde ha caído cada ficha. Aquí sólo se
                declaran los dos trazos —el haz y su cabeza. */}
            <svg className="pel-haces" aria-hidden="true">
              {TRABAJO.map((f, i) => (
                <g key={f.id} data-paso={i}>
                  <path className="pel-haz" />
                  <path className="pel-chispa" />
                </g>
              ))}
            </svg>

            <div>
              <span className="pel-eyebrow">MIRA A NESPED TRABAJAR</span>
              <div className="pel-trabajo">
                {TRABAJO.map((f, i) => (
                  <article key={f.id} className="pel-ficha" data-paso={i}>
                    <div className="pel-ficha-meta">
                      <span>{f.meta[0]}</span>
                      <span>{f.meta[1]}</span>
                    </div>
                    <h3 className="pel-ficha-t">{f.t}</h3>
                    <p className="pel-ficha-d">
                      <span className="pel-dato">
                        <span className="antes">{f.antes}</span>
                        <span className="despues">{f.despues}</span>
                      </span>
                    </p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          {/* ── VII · Escala ─────────────────────────────────────────── */}
          <div ref={guardarCartel("escala")} className="pel-cartel" data-sitio="arriba-centro" data-on="0">
            <div>
              <Revelado
                clase="pel-h2"
                texto={"Una inteligencia.\nTodas las conversaciones."}
              />
              <p className="pel-pie" style={{ marginInline: "auto" }}>
                No son cien agentes descoordinados. Es el mismo, atendiendo a
                la vez, con el mismo guion y la misma memoria.
              </p>
            </div>
          </div>

          {/* ── VIII · Cierre ────────────────────────────────────────── */}
          <div
            ref={guardarCartel("cierre")}
            className="pel-cartel"
            data-sitio="arriba-centro"
            data-clicable="1"
            data-on="0"
          >
            <div>
              <Revelado clase="pel-h2" texto={"Tu negocio.\nSiempre activo."} />
              <div className="pel-botones" style={{ justifyContent: "center" }}>
                <a className="pel-btn pel-btn--luz" href="#demo">Pruébalo ahora</a>
                <a className="pel-btn" href="#contacto">Más información</a>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ═══ A partir de aquí el producto se explica con palabras ═══════ */}
      <div className="pel-negocio">

        <section id="como" className="v3-section">
          <div className="v3-wrap">
            <Rev>
              <span className="v3-eyebrow">Cómo funciona</span>
              <h2 className="v3-h2">De que suene el teléfono<br />a tener el contacto apuntado.</h2>
              <p className="v3-lede">
                Cuatro pasos. Ninguno te obliga a cambiar de número ni a tocar
                nada de lo que ya tienes montado.
              </p>
            </Rev>

            <ol className="v3-pasos">
              {COMO_FUNCIONA.map((p, i) => (
                <Rev as="li" key={p.n} d={i * 0.08} className="v3-paso">
                  <span className="v3-paso-n">{p.n}</span>
                  <div>
                    <h3 className="v3-h3">{p.t}</h3>
                    <p className="v3-p">{p.d}</p>
                  </div>
                </Rev>
              ))}
            </ol>

            <Rev d={0.2}>
              <div className="v3-chips">
                {["Clínicas", "Inmobiliarias", "Seguros", "Servicios", "Despachos", "Ventas consultivas"].map((c) => (
                  <span key={c} className="v3-chip">{c}</span>
                ))}
              </div>
            </Rev>
          </div>
        </section>

        <section className="v3-section v3-section--line">
          <div className="v3-wrap">
            <Rev>
              <span className="v3-eyebrow">Lo que te llevas</span>
              <h2 className="v3-h2">Una capa, no cuatro herramientas<br />pegadas con cinta.</h2>
            </Rev>

            <div className="v3-grid" data-c="3">
              {LLEVA.map((c, i) => (
                <Rev as="article" key={c.t} d={i * 0.09}>
                  <span className="v3-card-meta">{c.meta}</span>
                  <h3 className="v3-h3">{c.t}</h3>
                  <p className="v3-p">{c.d}</p>
                </Rev>
              ))}
            </div>

            <Rev d={0.18}>
              <div className="v3-cifras">
                {CIFRAS.map((c, i) => (
                  <div key={c.l} className="v3-cifra">
                    <b>
                      <Contador
                        hasta={c.hasta}
                        decimales={c.dec}
                        antes={c.antes}
                        despues={c.despues}
                        retraso={i * 0.12}
                      />
                    </b>
                    <span>{c.l}</span>
                  </div>
                ))}
              </div>
            </Rev>
          </div>
        </section>

        <section id="demo" className="v3-section v3-section--line">
          <div className="v3-wrap">
            <Rev>
              <span className="v3-eyebrow">Demo en vivo</span>
              <h2 className="v3-h2">Que te llame y júzgalo tú.</h2>
              <p className="v3-lede">
                Déjanos tu número y la asistente te llama en unos segundos.
                Pregúntale lo que quieras, interrúmpela, ponla a prueba.
              </p>
            </Rev>

            <div className="v3-grid" data-c="1" style={{ marginTop: 22, maxWidth: 560 }}>
              <Rev className="v3-card" d={0.09}>
                <div className="v3-field">
                  <label className="v3-label" htmlFor="v3-tel">Teléfono para la demo</label>
                  <input
                    id="v3-tel"
                    className="v3-input"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="+346XXXXXXXX"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="v3-btn v3-btn--white"
                  style={{ marginTop: 16, width: "100%" }}
                  onClick={lanzarLlamada}
                  disabled={cargando}
                >
                  {cargando ? "Lanzando llamada…" : "Probar llamada en vivo"}
                </button>

                <p
                  className="v3-status"
                  data-ok={estado ? String(estado.ok) : undefined}
                  role="status"
                  aria-live="polite"
                >
                  {estado?.text || ""}
                </p>

                <p className="v3-legal">
                  Al lanzar la demo aceptas que la llamada pueda ser grabada y
                  transcrita con fines de calidad, seguridad y seguimiento
                  comercial.{" "}
                  <a href="/legal/voice-compliance">Ver política de grabaciones</a>
                </p>
              </Rev>
            </div>
          </div>
        </section>

        <section id="contacto" className="v3-section v3-section--line">
          <div className="v3-wrap">
            <Rev className="v3-contacto">
              <span className="v3-eyebrow">Más información</span>
              <h2 className="v3-h2">¿Quieres saber más?<br />Escríbenos.</h2>
              <p className="v3-lede">
                Cuéntanos cómo atiende hoy el teléfono tu empresa y te enseñamos
                cómo quedaría con Nesped. Sin compromiso y sin letra pequeña.
              </p>
              <div className="v3-cta-row">
                <a
                  className="v3-btn v3-btn--white"
                  href={`mailto:hola@nesped.com?subject=${encodeURIComponent("Más información sobre Nesped")}`}
                >
                  Escríbenos
                </a>
                <a className="v3-btn" href="#demo">Que me llame la IA</a>
              </div>
              <p className="v3-p" style={{ marginTop: 18 }}>
                O escríbenos directamente a <a href="mailto:hola@nesped.com">hola@nesped.com</a>.
              </p>
            </Rev>
          </div>
        </section>

        <section id="preguntas" className="v3-section v3-section--line">
          <div className="v3-wrap">
            <Rev>
              <span className="v3-eyebrow">Lo que siempre preguntan</span>
              <h2 className="v3-h2">Las dudas de verdad,<br />respondidas de frente.</h2>
            </Rev>

            <div className="v3-preguntas">
              {PREGUNTAS.map((p, i) => (
                /* <details> nativo: se abre sin JavaScript, es accesible por
                   teclado de fábrica y el buscador lee el contenido aunque esté
                   plegado. Un acordeón hecho a mano no da nada de eso gratis. */
                <Rev as="details" key={p.q} d={i * 0.05} className="v3-pregunta">
                  <summary>
                    <span>{p.q}</span>
                    <span className="v3-pregunta-mas" aria-hidden="true" />
                  </summary>
                  <p className="v3-p">{p.a}</p>
                </Rev>
              ))}
            </div>
          </div>
        </section>

        <section className="v3-section v3-section--line">
          <div className="v3-wrap">
            <Rev className="v3-cta">
              <span className="v3-eyebrow">Siguiente paso</span>
              <h2 className="v3-h2">
                Tu teléfono, atendido siempre.
                <br />
                Desde hoy.
              </h2>
              <p className="v3-lede">
                Llámala, pruébala y pregúntanos lo que quieras. Te enseñamos
                cómo quedaría en tu empresa, con tu nombre y tu forma de
                atender.
              </p>
              <div className="v3-cta-row">
                <a className="v3-btn v3-btn--white" href="#demo">Probar la demo</a>
                <a className="v3-btn" href="/portal">Entrar al portal</a>
                <a className="v3-btn" href="#contacto">Más información</a>
              </div>
            </Rev>
          </div>
        </section>

        <Footer />
      </div>
    </div>
  );
}
