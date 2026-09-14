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

import { COLOR, MEMBRANAS, MOVIMIENTO, VACIO } from "../tokens.js";

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
/* Cada membrana entra en el shader como una llamada con sus constantes ya
   resueltas. Y "resueltas" incluye los senos y cosenos de sus ángulos: el
   centro del arco y su medio ángulo no cambian nunca, así que calcularlos en
   el shader sería hacerlo una vez por hoja, por paso y por píxel. */
function llamadasMembranas() {
  return MEMBRANAS.map((m, i) => {
    const medio = m.arco / 2;
    /* La ondulación del radio es un armónico del ángulo: cos(n·φ + centro).
       Se expande con las fórmulas del ángulo múltiple para no tener que saber
       φ —que es lo que costaría un arcotangente— sino sólo su seno y su
       coseno, que salen gratis de las coordenadas del punto. */
    const n = Math.round(m.ondaR[0]);
    const armonico = n === 2
      ? "vec2(2.0*cp*cp - 1.0, 2.0*cp*sp)"
      : "vec2(cp*(4.0*cp*cp - 3.0), sp*(3.0 - 4.0*sp*sp))";
    return `
  d = min(d, hoja(p, ${f(Math.cos(m.centro))}, ${f(Math.sin(m.centro))},
                  ${f(Math.cos(medio))}, ${f(Math.sin(medio))}, ${f(medio)},
                  ${f(m.radio)}, ${f(m.grosor)}, ${v2(m.inclina)},
                  ${f(m.z)}, ${f(m.zAmp)}, ${f(m.ondaR[1])}, ${n}, abre, ${f(i)}));`;
  }).join("");
}

export function fsNucleo({ pasos, pasosVol, sombra, hilos, micro }) {
  return `#version 300 es
precision highp float;

in vec2 uv;
out vec4 salida;

uniform vec2  uRes;
uniform float uTiempo;
uniform vec4 uArticula[3];

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
#define HILOS ${hilos}
${sombra > 0 ? `#define PASOS_SOMBRA ${sombra}` : ""}
${micro ? "#define MICRO 1" : ""}

const vec3 C_LUZ     = ${v3(COLOR.luz)};
const vec3 C_ENERGIA = ${v3(COLOR.energia)};
const vec3 C_ALTA    = ${v3(COLOR.energiaAlta)};
const vec3 C_MATERIA = ${v3(COLOR.materia)};
const float VACIO    = ${f(VACIO)};

mat2 giro(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

/**
 * Arcocoseno aproximado.
 *
 * Seis operaciones y un error por debajo de la diezmilésima, que para decidir
 * la forma de una punta sobra de largo. Hace falta porque el afilado de la
 * hoja depende de POR DÓNDE del arco va el punto, y ese reparto medido con el
 * coseno a secas sale deformado: el coseno cae despacio en el centro y de
 * golpe en los extremos, así que las hojas salían gordas y con las puntas
 * romas. Con el ángulo de verdad la curva vuelve a ser la que era, y sigue
 * costando una fracción de lo que costaba el arcotangente que había antes.
 */
float acosRapido(float x) {
  float neg = x < 0.0 ? 1.0 : 0.0;
  float ax = abs(x);
  float r = -0.0187293 * ax + 0.0742610;
  r = r * ax - 0.2121144;
  r = r * ax + 1.5707288;
  r *= sqrt(max(1.0 - ax, 0.0));
  return neg * PI + (1.0 - 2.0 * neg) * r;
}

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

   Ni un arcotangente ni un módulo. Los había —uno de cada por hoja— y eso son
   trescientos treinta arcotangentes por píxel contando los pasos de la marcha,
   que es de largo lo más caro de toda la escena.

   Y no hacen falta: lo único que se necesita del ángulo del punto es su seno y
   su coseno, y esos salen de dividir sus coordenadas por el radio. Todo lo
   demás —la posición dentro del arco, la ondulación del radio, la altura— se
   expresa con sumas de ángulos y ángulos múltiples a partir de ahí. */
float hoja(vec3 p, float cCen, float sCen, float cosMedio, float senMedio,
           float medioAng, float radio, float grosor, vec2 inclina,
           float z0, float zAmp, float ondaAmp, int ondaN, float abre, float idx) {
  vec4 articulacion = uArticula[int(idx)];
  p.xy *= mat2(articulacion.x, -articulacion.y, articulacion.y, articulacion.x);
  p.z -= articulacion.w;
  p.yz *= giro(inclina.x);
  p.xz *= giro(inclina.y);

  float rho = length(p.xy);
  float inv = 1.0 / max(rho, 1e-5);
  float cf = p.x * inv;                    // coseno del ángulo del punto
  float sf = p.y * inv;                    // seno del ángulo del punto

  // Ángulo relativo al centro del arco, en forma de seno y coseno.
  float cosRel = cf * cCen + sf * sCen;
  float sinRel = sf * cCen - cf * sCen;

  float cp, sp;   // el punto de la curva central al que se mide
  float t;        // 0 en mitad del arco, 1 en las puntas

  if (cosRel >= cosMedio) {
    // Dentro del tramo: el punto más cercano de la curva está en su mismo
    // ángulo, así que su seno y su coseno son los del propio punto.
    cp = cf; sp = sf;
    t = min(acosRapido(clamp(cosRel, -1.0, 1.0)) / medioAng, 1.0);
  } else {
    // Fuera: al extremo del lado en el que estamos, que es una constante.
    float lado = sinRel >= 0.0 ? 1.0 : -1.0;
    cp = cCen * cosMedio - sCen * senMedio * lado;
    sp = sCen * cosMedio + cCen * senMedio * lado;
    t = 1.0;
  }

  // Ondulación del radio: cos(n·φ + centro), por ángulos múltiples.
  vec2 arm = ondaN == 2
    ? vec2(2.0 * cp * cp - 1.0, 2.0 * cp * sp)
    : vec2(cp * (4.0 * cp * cp - 3.0), sp * (3.0 - 4.0 * sp * sp));
  float rr = radio * abre + ondaAmp * (arm.x * cCen - arm.y * sCen);

  // Altura: sin(φ + centro).
  float zz = z0 + zAmp * (sp * cCen + cp * sCen);

  /* La respiración no escala el objeto: recorre el arco como una onda. Una
     escala uniforme se lee como "zoom"; esto se lee como que algo grande
     coge aire. */
  rr += articulacion.z * (0.55 + 0.45 * cp);

  vec3 c = vec3(cp * rr, sp * rr, zz);

  /* Afilado de las puntas. Era pow(sin(PI*u), 0.62): misma curva, sin la
     potencia fraccionaria, que se evalúa por hoja y por paso de la marcha. */
  float sn = cos(1.5708 * t);
  float th = grosor * sn * (1.62 - 0.62 * sn);

  /* Inestabilidad: el error deforma el arco por tramos y se recompone. No
     apaga a Nesped ni lo hace vibrar entero, que se leería como fallo de
     render y no como estado. */
  if (uRuido > 0.001) th *= 1.0 + uRuido * 0.35 * sin(t * 27.0 + uTiempo * 9.0 + idx);

  /* Tensión de superficie hacia el puntero. Dos centésimas de radio: se
     nota que responde, no se nota que sigue. */
  float lado2 = dot(normalize(vec3(uPuntero, 0.55)), normalize(c + vec3(0.0, 0.0, 0.001)));
  th *= 1.0 + max(0.0, lado2) * 0.05;

  /* Sección elíptica, no circular.

     Con sección circular esto es un tubo doblado, y un tubo doblado se lee
     como cuerda. Aplastando el eje del vacío el barrido produce una hoja:
     ancha en el plano del arco, fina en profundidad. */
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
  /* Elevar al cuadrado con pow() es pedir un logaritmo y una exponencial de
     más. Aquí se paga tres veces por paso de la marcha. */
  float fuera = (abs(caraZ) - 0.62) * 5.0;
  float canal = exp(-fuera * fuera);
  th -= th * 0.22 * canal;

  /* Al escalar un eje, la función deja de devolver una distancia: crece más
     deprisa en ese eje que en los demás, así que el rayo daría pasos más
     largos de lo que puede y atravesaría la hoja sin verla.

     Lo obvio es dividir por el factor de aplastamiento, y eso funciona, pero
     reparte el castigo por igual: en el plano del arco —por donde llega casi
     cualquier rayo— la función no crece 3,6 veces más deprisa, crece igual, y
     el rayo acaba avanzando a un sexto de lo que podría. Con la marcha
     terminando por distancia y no por número de pasos, eso era el 70% del
     coste de la escena.

     Lo que corresponde es dividir por lo que la función crece DE VERDAD en
     este punto, que es el módulo de su gradiente. Vale 1 en el plano del arco
     y 3,6 mirando de canto, y en los dos casos la cota sigue siendo válida. */
  float L = length(q);
  float grad = length(vec3(q.xy, q.z * APLASTA)) / max(L, 1e-5);
  return (L - max(th, 0.005)) / grad;
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

/**
 * El plano, el radio y el tramo de cada uno de los hilos.
 *
 * El marco sale ya girado para que el arco quede centrado en el ángulo cero.
 * Eso permite recortarlo después con un coseno en vez de con un arcotangente,
 * que dentro del bucle del volumen se evalúa nueve veces por paso.
 */
/* Medio ángulo de un arco: cuánto abarca a cada lado de su centro. Sale
   aparte de arcoDe() porque el pase de hilos barre el arco por su ángulo y
   necesita saber dónde termina. */
float medioDe(float fj) {
  return (1.85 + 1.0 * sin(fj * 1.3)) * 0.5;
}

void arcoDe(int j, float t, out vec3 eje, out vec3 u, out vec3 v,
            out vec3 centroArco, out float radio, out float cosMedio, out float senMedio) {
  float fj = float(j);
  float agita = 0.22 + uAgita * 1.9;

  /* Inclinación del plano de cada hilo. Los dos ángulos avanzan con el tiempo
     a ritmos distintos: los hilos se reorganizan despacio, que es exactamente
     lo que tiene que hacer algo que está pensando. */
  /* Se reparte con el número áureo en vez de con un paso fijo: con un paso
     fijo, cambiar cuántos hilos hay reordena todos los planos y el manojo
     cambia de aspecto entre niveles de calidad. Así, quitar hilos quita
     hilos y no rehace el dibujo. */
  float a = fj * 2.39996 + t * agita * (0.11 + 0.028 * fj);
  float b = 0.46 * sin(fj * 2.1 + t * agita * 0.07) + fract(fj * 0.618) * 1.1 - 0.55;

  eje = vec3(cos(a) * cos(b), sin(b), sin(a) * cos(b));
  vec3 u0 = normalize(cross(eje, vec3(0.0, 1.0, 0.013)));
  vec3 v0 = cross(eje, u0);

  float centro = fj * 2.79 + t * agita * 0.2;
  u = u0 * cos(centro) + v0 * sin(centro);
  v = cross(eje, u);

  radio = 0.22 + 0.075 * sin(fj * 1.7) + fract(fj * 0.382) * 0.46;

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

  float medio = medioDe(fj);
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
 * El perfil de distancia de un arco a un rayo, en forma cerrada.
 *
 * Visto como función del ángulo sobre el arco, el cuadrado de la distancia al
 * rayo es un polinomio trigonométrico de grado dos:
 *
 *     d²(θ) = c0 + c1·cosθ + c2·senθ + c3·cos2θ + c4·sen2θ
 *
 * Sale de proyectar el arco sobre el plano perpendicular al rayo, donde el
 * arco es una elipse, y cambia el coste por completo: evaluar el perfil son
 * diez multiplicaciones, no construir un punto en el espacio, restarlo del
 * origen y proyectarlo. Los cinco coeficientes se calculan una vez por arco.
 *
 * Con eso caben veinticuatro muestras por arco donde antes cabían siete, y
 * ese es el número que importa: con siete, el mínimo se escapaba entre dos
 * muestras en unos píxeles y no en sus vecinos, y los hilos salían a trazos.
 *
 * El recorte de t a [t0,t1] va dentro, y no es un detalle: es lo que hace que
 * la membrana tape los hilos que quedan detrás. Lo que se le suma al cuadrado
 * es exactamente lo que se pasa el punto del tramo útil del rayo.
 */
float perfilArco(float co, float se, vec4 cA, vec4 cB, float t0, float t1, out float tr) {
  float perp = cA.x + cA.y * co + cA.z * se
             + cA.w * (co * co - se * se) + cB.x * (2.0 * co * se);
  tr = cB.y + cB.z * co + cB.w * se;
  float fuera = tr - clamp(tr, t0, t1);
  return max(0.0, perp) + fuera * fuera;
}

/**
 * Envolvente: los hilos viven dentro y alrededor del vacío, no en todo el
 * encuadre. Fuera es una esfera alrededor del objeto; dentro se convierte en
 * un cilindro alrededor del eje por el que se entra, porque ahí la estructura
 * se extiende hacia delante y una esfera la cortaría a dos palmos.
 */
float velo(vec3 p) {
  return mix(exp(-dot(p, p) * 1.15), exp(-dot(p.xy, p.xy) * 0.55), clamp(uDentro, 0.0, 1.0));
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

    /* El mismo descarte que en el pase de hilos, con la cuenta más fácil
       porque aquí hay un punto y no un rayo: si el punto está a más del radio
       del arco más su alcance, ningún punto del arco le llega. */
    float aCentro = length(p - ca);
    if (aCentro > radio + 0.42 || aCentro < radio - 0.42) continue;

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

  /* Donde la caída ya los ha apagado no se calcula nada. Parece de perogrullo
     y no lo es: por debajo vienen cinco potencias de catorce y un arcotangente
     por cada tren de anillos, y el bucle del volumen pasa por aquí en cada
     paso. La caída vale cero a partir de 1,05 y una diezmilésima a 1,6. */
  if (rho > 1.05 || abs(p.z) > 1.6) return 0.0;

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
  /* La retícula sólo existe alrededor del eje por el que se entra: al final
     se multiplica por exp(-r²·1,05), que a r² = 4,4 ya vale una milésima.
     Preguntarlo aquí ahorra tres exponenciales y dos hashes por paso. */
  if (dot(p.xy, p.xy) > 4.4) return 0.0;

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

/* Energía dirigida: en ACTING y HANDOFF la densidad se concentra en un cono
   hacia el objetivo real de la interfaz. Es lo que convierte "brilla" en "va
   hacia allí". Multiplica a todo el campo, así que vive aparte. */
float dirigido(vec3 p) {
  if (uDirigido <= 0.001) return 1.0;
  float al = dot(normalize(p + vec3(0.0, 0.0, 1e-4)), normalize(uDir + vec3(1e-4)));
  return mix(1.0, smoothstep(-0.1, 0.95, al) * 2.6, uDirigido);
}

/**
 * El campo de energía SIN los hilos: anillos, retícula interior y envolvente.
 *
 * El campo está partido en dos —esto y pesoHilos()— porque es afín en la
 * densidad de hilos: lo que los hilos aportan se suma, y todo lo demás los
 * multiplica. Partirlo permite integrar el trasfondo a pasos, que es suave y
 * lo admite, y resolver los hilos aparte y exactos. La suma de los dos da lo
 * mismo que daba la función entera.
 */
float campoBase(vec3 p, float t) {
  float dens = anillos(p, t) * 0.6;

  if (uDentro > 0.002) {
    float k = clamp(uDentro, 0.0, 1.0);
    dens = dens * (1.0 - 0.7 * k) + interior(p, t) * 1.5 * k;
  }

  dens *= dirigido(p);

  /* Envolvente global.

     La energía de Nesped vive dentro y alrededor del objeto, no en el resto
     del encuadre. Sin este límite el halo se extiende hasta los bordes y lo
     que se ve deja de ser un objeto con luz dentro para ser una mancha. */
  float lejos = max(0.0, length(p) - 1.25);
  dens *= exp(-lejos * lejos * 6.0);

  return dens * (0.25 + uEnergia * 0.95);
}

/**
 * Cuánto pesa un hilo en el campo, en un punto.
 *
 * Es campoBase() derivada respecto a la densidad de hilos: todo lo que
 * multiplica a los hilos y nada de lo que se suma. Existe aparte porque el
 * pase de hilos necesita sólo esto, y evaluar el campo entero —con sus
 * anillos y su retícula— una vez por hilo sería pagar el trasfondo catorce
 * veces por píxel.
 */
float pesoHilos(vec3 p) {
  float w = 0.35 + uAgita * 0.9;

  /* La retícula del logo sale del trazo exacto en main(), no de aquí: a pasos
     fijos los puntos parpadean. Lo que queda aquí es recoger los hilos cuando
     la marca se forma. */
  w *= 1.0 - clamp(uFormacion, 0.0, 1.0) * 0.88;

  if (uDentro > 0.002) w *= 1.0 - 0.7 * clamp(uDentro, 0.0, 1.0);

  w *= dirigido(p);

  float lejos = max(0.0, length(p) - 1.25);
  return w * exp(-lejos * lejos * 6.0) * (0.25 + uEnergia * 0.95);
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
  cob = 1e9;

  /* Antes de marchar, la pregunta barata: ¿este rayo llega siquiera a rozar a
     Nesped? Todo el objeto cabe en una esfera de radio 1,35, y cortar un rayo
     con una esfera es una raíz cuadrada.

     Sin esto, cada rayo del fondo —que en un encuadre cerrado son la mitad
     largos de la pantalla— recorría las nueve unidades del escenario a pasos
     de la función de distancia para acabar sin tocar nada. Y los que sí tocan
     se ahorran el trayecto hasta la esfera.

     Ojo: no es la comprobación por paso que se probó antes y salió más lenta.
     Aquella preguntaba lo mismo dentro del bucle, donde ya se sabe la
     respuesta; esta se hace una vez y decide si hay bucle. */
  vec2 vaina = esfera(ro, rd, 1.35);
  if (vaina.y <= 0.0) { tCerca = 0.02; return -1.0; }

  float t = max(0.02, vaina.x);
  float fin = min(lejos, vaina.y);
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
    t += d * 0.72;
    if (t > fin) break;
  }
  return -1.0;
}

#ifdef PASOS_SOMBRA
float sombraSuave(vec3 p, vec3 l) {
  /* La sombra sólo puede venir de otra membrana, y las tres caben en la misma
     esfera: pasada la salida no queda nada que pueda tapar la luz. Con el
     paso mínimo atado a una centésima, sin este corte el rayo de sombra
     recorría tres unidades a ciegas por cada píxel con impacto. */
  float fin = min(3.0, esfera(p, l, 1.35).y);
  float res = 1.0;
  float t = 0.02;
  for (int i = 0; i < PASOS_SOMBRA; i++) {
    float d = mapa(p + l * t);
    if (d < 0.0008) return 0.0;
    res = min(res, 12.0 * d / t);
    t += clamp(d * 0.7, 0.01, 0.2);
    if (t > fin) break;
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
  /* La luz nunca está quieta.

     El barrido lo coloca la película acto a acto, pero encima lleva una
     deriva lentísima —una vuelta cada tres minutos— que no para nunca. Sin
     ella, en los tramos donde la cámara se detiene el objeto se congela: los
     brillos se quedan clavados en el mismo sitio y lo que era una pieza con
     material pasa a ser una imagen fija. Con ella, los reflejos recorren las
     hojas despacio y el objeto sigue vivo aunque no pase nada. */
  float barrido = uBarrido + sin(uTiempo * 0.38) * ${f(MOVIMIENTO.luz)};

  vec3 lClave  = normalize(vec3(cos(barrido) * 0.9, 0.78, sin(barrido) * 0.9 + 0.4));
  vec3 lContra = normalize(vec3(-cos(barrido) * 0.8, 0.2, -0.85));
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
  col += C_LUZ * clamp(barniz, 0.0, 20.0) * 0.062 * sombra * uRevelado;

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

  /* Refracción.

     Los hilos de dentro no se ven "a través" de la membrana como si fuera un
     cristal plano: se ven DESVIADOS, y hacia dónde depende de cómo esté
     inclinada la superficie en ese punto. Es lo que separa el cristal ahumado
     de una calcomanía translúcida, y es prácticamente gratis porque la
     muestra del campo ya se estaba tomando; lo único que cambia es dónde.

     Con dispersión: el índice no es el mismo para todo el espectro, así que
     los tres canales se muestrean a profundidades ligeramente distintas y el
     borde de cada hilo refractado se tiñe. Es el detalle que hace que un
     material se lea como óptico y no como pintado. */
  vec3 desvio = refract(rd, n, 0.71);
  if (dot(desvio, desvio) < 0.001) desvio = reflect(rd, n);   // reflexión total

  vec3 pr = p + desvio * 0.20;
  vec3 pv = p + desvio * 0.215;
  float hr = filamentos(pr, uTiempo);
  float hv = filamentos(pv, uTiempo);
  vec3 trasluz = vec3(hr, (hr + hv) * 0.5, hv);

  col += tono * campoBase(pr, uTiempo) * 0.22 * (0.35 + fres);
  col += mix(C_ENERGIA, C_ALTA, 0.35) * trasluz * 0.26 * (0.3 + fres * 1.3);

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
  /* Dos coma uno, y no dos coma ocho como estaba: el campo se apaga con
     exp(-(|p|-1,25)²·6), que a dos unidades del centro ya vale una milésima.
     Lo que había más allá no se veía, pero se muestreaba, y con un número
     fijo de pasos eso no es sólo trabajo tirado: es resolución robada a la
     parte que sí se ve. */
  vec2 caja = esfera(ro, rd, uDentro > 0.5 ? 2.1 : 1.55);
  vec3 acum = vec3(0.0);
  float t0 = max(0.03, caja.x);
  float t1 = min(hasta, caja.y);
  float dt = (t1 - t0) / float(PASOS_VOL);
  if (caja.y > 0.0 && dt > 0.0) {
    vec3 tono = mix(C_ENERGIA, C_ALTA, clamp(uEnergia * 0.75 - 0.3, 0.0, 1.0));

    /* 1) El trasfondo del campo: anillos, retícula interior y envolvente.

       Todo esto es ancho y suave, que es exactamente lo que un paso fijo
       resuelve bien, así que se integra a pasos. Y no sabe nada de los
       hilos: el campo es afín en su densidad, así que lo que los hilos
       aportan se suma aparte y sale exacto. */
    /* Y los pasos no son iguales: crecen un 6% cada uno.

       Con la cámara dentro del corredor, una celda de la retícula a media
       unidad ocupa en pantalla diez veces lo que la misma celda a cuatro. A
       pasos iguales se gasta el mismo número de muestras en las dos, y la de
       cerca —que es la que se ve— acaba con menos resolución de la que pide,
       mientras la de lejos recibe de sobra. Creciendo, la densidad de
       muestras MEDIDA EN PANTALLA queda casi constante, y eso vale por el
       doble de pasos sin costar ninguno. */
    const float RAZON = 1.06;
    float crece = pow(RAZON, float(PASOS_VOL));
    float paso = (t1 - t0) * (RAZON - 1.0) / (crece - 1.0);
    float tv = t0 + paso * ign(gl_FragCoord.xy);
    for (int i = 0; i < PASOS_VOL; i++) {
      acum += tono * campoBase(ro + rd * tv, uTiempo) * paso * 1.55;
      tv += paso;
      paso *= RAZON;
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

    /* 2) Los hilos, uno por uno y sin pasos.

       Cada arco se resuelve entero con una sola llamada a arcoDe(): siete
       muestras sobre su ángulo para localizar por dónde pasa más cerca del
       rayo, cuatro iteraciones de sección áurea para afinarlo, y ya. Antes
       esto vivía dentro del bucle del volumen y arcoDe() —diez senos y
       cosenos, dos productos vectoriales y una normalización— se evaluaba
       mil veces por píxel para encontrar los mismos catorce mínimos. Era el
       90% del coste de la escena.

       Y además sale MEJOR: el mínimo ya no depende de dónde caiga una
       muestra del volumen, así que un hilo que pasaba entre dos pasos deja
       de parpadear. */
    float brilloHilo = (0.35 + uAgita * 0.9) * (0.25 + uEnergia * 0.95) * 0.62
                     * (1.0 - clamp(uFormacion, 0.0, 1.0) * 0.88);

    const int MUESTRAS = 7;

    for (int j = 0; j < HILOS; j++) {
      float fj = float(j);
      vec3 eje, ue, ve, ca; float radio, cm, sm;
      arcoDe(j, uTiempo, eje, ue, ve, ca, radio, cm, sm);

      /* Descarte, y es el que paga la fiesta.

         Un hilo sólo se ve hasta unas cuatro décimas de distancia: más allá,
         exp(-90·d²) vale una cienmilésima. Y todos los puntos de un arco
         están a esa misma distancia de su centro, así que si el rayo pasa del centro a más
         del radio más ese alcance, no puede estar cerca de ningún punto del arco. Eso
         se comprueba con un producto escalar y una raíz, y descarta la mayoría
         de los catorce arcos en la mayoría de los píxeles: los hilos ocupan
         una parte pequeña del encuadre, aunque sean lo primero que se mira.

         Es una cota, no una aproximación: lo que descarta no se veía. */
      const float ALCANCE = 0.42;
      vec3 wc = ca - ro;
      float tc = clamp(dot(wc, rd), t0, t1);
      if (length(wc - rd * tc) > radio + ALCANCE) continue;

      float medio = medioDe(fj);

      /* Los cinco coeficientes del perfil, una vez por arco. */
      vec3 A  = ca - ro;
      vec3 Ap = A - rd * dot(A, rd);
      vec3 up = ue - rd * dot(ue, rd);
      vec3 vp = ve - rd * dot(ve, rd);
      float r2 = radio * radio;
      float uu = dot(up, up), vv = dot(vp, vp);
      vec4 cA = vec4(dot(Ap, Ap) + r2 * (uu + vv) * 0.5,
                     2.0 * radio * dot(Ap, up),
                     2.0 * radio * dot(Ap, vp),
                     r2 * (uu - vv) * 0.5);
      vec4 cB = vec4(r2 * dot(up, vp),
                     dot(A, rd), radio * dot(ue, rd), radio * dot(ve, rd));

      /* Barrido del arco entero.

         El seno y el coseno avanzan por recurrencia —girar un ángulo fijo es
         multiplicar por una matriz de 2x2— así que las veinticuatro muestras
         cuestan un seno y un coseno en total, y lo demás son sumas. */
      const int MUESTRAS = 24;
      float paso = 2.0 * medio / float(MUESTRAS - 1);
      float cp = cos(paso), sp = sin(paso);
      float co = cos(medio), se = -sin(medio);      // arranca en -medio

      float mejor = 1e9;
      float iMejor = 0.0;

      for (int i = 0; i < MUESTRAS; i++) {
        float tr;
        float dd = perfilArco(co, se, cA, cB, t0, t1, tr);
        if (dd < mejor) { mejor = dd; iMejor = float(i); }
        float co2 = co * cp - se * sp;
        se = se * cp + co * sp;
        co = co2;
      }

      /* Afinado dentro de la terna del fondo del valle, por sección áurea.

         Hacía falta más de lo que parecía. Ajustar una parábola a las tres
         muestras del fondo no basta: el hilo es más fino que el paso del
         barrido, así que a esa escala el valle no es una parábola, y lo que
         salía eran muescas perpendiculares al hilo —una por muestra— porque
         el ángulo estimado saltaba de una muestra a su vecina entre un píxel
         y el de al lado. Seis iteraciones dejan el ángulo con un error diez
         veces menor que el grosor del hilo, y ahí ya no hay muesca que ver. */
      float a = max(-medio, -medio + paso * (iMejor - 1.0));
      float b = min( medio, -medio + paso * (iMejor + 1.0));
      for (int k = 0; k < 6; k++) {
        float m1 = a + (b - a) * 0.382;
        float m2 = a + (b - a) * 0.618;
        float tr1, tr2;
        float e1 = perfilArco(cos(m1), sin(m1), cA, cB, t0, t1, tr1);
        float e2 = perfilArco(cos(m2), sin(m2), cA, cB, t0, t1, tr2);
        if (e1 < e2) b = m2; else a = m1;
      }
      float angM = (a + b) * 0.5;

      float coM = cos(angM), seM = sin(angM);
      float tm;
      float dm = perfilArco(coM, seM, cA, cB, t0, t1, tm);

      /* La vaina: el resplandor ancho alrededor del hilo.

         Ya no se suma paso a paso, se integra de una vez. A lo largo del rayo
         la distancia al arco crece como una parábola alrededor del punto más
         cercano, así que exp(-90·d²) es una campana y su integral tiene
         fórmula cerrada. Lo único que falta es lo abierta que es la campana.

         Y eso sale del mismo perfil, derivado dos veces. Medirlo restando dos
         muestras vecinas —que fue el primer intento— daba cortes rectos a
         media luz por toda la apertura: donde la resta salía negativa o
         diminuta había que recortarla, y el recorte se veía como un borde.
         Derivando no hay nada que recortar. */
      float c2M = coM * coM - seM * seM, s2M = 2.0 * coM * seM;
      float curvaAng = max(0.0, -cA.y * coM - cA.z * seM - 4.0 * (cA.w * c2M + cB.x * s2M));
      float avance = -cB.z * seM + cB.w * coM;        // cuánto corre t por radián
      float curva = clamp(curvaAng / max(2.0 * avance * avance, 1e-5), 0.16, 400.0);

      tm = clamp(tm, t0, t1);
      vec3 pm = ro + rd * tm;

      /* Y si el punto más cercano ha quedado contra un extremo del recorrido
         —tapado por la membrana, o fuera de la esfera— sólo se ve media
         campana. */
      float entero = smoothstep(0.0, 0.09, min(tm - t0, t1 - tm)) * 0.5 + 0.5;
      float vaina = exp(-dm * 90.0) * sqrt(3.14159 / (90.0 * curva)) * 0.038 * entero;

      acum += tono * pesoHilos(pm) * vaina * velo(pm) * 1.55;

      /* Cada hilo brilla distinto, y los que quedan detrás brillan menos.
         Con todos iguales el manojo se aplana y parece un dibujo; con esto
         hay unos delante de otros, que es lo que le da hondura al vacío. */
      float suyo = 0.62 + 0.38 * sin(fj * 2.4 + uTiempo * 0.3);
      float hondo = exp(-max(0.0, tm - length(uCam)) * 0.55);

      float pixel = max(0.0001, tm * uFov / uRes.y);
      float apriete = min(mix(${f(MOVIMIENTO.filoExterior)}, ${f(MOVIMIENTO.filoInterior)}, clamp(uDentro, 0.0, 1.0)), 1.0 / (pixel * pixel));
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
uniform float uNitidez;
uniform float uFondo;
uniform vec2 uRes;

/* Curva de tono. Sin ella, la energía satura a blanco puro en cuanto sube y
   el verde de la marca desaparece justo cuando más tiene que decir. */
vec3 tono(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec3 base = texture(uBase, uv).rgb;
  vec2 texel = 1.0 / vec2(textureSize(uBase, 0));
  vec3 a = texture(uBase, uv + vec2(texel.x, 0.0)).rgb;
  vec3 b = texture(uBase, uv - vec2(texel.x, 0.0)).rgb;
  vec3 c = texture(uBase, uv + vec2(0.0, texel.y)).rgb;
  vec3 d = texture(uBase, uv - vec2(0.0, texel.y)).rgb;
  // Reconstrucción acotada: recupera el filo sin halos sobre el negro.
  vec3 minimo = min(base, min(min(a, b), min(c, d)));
  vec3 maximo = max(base, max(max(a, b), max(c, d)));
  base = clamp(base + (base - (a + b + c + d) * 0.25) * uNitidez, minimo, maximo);
  vec3 col = base + texture(uHalo, uv).rgb * uFuerzaHalo;
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
