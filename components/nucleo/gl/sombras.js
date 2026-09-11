/* =========================================================================
   Los shaders de la Apertura Neural.

   La geometría no es una malla: es una función de distancia que se marcha
   desde la cámara. Eso da tres cosas que una malla no da gratis y que aquí
   son el producto: la luz revela el volumen en vez de iluminar un contorno,
   la cámara puede atravesar el vacío central sin trucos de plano, y la
   energía de dentro es un campo de verdad, no un sprite pegado.

   Las constantes de las membranas se inyectan desde tokens.js: la silueta se
   cambia allí, no aquí.
   ========================================================================= */

import { COLOR, MEMBRANAS, VACIO } from "../tokens";

const f = (n) => {
  const s = Number(n).toFixed(5);
  return s.includes(".") ? s : `${s}.0`;
};
const v2 = (a) => `vec2(${f(a[0])}, ${f(a[1])})`;
const v3 = (a) => `vec3(${f(a[0])}, ${f(a[1])}, ${f(a[2])})`;

/* Cada membrana entra en el shader como una llamada con sus constantes ya
   resueltas. Un bucle con un array de uniformes costaría lo mismo de
   escribir y le quitaría al compilador la posibilidad de plegar constantes
   dentro del bucle más caliente del programa. */
function llamadasMembranas() {
  return MEMBRANAS.map((m, i) => `
  d = min(d, hoja(p, ${f(m.centro)}, ${f(m.arco)}, ${f(m.radio)}, ${f(m.grosor)},
                  ${v2(m.inclina)}, ${f(m.z)}, ${f(m.zAmp)}, ${v2(m.ondaR)},
                  ${f(m.costillas)}, abre, ${f(i)}));`).join("");
}

export function fsNucleo({ pasos, pasosVol, sombra, micro }) {
  return `#version 300 es
precision highp float;

in vec2 uv;
out vec4 salida;

uniform vec2  uRes;
uniform float uTiempo;

/* Cámara. La landing la mueve como una cámara de cine; el portal la deja
   quieta. Se pasan posición y objetivo en vez de una matriz porque lo único
   que se necesita es construir el rayo. */
uniform vec3  uCam;
uniform vec3  uMira;
uniform float uFov;

/* Las once magnitudes del estado. Ver components/nucleo/tokens.js: no hay
   ninguna animación que no se explique con estas. */
uniform float uEnergia, uEntra, uSale, uAgita, uPulso, uRespira;
uniform float uRuido, uApertura, uFormacion, uDirigido, uFuga;
uniform float uFase, uPulsoFase;
uniform vec3  uDir;
uniform vec2  uPuntero;

/* Dirección de la película. uRevelado saca a Nesped de la oscuridad;
   uDentro dice cuánto hemos atravesado la apertura. */
uniform float uRevelado, uBarrido, uDentro, uEscala, uReplica, uFondo;

#define PI  3.14159265359
#define TAU 6.28318530718
#define PASOS ${pasos}
#define PASOS_VOL ${pasosVol}
${sombra > 0 ? `#define PASOS_SOMBRA ${sombra}` : ""}
${micro ? "#define MICRO 1" : ""}

const vec3 C_LUZ     = ${v3(COLOR.luz)};
const vec3 C_ENERGIA = ${v3(COLOR.energia)};
const vec3 C_ALTA    = ${v3(COLOR.energiaAlta)};
const vec3 C_MATERIA = ${v3(COLOR.materia)};
const float VACIO    = ${f(VACIO)};

mat2 giro(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

/**
 * Ruido de gradiente entrelazado.
 *
 * El arranque de cada rayo del volumen hay que desordenarlo, o los pasos se
 * ven como anillos concéntricos. Se hacía con ruido blanco dependiente del
 * tiempo, y eso es literalmente nieve de televisión: cambia entero cada
 * fotograma y el ojo lo lee como suciedad.
 *
 * Este reparte los desórdenes de forma que píxeles vecinos nunca caen en el
 * mismo sitio y el patrón se queda quieto. Sale un tramado fino en vez de
 * grano, que es la diferencia entre "tiene textura" y "está mal hecho".
 */
float ign(vec2 p) {
  return fract(52.9829189 * fract(0.06711056 * p.x + 0.00583715 * p.y));
}

float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.11, 0.17, 0.13));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float ruido3(vec3 x) {
  vec3 i = floor(x), fr = fract(x);
  fr = fr * fr * (3.0 - 2.0 * fr);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), fr.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), fr.x), fr.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), fr.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), fr.x), fr.y),
    fr.z);
}

/* ── Una membrana ──────────────────────────────────────────────────────
   Un arco barrido alrededor del vacío, con el grosor afilándose hasta cero
   en las dos puntas. El afilado es lo que evita que parezca un trozo de
   dónut cortado con sierra: las puntas son lo primero que delata una
   primitiva reciclada.

   El grosor además ondula a lo largo del arco. Esas costillas son casi
   invisibles de frente y sólo aparecen con luz rasante, que es exactamente
   lo que se le pide al material: que la luz revele la geometría. */
float hoja(vec3 p, float centro, float arco, float radio, float grosor,
           vec2 inclina, float z0, float zAmp, vec2 ondaR,
           float costillas, float abre, float idx) {
  p.yz *= giro(inclina.x);
  p.xz *= giro(inclina.y);

  radio *= abre;

  float ang = atan(p.y, p.x);
  float rel = mod(ang - centro + PI, TAU) - PI;
  float mitad = arco * 0.5;
  float relC = clamp(rel, -mitad, mitad);
  float u = (relC + mitad) / max(arco, 1e-4);
  float phi = centro + relC;

  float rr = radio + ondaR.y * cos(ondaR.x * phi + centro);
  float zz = z0 + zAmp * sin(phi + centro);

  /* La respiración no escala el objeto: recorre el arco como una onda. Una
     escala uniforme se lee como "zoom"; esto se lee como que algo grande
     coge aire. */
  float aire = sin(uFase + phi * 1.7 + idx * 2.1) * 0.016 * uRespira;
  rr += aire;

  vec3 c = vec3(cos(phi) * rr, sin(phi) * rr, zz);

  float tap = pow(max(sin(PI * u), 0.0), 0.62);

  /* Costillas: muchas y muy poco profundas. Con pocas y hondas la hoja se
     lee como una oruga; con quince al 8 % no se ven de frente y aparecen en
     cuanto la luz entra rasante, que es lo que se le pide al material. */
  float th = grosor * tap * (0.986 + 0.014 * sin(u * TAU * costillas + centro));

  /* Inestabilidad: el error deforma el arco por tramos y se recompone. No
     apaga a Nesped ni lo hace vibrar entero, que se leería como fallo de
     render y no como estado. */
  th *= 1.0 + uRuido * 0.35 * sin(u * 27.0 + uTiempo * 9.0 + idx);

  /* Tensión de superficie hacia el puntero. Dos centésimas de radio: se
     nota que responde, no se nota que sigue. */
  float lado = dot(normalize(vec3(uPuntero, 0.55)), normalize(c + vec3(0.0, 0.0, 0.001)));
  th *= 1.0 + max(0.0, lado) * 0.05;

  /* Sección elíptica, no circular.

     Con sección circular esto es un tubo doblado, y un tubo doblado se lee
     como cuerda. Aplastando el eje del vacío el barrido produce una hoja:
     ancha en el plano del arco, fina en profundidad. Es la diferencia entre
     un gusano y una membrana, y es toda la silueta. */
  const float APLASTA = 3.6;
  vec3 q = p - c;
  q.z *= APLASTA;

  /* Dos canales recorriendo la hoja a lo largo, uno por cara.

     Esto sí es definición: no es textura pintada en la normal, es geometría.
     Un canal produce dos aristas donde la luz se parte, y esas aristas son lo
     que hace que la pieza se lea como algo construido en vez de como un bulto
     con un degradado encima. Se resta grosor, nunca se añade, para que la
     función siga siendo una cota por debajo de la distancia real. */
  float caraZ = q.z / max(length(q), 1e-5);
  float canal = exp(-pow((abs(caraZ) - 0.62) / 0.20, 2.0));

  /* Se divide por el aplastamiento y no es un detalle: al escalar un eje, la
     función deja de devolver una distancia y devuelve algo MAYOR que la
     distancia real en esa dirección. El rayo da entonces pasos más largos de
     lo que puede y atraviesa la hoja sin verla. Dividiendo por el factor
     mayor vuelve a ser una cota inferior y la superficie existe otra vez. */
  th -= th * 0.22 * canal;

  return (length(q) - max(th, 0.005)) / APLASTA;
}

/* Toda la silueta. El parametro abre es la apertura del vacío: al abrirse, los arcos se
   separan del eje y el agujero central crece, como una pupila. */
float mapa(vec3 p) {
  float abre = mix(0.94, 1.1, clamp(uApertura, 0.0, 1.6));
  float d = 1e9;
  ${llamadasMembranas()}

  return d;
}

vec3 normal(vec3 p) {
  /* Tetraedro en vez de seis muestras: cuatro evaluaciones del mapa en vez
     de seis, mismo resultado. En el punto de impacto de cada píxel eso son
     dos marchas menos por píxel. */
  const vec2 k = vec2(1.0, -1.0);
  const float h = 0.0012;
  return normalize(
    k.xyy * mapa(p + k.xyy * h) + k.yyx * mapa(p + k.yyx * h) +
    k.yxy * mapa(p + k.yxy * h) + k.xxx * mapa(p + k.xxx * h));
}

/* ── Campos de energía ─────────────────────────────────────────────────
   Ninguna partícula está por decorar. Cada término de aquí abajo significa
   algo, y ese significado es el mismo en la portada y en el panel. */

/**
 * Los hilos que enhebran el vacío. Son la actividad interna: pensar.
 *
 * La primera versión eran hélices alrededor del eje del vacío, y fue un error
 * de concepto: una hélice vista POR SU EJE se proyecta como una
 * circunferencia, y el eje del vacío es justo desde donde se mira el objeto.
 * Seis hélices daban seis círculos concéntricos, o sea un disco borroso. No
 * era un problema de brillo ni de muestreo: no había nada que enfocar.
 *
 * Estos son arcos finitos, cada uno en un plano con su propia inclinación.
 * Desde cualquier ángulo se ven hilos curvos cruzándose a distintas
 * profundidades, que es lo que se lee como estructura. Y como son arcos y no
 * circunferencias enteras, tienen principio y final: el ojo puede seguirlos.
 *
 * Cada hilo va en dos capas. Un núcleo apretado que sobrevive al muestreo del
 * volumen y se ve como un hilo de verdad, y una vaina ancha y tenue que lo
 * envuelve. Sin el núcleo es niebla; sin la vaina, un alambre digital.
 */

#define HILOS 9

/**
 * El plano, el radio y el tramo de cada uno de los hilos.
 *
 * El marco sale ya girado para que el arco quede centrado en el ángulo cero.
 * Eso permite recortarlo después con un coseno en vez de con un arcotangente,
 * que dentro del bucle del volumen se evalúa nueve veces por paso.
 */
void arcoDe(int j, float t, out vec3 eje, out vec3 u, out vec3 v,
            out vec3 centroArco, out float radio, out float cosMedio, out float senMedio) {
  float fj = float(j);
  float agita = 0.22 + uAgita * 1.9;

  /* Inclinación del plano de cada hilo. Los dos ángulos avanzan con el tiempo
     a ritmos distintos: los hilos se reorganizan despacio, que es exactamente
     lo que tiene que hacer algo que está pensando. */
  float a = fj * 0.698 + t * agita * (0.11 + 0.028 * fj);
  float b = 0.46 * sin(fj * 2.1 + t * agita * 0.07) + fj * 0.19;

  eje = vec3(cos(a) * cos(b), sin(b), sin(a) * cos(b));
  vec3 u0 = normalize(cross(eje, vec3(0.0, 1.0, 0.013)));
  vec3 v0 = cross(eje, u0);

  float centro = fj * 2.79 + t * agita * 0.2;
  u = u0 * cos(centro) + v0 * sin(centro);
  v = cross(eje, u);

  radio = 0.26 + 0.085 * sin(fj * 1.7) + 0.042 * fj;

  /* Dentro de la apertura los mismos hilos se agrandan y se reparten a lo
     largo del eje por el que entra la cámara, así que pasan por los lados
     mientras se avanza. Es el mismo objeto a otra escala: la estructura de
     dentro no es otra cosa, es LA MISMA vista desde dentro. Y al ser hilos,
     siguen saliendo exactos, que es justo lo que le faltaba al interior. */
  /* Repartidos a lo largo del corredor por el que entra la cámara, y
     descentrados cada uno un poco: alineados y concéntricos se leerían como
     un túnel de aros, que es justo el tópico que hay que evitar. Así es un
     enredo de hilos por el que se pasa. */
  centroArco = uDentro * vec3(cos(fj * 2.1) * 0.24,
                              sin(fj * 1.7) * 0.20,
                              -(0.25 + fj * 0.40));
  radio *= mix(1.0, 1.05, uDentro);

  float medio = (1.9 + 1.0 * sin(fj * 1.3)) * 0.5;
  cosMedio = cos(medio);
  senMedio = sin(medio);
}

/**
 * Distancia al cuadrado de un punto a un arco de circunferencia.
 *
 * Exacta, no aproximada: dentro del tramo es la distancia al toro, y fuera es
 * la distancia al extremo más cercano, que además da al hilo una punta
 * redondeada en vez de un corte.
 */
float distArco(vec3 mundo, vec3 eje, vec3 u, vec3 v, vec3 centroArco,
               float radio, float cosMedio, float senMedio) {
  vec3 p = mundo - centroArco;
  float h = dot(p, eje);              // separación del plano del arco
  vec3 pp = p - eje * h;              // proyección sobre ese plano
  float rr = length(pp);

  float ca = dot(pp, u);              // rr * cos(ángulo)
  if (ca >= rr * cosMedio) {
    float dr = rr - radio;
    return dr * dr + h * h;
  }

  // Fuera del tramo: al extremo que caiga del lado en el que estamos.
  float lado = dot(pp, v) >= 0.0 ? 1.0 : -1.0;
  vec3 extremo = (u * cosMedio + v * (senMedio * lado)) * radio;
  vec3 d = p - extremo;
  return dot(d, d);
}

/**
 * Envolvente: los hilos viven dentro y alrededor del vacío, no en todo el
 * encuadre. Fuera es una esfera alrededor del objeto; dentro se convierte en
 * un cilindro alrededor del eje por el que se entra, porque ahí la estructura
 * se extiende hacia delante y una esfera la cortaría a dos palmos.
 */
float velo(vec3 p) {
  return mix(exp(-dot(p, p) * 1.45), exp(-dot(p.xy, p.xy) * 0.55), clamp(uDentro, 0.0, 1.0));
}

/**
 * Densidad de los hilos en un punto. La usa la superficie para saber cuánta
 * luz le llega por dentro; el volumen NO la usa para los núcleos, porque
 * muestrear un hilo fino a pasos fijos es exactamente lo que lo convertía en
 * una mancha.
 */
float filamentos(vec3 p, float t) {
  float dens = 0.0;
  for (int j = 0; j < HILOS; j++) {
    vec3 eje, u, v, ca; float radio, cm, sm;
    arcoDe(j, t, eje, u, v, ca, radio, cm, sm);
    float d2 = distArco(p, eje, u, v, ca, radio, cm, sm);
    dens += exp(-d2 * 2600.0) * 2.0 + exp(-d2 * 90.0) * 0.075;
  }
  return dens * velo(p);
}

/* La retícula del logo.

   Cuando a Nesped no le queda energía, lo poco que hay se ordena solo en seis
   columnas de puntos dentro del vacío: las alturas del logotipo. No se dibuja
   el logo dentro del objeto —eso sería ponerle una pegatina—, es que en
   reposo la energía cae en la misma retícula de la que sale la marca. Sube la
   energía y la formación se deshace.

   Los puntos los traza main() por distancia mínima del rayo, que es exacta.
   Aquí sólo viven sus alturas. */
const float ALTURAS[6] = float[6](6.0, 4.0, 2.0, 3.0, 5.0, 6.0);

/* Anillos que viajan. Hacia dentro cuando Nesped recibe, hacia fuera cuando
   ejecuta, y a golpes cuando habla. Es la mitad de la gramática visual.

   Los exponentes son bajos a propósito. Con potencias de veinte y pico los
   anillos salían finos como un pelo, y un pelo muestreado a pasos fijos
   desaparece: LISTENING se quedaba sin su gesto, que es justo lo que tiene
   que leerse sin texto. Anchos y suaves se ven siempre, y además es lo que
   son: ondas, no alambres. */
float anillos(vec3 p, float t) {
  float rho = length(p.xy);
  float caida = exp(-p.z * p.z * 3.2) * smoothstep(1.05, 0.18, rho);
  float dens = 0.0;

  if (uEntra > 0.001) {
    float fase = rho * 2.1 + t * 0.62;
    dens += uEntra * pow(max(0.0, sin(fase * TAU)), 14.0) * caida * 0.85;
  }

  /* Escala. No son cien Nesped: es el mismo recibiendo de muchos sitios a la
     vez. Cada tren de anillos llega por su sector y con su fase, así que se
     ven muchas conversaciones distintas convergiendo en la misma apertura. */
  if (uReplica > 0.001) {
    float a = atan(p.y, p.x);
    for (int k = 0; k < 5; k++) {
      float fk = float(k);
      float sector = pow(max(0.0, cos(a - fk * 1.2566)), 7.0);
      float fase = rho * 2.4 + t * (0.5 + fk * 0.14) + fk * 1.7;
      dens += uReplica * sector * pow(max(0.0, sin(fase * TAU)), 14.0) * caida * 0.8;
    }
  }

  if (uSale > 0.001) {
    /* Al hablar, lo que sale no es un chorro continuo: son paquetes. La
       amplitud la marca uPulsoFase, que el renderer sincroniza con el audio
       real cuando lo hay. */
    float golpe = mix(1.0, pow(max(0.0, sin(uPulsoFase)), 2.4), uPulso);
    float fase = rho * 2.1 - t * 0.78;
    dens += uSale * golpe * pow(max(0.0, sin(fase * TAU)), 13.0) * caida * 0.85;
  }

  return dens;
}

/* Interior. Lo que se ve tras atravesar la apertura.

   Primera versión: una retícula en ángulo y radio. Vista desde el eje —que
   es justo desde donde se entra— las superficies de ángulo constante son
   planos radiales, así que salía un estallido de rayos desde el centro. Es
   decir: el túnel de partículas de manual, que está en la lista de lo que no
   se quiere.

   Esta es una retícula cartesiana: nodos en celdas y aristas entre ellos, de
   las que sólo existe una parte y va cambiando. Eso se lee como información
   organizándose —cosas que se relacionan, se encienden y se deshacen— y no
   como viajar por un tubo. */
float interior(vec3 p, float t) {
  /* Celdas grandes y contraste bajo: esto es el TRASFONDO del interior, no su
     protagonista. Lo que se lee ahí dentro son los hilos, que salen exactos
     por aproximación mínima; una retícula fina muestreada a pasos sólo añade
     borrón por detrás. */
  vec3 g = p * 5.4;
  g.z += t * 0.5;              // se avanza por la estructura, no hacia un punto

  vec3 id = floor(g);
  vec3 f = fract(g) - 0.5;

  float nodo = exp(-dot(f, f) * 85.0);

  // Aristas: hilos finos entre nodos vecinos en los tres ejes.
  float ax = exp(-(f.y * f.y + f.z * f.z) * 300.0);
  float ay = exp(-(f.x * f.x + f.z * f.z) * 300.0);
  float az = exp(-(f.x * f.x + f.y * f.y) * 300.0);

  /* Sólo existe una relación de cada tres, y cuál cambia con el tiempo. Con
     todas encendidas esto sería una rejilla de fondo de pantalla; encendidas
     a trozos, parece que algo está decidiendo qué se relaciona con qué. */
  float semilla = hash31(id + floor(t * 0.35));
  float vivo = smoothstep(0.62, 0.78, semilla);
  float brote = smoothstep(0.86, 0.94, hash31(id * 1.7 + 11.0));

  float dens = nodo * (0.25 + brote * 1.1) + (ax + ay + az) * vivo * 0.14;

  // Se apaga con la distancia al eje por el que vamos entrando.
  /* Se apaga deprisa al alejarse del eje por el que se entra. Sin esto la
     retícula llega a los bordes del encuadre y deja de leerse como el
     interior de algo: parece una rejilla de fondo. */
  return dens * exp(-dot(p.xy, p.xy) * 1.05);
}

/**
 * El campo de energía en un punto.
 *
 * @param hilos densidad de los filamentos, ya calculada por quien llama.
 *   No se calcula aquí porque el bucle del volumen necesita la distancia a
 *   cada arco de todos modos —la usa para el mínimo del rayo— y recalcularla
 *   dentro sería hacer el trabajo dos veces por paso.
 */
float campo(vec3 p, float t, float hilos) {
  float base = hilos * (0.35 + uAgita * 0.9);

  /* La retícula del logo sale del trazo exacto en main(), no de aquí: a pasos
     fijos los puntos parpadean. Lo que queda aquí es recoger los hilos cuando
     la marca se forma. */
  base *= 1.0 - clamp(uFormacion, 0.0, 1.0) * 0.88;

  float dens = base + anillos(p, t) * 0.6;

  if (uDentro > 0.002) {
    dens = mix(dens, dens * 0.3 + interior(p, t) * 1.5, clamp(uDentro, 0.0, 1.0));
  }

  /* Energía dirigida: en ACTING y HANDOFF la densidad se concentra en un
     cono hacia el objetivo real de la interfaz. Es lo que convierte "brilla"
     en "va hacia allí". */
  if (uDirigido > 0.001) {
    float al = dot(normalize(p + vec3(0.0, 0.0, 1e-4)), normalize(uDir + vec3(1e-4)));
    dens *= mix(1.0, smoothstep(-0.1, 0.95, al) * 2.6, uDirigido);
  }

  /* Envolvente global.

     La energía de Nesped vive dentro y alrededor del objeto, no en el resto
     del encuadre. Sin este límite el halo se extiende hasta los bordes y lo
     que se ve deja de ser un objeto con luz dentro para ser una mancha. */
  float lejos = max(0.0, length(p) - 1.25);
  dens *= exp(-lejos * lejos * 6.0);

  return dens * (0.25 + uEnergia * 0.95);
}

/* ── Marcha ────────────────────────────────────────────────────────────── */

/* Entrada y salida del rayo en una esfera centrada en el origen. Devuelve
   (-1,-1) si no la toca. */
vec2 esfera(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float h = b * b - c;
  if (h < 0.0) return vec2(-1.0);
  h = sqrt(h);
  return vec2(-b - h, -b + h);
}

/**
 * Marcha del rayo, consciente del tamaño de un píxel.
 *
 * Dos cosas salen de aquí, y la segunda es la que quita el aspecto barato:
 *
 * 1. El umbral de impacto ya no es un número fijo, es el radio que abarca un
 *    píxel a esa distancia. Un umbral fijo hace que la superficie se "corte"
 *    antes o después según lo lejos que esté, y eso se ve como un borde que
 *    cambia de grosor cuando la cámara se acerca.
 *
 * 2. cob guarda a cuántos píxeles ha pasado el rayo de la superficie en su
 *    punto de máxima aproximación. Con eso se puede pintar el borde con
 *    cobertura parcial en vez de dentro-o-fuera. Un raymarch sin esto tiene
 *    la silueta en escalones, y no hay material ni luz que lo disimule: es lo
 *    primero que delata que algo está hecho a medias.
 */
float marchar(vec3 ro, vec3 rd, float lejos, float px, out float cob, out float tCerca) {
  float t = 0.02;
  cob = 1e9;
  tCerca = t;
  for (int i = 0; i < PASOS; i++) {
    vec3 p = ro + rd * t;
    float d = mapa(p);

    float radioPixel = max(px * t, 1e-6);
    float razon = d / radioPixel;
    if (razon < cob) { cob = razon; tCerca = t; }

    if (d < radioPixel * 0.35) return t;
    /* 0,62 y no 1: el mapa es una cota inferior aproximada por el barrido
       del arco, y a paso completo el rayo se cuela por la superficie. Se ve
       como agujeros en las membranas al girar. */
    t += d * 0.62;
    if (t > lejos) break;
  }
  return -1.0;
}

#ifdef PASOS_SOMBRA
float sombraSuave(vec3 p, vec3 l) {
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < PASOS_SOMBRA; i++) {
    float d = mapa(p + l * t);
    if (d < 0.0008) return 0.0;
    res = min(res, 12.0 * d / t);
    t += clamp(d * 0.7, 0.01, 0.2);
    if (t > 3.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
#else
// Sin sombra proyectada: el volumen lo siguen dando el especular y el borde.
float sombraSuave(vec3 p, vec3 l) { return 1.0; }
#endif

#ifdef MICRO
/**
 * El relieve microscópico de la membrana.
 *
 * Antes era una sola octava de ruido a una amplitud de dos milésimas, es
 * decir: nada. La superficie salía como un degradado liso de gris a gris, que
 * es exactamente el aspecto de una maqueta sin acabar.
 *
 * Ahora hay tres cosas, y las tres tienen un porqué:
 *
 *  - Estrías finas recorriendo la hoja a lo largo del barrido. Dan dirección
 *    al material: una superficie con veta se lee como algo fabricado o
 *    crecido, una sin veta se lee como plastilina.
 *  - Dos octavas de ruido que rompen esa veta, para que no parezca un rayado
 *    de máquina.
 *  - Un moteado muy fino que sólo existe para que el especular cerrado se
 *    parta en destellos en vez de ser una mancha blanca.
 *
 * Nada de esto entra en la marcha: se aplica sólo a la normal del impacto.
 * Meterlo en el mapa costaría dos octavas de ruido POR PASO, y se ve igual.
 */
vec3 microNormal(vec3 p, vec3 n) {
  float rho = length(p.xy);

  /* Coordenada a lo ancho de la sección. Las líneas que genera corren en
     paralelo al barrido, que es la dirección en la que la hoja crece. */
  float ancho = rho * 132.0 + p.z * 132.0;

  /* La veta pesa poco y el ruido pesa mucho. Al revés salía pana: un rayado
     regular y visible de frente. Lo que se busca es lo contrario —algo que no
     se ve de frente y aparece cuando la luz entra rasante—, y eso se consigue
     con irregularidad, no con líneas. */
  float veta = sin(ancho) * 0.30 + sin(ancho * 2.31 + 1.7) * 0.14;
  float roto = ruido3(p * 22.0) * 1.0 + ruido3(p * 61.0) * 0.5 + ruido3(p * 148.0) * 0.25;

  float h = veta * 0.22 + (roto - 0.87) * 1.0;

  /* Gradiente por diferencias: se evalúa el mismo relieve desplazado sobre
     dos direcciones tangentes y se inclina la normal con la pendiente. */
  vec3 tg = normalize(cross(n, vec3(0.0, 0.0, 1.0)) + vec3(1e-5));
  vec3 bt = cross(n, tg);
  const float e = 0.0035;

  float ha = sin((length((p + tg * e).xy) * 132.0 + (p + tg * e).z * 132.0)) * 0.30 * 0.22
           + (ruido3((p + tg * e) * 22.0) - 0.87) * 1.0;
  float hb = sin((length((p + bt * e).xy) * 132.0 + (p + bt * e).z * 132.0)) * 0.30 * 0.22
           + (ruido3((p + bt * e) * 22.0) - 0.87) * 1.0;

  vec3 pend = (vec3(ha, hb, 0.0) - vec3(h, h, 0.0)) / e;
  return normalize(n - (tg * pend.x + bt * pend.y) * 0.000075);
}
#endif

/* ── Iluminación ─────────────────────────────────────────────────────────
   Lo que separa un objeto negro bonito de una mancha oscura es el especular.
   No la difusa —esto es obsidiana, apenas rebota nada— y no el color, que es
   casi negro. El brillo. Así que aquí hay tres capas de brillo y cada una
   hace un trabajo distinto. */

/**
 * Especular anisótropo (modelo de Ward).
 *
 * Antes era una potencia del coseno a secas, que reparte el brillo igual en
 * todas las direcciones y da una mancha redonda, que se lee como
 * plástico: no dice nada de cómo está hecha la superficie.
 *
 * Este se estira a lo largo del barrido de la hoja, que es la dirección en la
 * que la membrana crece. El resultado es un brillo alargado que sigue la
 * forma, y eso es lo que hace que el material parezca tener fibra.
 */
float wardAniso(vec3 n, vec3 l, vec3 v, vec3 tg, vec3 bt, float ax, float ay) {
  vec3 h = normalize(l + v);
  float nl = dot(n, l), nv = dot(n, v), nh = dot(n, h);
  if (nl <= 0.0 || nv <= 0.0) return 0.0;

  float th = dot(h, tg) / ax;
  float bh = dot(h, bt) / ay;
  float exponente = -2.0 * (th * th + bh * bh) / (1.0 + nh);

  return exp(exponente) / (12.566 * ax * ay * sqrt(max(nl * nv, 1e-4)));
}

vec3 sombrear(vec3 p, vec3 n, vec3 rd) {
  /* Tres luces y ninguna es ambiente. La clave barre: girar uBarrido es lo
     que descubre primero una línea, luego una superficie y luego la
     curvatura. El contra separa la silueta del fondo —sin él un objeto negro
     sobre negro no tiene borde por detrás— y el relleno impide que la cara
     opuesta sea un agujero. */
  vec3 lClave  = normalize(vec3(cos(uBarrido) * 0.9, 0.78, sin(uBarrido) * 0.9 + 0.4));
  vec3 lContra = normalize(vec3(-cos(uBarrido) * 0.8, 0.2, -0.85));
  vec3 lRelleno = normalize(vec3(-0.8, -0.35, 0.5));
  vec3 v = -rd;

  /* Dirección del barrido en el punto de impacto: la tangente al arco que
     recorre la hoja. Es lo que orienta el especular anisótropo. */
  vec3 tg = normalize(vec3(-p.y, p.x, 0.0) + vec3(1e-5));
  tg = normalize(tg - n * dot(n, tg));
  vec3 bt = cross(n, tg);

  float ndl = max(0.0, dot(n, lClave));
  float sombra = sombraSuave(p + n * 0.008, lClave);
  float fres = pow(1.0 - max(0.0, dot(n, v)), 3.1);

  /* Difusa: casi nada, y es correcto. */
  vec3 col = C_MATERIA * (0.10 + ndl * 0.55 * sombra);
  col += C_MATERIA * max(0.0, dot(n, lRelleno)) * 0.18;

  /* Capa 1 — el barniz. Muy estrecho y estirado a lo largo de la hoja. Es el
     filo del brillo, el que dibuja por dónde va la superficie. */
  float barniz = wardAniso(n, lClave, v, tg, bt, 0.035, 0.22);
  col += C_LUZ * clamp(barniz, 0.0, 20.0) * 0.048 * sombra * uRevelado;

  /* Capa 2 — el satinado. Ancho y débil: es el que hace que la membrana se
     despegue del fondo en las zonas donde no le da la clave de lleno. */
  float satinado = wardAniso(n, lClave, v, tg, bt, 0.32, 0.58);
  col += C_LUZ * clamp(satinado, 0.0, 5.0) * 0.017 * sombra * uRevelado;

  /* Capa 3 — el contraluz. Estrecho y por detrás: recorta la silueta. */
  float contra = wardAniso(n, lContra, v, tg, bt, 0.12, 0.30);
  col += C_LUZ * clamp(contra, 0.0, 10.0) * 0.03 * uRevelado;

  /* El filo. Una banda muy estrecha justo en el límite de la silueta, además
     del borde ancho de siempre. Sin ella el objeto termina en un degradado y
     parece que esté desenfocado. */
  float filo = pow(1.0 - max(0.0, dot(n, v)), 13.0);
  col += C_LUZ * filo * 0.42 * (0.3 + 0.7 * uRevelado);
  col += C_LUZ * fres * (0.05 + 0.15 * uRevelado);

  /* Un cielo mínimo. Sin él la cara de arriba y la de abajo son idénticas
     cuando la clave está de lado, y el objeto se aplana. */
  col += C_LUZ * (0.5 + 0.5 * n.y) * 0.012;

  /* La apertura ilumina hacia dentro.

     Esta es la firma del objeto y no es un adorno: la energía vive en el
     vacío central, así que las caras que miran al vacío están encendidas y
     las que miran afuera siguen siendo negras. De ahí sale el anillo verde
     por el interior que se reconoce a dos segundos, y de ahí sale que la luz
     esté ATRAPADA en una estructura y no puesta como una bola en el medio. */
  vec3 tono = mix(C_ENERGIA, C_ALTA, clamp(uEnergia * 0.75 - 0.3 + uRuido, 0.0, 1.0));
  float haciaDentro = max(0.0, dot(n, normalize(-p - vec3(0.0, 0.0, 1e-4))));
  float cerca = exp(-max(0.0, length(p) - VACIO) * 4.5);
  col += tono * haciaDentro * cerca * (0.18 + sqrt(uEnergia) * 0.5) * 1.15;

  /* Luz que atraviesa la membrana donde es fina: los filamentos de dentro se
     transparentan. Es lo que separa el cristal ahumado del plástico negro. */
  vec3 pIn = p - n * 0.09;
  col += tono * campo(pIn, uTiempo, filamentos(pIn, uTiempo)) * 0.22 * (0.35 + fres);

  /* Y las puntas se encienden.

     Donde la hoja se afila hasta desaparecer deja de ser opaca, igual que el
     borde de cualquier pieza de cristal ahumado. Se mide entrando cuatro
     centésimas en el material: si por ahí ya se ha salido otra vez, es que la
     hoja es más fina que eso. Cuesta una evaluación del mapa por píxel con
     impacto y es lo que convierte la cerámica en algo que tiene luz dentro. */
  float atras = mapa(p + rd * 0.03);
  /* El umbral va en la escala del mapa, no en unidades de mundo: hoja()
     divide la distancia por el aplastamiento de la sección, así que una
     profundidad de tres centésimas sale de ahí como ocho milésimas. Con el
     umbral en unidades de mundo, TODA la hoja contaba como fina y el objeto
     entero se ponía verde menta. */
  /* Fino es cuando al entrar TRES centésimas ya se ha salido: es decir,
     cuando la medida sube hacia cero o se hace positiva. Estaba al revés y
     marcaba como fino justo lo más grueso, que es por lo que la pieza entera
     se ponía verde menta. El umbral va además en la escala del mapa, que
     divide por el aplastamiento de la sección. */
  float fino = smoothstep(-0.012, 0.002, atras);
  col += tono * fino * (0.14 + sqrt(uEnergia) * 0.3) * 0.45 * (0.3 + 0.7 * cerca);

  /* Con el error el tono se desatura y titila. Vuelve solo: Nesped no muere. */
  col = mix(col, col * vec3(1.2, 0.9, 0.88), uRuido * (0.5 + 0.5 * sin(uTiempo * 23.0)));

  return col * mix(0.28, 1.0, uRevelado);
}

void main() {
  vec2 xy = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;

  vec3 ade = normalize(uMira - uCam);
  vec3 der = normalize(cross(ade, vec3(0.0, 1.0, 0.0)));
  vec3 arr = cross(der, ade);
  vec3 rd = normalize(xy.x * der * uFov + xy.y * arr * uFov + ade);
  vec3 ro = uCam;

  /* El fondo no es negro puro: lleva una caída radial de dos centésimas.
     Parece irrelevante y no lo es: sin ella, la refracción de la escena 00
     no distorsiona nada visible, porque distorsionar negro da negro. Esa
     caída es lo que hace que antes de ver a Nesped se intuya que hay algo. */
  float vinieta = 1.0 - dot(xy, xy) * 0.05;
  vec3 col = vec3(0.0022, 0.0024, 0.0030) * vinieta * uFondo;

  float lejos = 9.0;

  /* Tamaño angular de un píxel. Es lo que convierte la marcha en algo que
     sabe a qué resolución está pintando. */
  float px = uFov * 2.0 / uRes.y;

  float cob, tCerca;
  float t = marchar(ro, rd, lejos, px, cob, tCerca);

  /* Volumen. Se marcha hasta la superficie —o hasta el fondo si no hay— para
     que la energía quede correctamente ocluida por las membranas. Sin esto
     la luz interior se pintaría por encima del objeto y se leería como un
     halo pegado en pantalla. */
  float hasta = t > 0.0 ? t : lejos;

  /* La marcha del volumen se recorta a la esfera que contiene a Nesped.

     Dos motivos, y el segundo importa más: fuera de esa esfera la densidad ya
     es cero, así que cada paso de más es trabajo tirado; y repartir los pocos
     pasos que hay a lo largo de nueve unidades en vez de tres deja tan poca
     resolución donde sí hay algo que el ruido de arranque se ve como grano. */
  /* Dentro se acorta el recorrido, no se alarga.

     Parece al revés y no lo es: los pasos del volumen son fijos, así que
     repartirlos entre cuatro unidades en vez de dos y media deja menos de dos
     muestras por celda de la retícula. Y por debajo de dos muestras por celda
     lo que sale no es una estructura, es ruido borroso. */
/* El radio se ajusta a donde vive la energía, no a donde vive el objeto.
     Los pasos del volumen son fijos: repartirlos entre 2,2 unidades cuando
     todo lo que hay que resolver cabe en 1,5 es tirar un tercio de las
     muestras, y ese tercio es justo lo que separa un hilo de una mancha. */
  vec2 caja = esfera(ro, rd, uDentro > 0.5 ? 2.8 : 1.55);
  vec3 acum = vec3(0.0);
  float t0 = max(0.03, caja.x);
  float t1 = min(hasta, caja.y);
  float dt = (t1 - t0) / float(PASOS_VOL);
  if (caja.y > 0.0 && dt > 0.0) {
    float tv = t0 + dt * ign(gl_FragCoord.xy);
    vec3 tono = mix(C_ENERGIA, C_ALTA, clamp(uEnergia * 0.75 - 0.3, 0.0, 1.0));

    float minD2[HILOS];
    float tMin[HILOS];
    for (int j = 0; j < HILOS; j++) { minD2[j] = 1e9; tMin[j] = t0; }

    for (int i = 0; i < PASOS_VOL; i++) {
      vec3 p = ro + rd * tv;
      /* Una sola pasada por los arcos, y sirve para dos cosas: sumar la vaina
         —lo ancho y suave, que sí se puede integrar a pasos— y quedarse con a
         qué distancia ha pasado el rayo de cada hilo.

         Los núcleos NO se integran. Un hilo de dos centésimas de radio
         muestreado a pasos de cuatro es un hilo que aparece y desaparece
         entre fotogramas; con la aproximación mínima sale exacto y no depende
         de cuántos pasos se den. Es la diferencia entre un hilo de luz y una
         mancha. */
      float vaina = 0.0;
      for (int j = 0; j < HILOS; j++) {
        vec3 eje, ue, ve, ca; float radio, cm, sm;
        arcoDe(j, uTiempo, eje, ue, ve, ca, radio, cm, sm);
        float d2 = distArco(p, eje, ue, ve, ca, radio, cm, sm);
        vaina += exp(-d2 * 90.0) * 0.075;
        if (d2 < minD2[j]) { minD2[j] = d2; tMin[j] = tv; }
      }

      acum += tono * campo(p, uTiempo, vaina * velo(p)) * dt * 1.55;

      tv += dt;
    }

    /* La retícula del logo, cuando la hay.

       Son puntos, y la distancia mínima de un rayo a un punto se calcula de
       una vez, sin muestrear. Igual que con los hilos: a pasos fijos los
       puntos aparecían y desaparecían según dónde cayera la muestra, y con
       DORMANT —que es cuando la marca se forma— eso significaba no verla. */
    if (uFormacion > 0.01) {
      const float PASO_X = 0.128;
      const float PASO_Y = 0.098;
      float brilloPunto = pow(clamp(uFormacion, 0.0, 1.0), 1.8) * (0.3 + uEnergia * 1.2) * 1.25;

      for (int col = 0; col < 6; col++) {
        float alt = ALTURAS[col];
        float x = (float(col) - 2.5) * PASO_X;
        for (int k = 0; k < 6; k++) {
          if (float(k) > alt - 1.0) break;
          vec3 q = vec3(x, (float(k) - (alt - 1.0) * 0.5) * PASO_Y, 0.0);
          vec3 w = q - ro;
          float proy = dot(w, rd);
          if (proy <= 0.0 || proy > t1) continue;
          float d2 = dot(w, w) - proy * proy;
          acum += tono * exp(-d2 * 2200.0) * brilloPunto;
        }
      }
    }

    /* Y ahora sí, los hilos, una vez cada uno.
   
       Antes de pintarlos se afina el mínimo. El bucle de arriba lo localiza
       con la precisión de un paso, y eso deja el hilo con un abalonado fino:
       su grosor cambia según dónde haya caído la muestra más cercana. Cuatro
       iteraciones de sección áurea alrededor de ese punto lo dejan liso, y
       cuestan nueve distancias por hilo en vez de una por paso. */
    float brilloHilo = (0.35 + uAgita * 0.9) * (0.25 + uEnergia * 0.95) * 0.62
                     * (1.0 - clamp(uFormacion, 0.0, 1.0) * 0.88);

    for (int j = 0; j < HILOS; j++) {
      float fj = float(j);
      vec3 eje, ue, ve, ca; float radio, cm, sm;
      arcoDe(j, uTiempo, eje, ue, ve, ca, radio, cm, sm);

      float a = max(t0, tMin[j] - dt);
      float b = min(t1, tMin[j] + dt);
      for (int k = 0; k < 4; k++) {
        float m1 = a + (b - a) * 0.382;
        float m2 = a + (b - a) * 0.618;
        float d1 = distArco(ro + rd * m1, eje, ue, ve, ca, radio, cm, sm);
        float d2 = distArco(ro + rd * m2, eje, ue, ve, ca, radio, cm, sm);
        if (d1 < d2) b = m2; else a = m1;
      }

      float tm = (a + b) * 0.5;
      vec3 pm = ro + rd * tm;
      float dm = distArco(pm, eje, ue, ve, ca, radio, cm, sm);

      /* Cada hilo brilla distinto, y los que quedan detrás brillan menos.
         Con todos iguales el manojo se aplana y parece un dibujo; con esto
         hay unos delante de otros, que es lo que le da hondura al vacío. */
      float suyo = 0.55 + 0.45 * sin(fj * 2.4 + uTiempo * 0.3);
      float hondo = exp(-max(0.0, tm - length(uCam)) * 0.55);

      float apriete = mix(2600.0, 1700.0, clamp(uDentro, 0.0, 1.0));
      acum += tono * exp(-dm * apriete) * brilloHilo * suyo * hondo * velo(pm);
    }
  }

  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = normal(p);
#ifdef MICRO
    n = microNormal(p, n);
#endif
    col = sombrear(p, n, rd);
  } else if (cob < 1.0) {
    /* El rayo ha pasado rozando: este píxel está a medias dentro del objeto.
       Se sombrea en el punto de máxima aproximación y se mezcla con el fondo
       según cuánto lo cubre. Es lo que convierte una silueta en escalones en
       una silueta con filo. */
    vec3 p = ro + rd * tCerca;
    vec3 n = normal(p);
#ifdef MICRO
    n = microNormal(p, n);
#endif
    col = mix(col, sombrear(p, n, rd), 1.0 - smoothstep(0.0, 1.0, cob));
  }

  col += acum;

  salida = vec4(col * uEscala, 1.0);
}`;
}

/* ── Halo ───────────────────────────────────────────────────────────────
   Extraer, difuminar en dos pasadas separables a un cuarto de resolución, y
   sumar. Controlado: el umbral está por encima de 1, así que sólo florece la
   energía, nunca la cerámica. Un halo que coge también el material convierte
   cualquier objeto oscuro en una mancha, que es el aspecto por defecto de
   las webs que abusan de bloom. */
export const FS_BRILLO = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 salida;
uniform sampler2D uTex;
uniform float uUmbral;
void main() {
  vec3 c = texture(uTex, uv).rgb;
  float brillo = max(c.r, max(c.g, c.b));
  float k = max(0.0, brillo - uUmbral) / max(brillo, 1e-4);
  salida = vec4(c * k, 1.0);
}`;

export const FS_BORRON = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 salida;
uniform sampler2D uTex;
uniform vec2 uPaso;
void main() {
  /* Pesos de un gaussiano de nueve muestras resuelto con cinco lecturas
     bilineales: el hardware interpola dos téxeles por lectura gratis. */
  vec3 c = texture(uTex, uv).rgb * 0.227027;
  c += texture(uTex, uv + uPaso * 1.3846).rgb * 0.316216;
  c += texture(uTex, uv - uPaso * 1.3846).rgb * 0.316216;
  c += texture(uTex, uv + uPaso * 3.2307).rgb * 0.070270;
  c += texture(uTex, uv - uPaso * 3.2307).rgb * 0.070270;
  salida = vec4(c, 1.0);
}`;

export const FS_COMPONER = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 salida;
uniform sampler2D uBase;
uniform sampler2D uHalo;
uniform float uFuerzaHalo;
uniform float uFondo;
uniform vec2 uRes;

/* Curva de tono. Sin ella, la energía satura a blanco puro en cuanto sube y
   el verde de la marca desaparece justo cuando más tiene que decir. */
vec3 tono(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 col = texture(uBase, uv).rgb + texture(uHalo, uv).rgb * uFuerzaHalo;
  col = tono(col);

  /* De lineal a pantalla.

     Sin esta conversión los valores lineales viajan tal cual a un búfer que
     la pantalla interpreta como sRGB: los medios tonos se hunden, y para
     compensarlo hay que subir tanto la luz de la escena que la cerámica
     acaba pareciendo plástico blanco. Con ella el material puede quedarse
     casi negro y seguir teniendo volumen. */
  col = pow(max(col, vec3(0.0)), vec3(1.0 / 2.2));

  /* Tramado.

     Todo el sitio es negro y esta escena es casi toda degradado oscuro. En
     ocho bits eso se ve a bandas —anillos concéntricos alrededor del núcleo—
     en cualquier pantalla decente. Un tramado triangular de un bit los
     rompe y no se ve. Es la diferencia entre "parece un render" y "parece un
     JPEG viejo". */
  float r = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float r2 = fract(sin(dot(gl_FragCoord.xy + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (r + r2 - 1.0) / 255.0;

  /* Transparencia donde no hay nada.

     Con fondo, el lienzo es la escena entera y va opaco. Sin fondo —el núcleo
     anclado en una esquina, o el icono del portal— tiene que dejar ver la
     página por detrás. Se hizo primero con mix-blend-mode: screen y
     funcionaba, pero obliga al compositor a releer el lienzo en cada
     fotograma: el propio driver avisa de la parada de GPU. Con alfa
     premultiplicado sale gratis y además se compone igual.  */
  float alfa = uFondo > 0.5 ? 1.0 : clamp(max(col.r, max(col.g, col.b)) * 1.6, 0.0, 1.0);
  salida = vec4(col, alfa);
}`;
