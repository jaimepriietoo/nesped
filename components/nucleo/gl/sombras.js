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
  const float APLASTA = 2.8;
  vec3 q = p - c;
  q.z *= APLASTA;

  /* Se divide por el aplastamiento y no es un detalle: al escalar un eje, la
     función deja de devolver una distancia y devuelve algo MAYOR que la
     distancia real en esa dirección. El rayo da entonces pasos más largos de
     lo que puede y atraviesa la hoja sin verla. Dividiendo por el factor
     mayor vuelve a ser una cota inferior y la superficie existe otra vez. */
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

/* Filamentos que enhebran el vacío. Son la actividad interna: pensar. */
float filamentos(vec3 p, float t) {
  float dens = 0.0;
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    float radio = 0.20 + 0.16 * fj;
    float giroF = 3.0 + 1.9 * fj;
    float fase = t * (0.35 + 0.22 * fj) * (0.25 + uAgita * 2.2) + fj * 2.1;
    float a = p.z * giroF + fase;
    vec3 c = vec3(cos(a) * radio, sin(a) * radio, p.z);
    float d = length(p - c);
    dens += exp(-d * d * 260.0);
  }
  /* Acotados en el eje del vacío. Una hélice no tiene final: sin esta
     envolvente el rayo encuentra filamento a cualquier distancia y la escena
     se convierte en niebla verde de borde a borde. */
  return dens * exp(-p.z * p.z * 1.6);
}

/* La retícula del logo.

   Cuando a Nesped no le queda energía, lo poco que hay se ordena solo en
   seis columnas de puntos dentro del vacío: las alturas del logotipo. No se
   dibuja el logo dentro del objeto —eso sería ponerle una pegatina—, es que
   en reposo la energía cae en la misma retícula de la que sale la marca.
   Sube la energía y la formación se deshace. */
const float ALTURAS[6] = float[6](6.0, 4.0, 2.0, 3.0, 5.0, 6.0);

float reticulaLogo(vec3 p) {
  const float PASO_X = 0.128;
  const float PASO_Y = 0.098;

  float col = floor(p.x / PASO_X + 3.0);
  if (col < 0.0 || col > 5.0) return 0.0;
  float alt = ALTURAS[int(col)];

  float x = (col - 2.5) * PASO_X;
  float k = floor(p.y / PASO_Y + (alt - 1.0) * 0.5 + 0.5);
  if (k < 0.0 || k > alt - 1.0) return 0.0;
  float y = (k - (alt - 1.0) * 0.5) * PASO_Y;

  float d = length(p - vec3(x, y, 0.0));
  return exp(-d * d * 900.0) * exp(-p.z * p.z * 40.0);
}

/* Anillos que viajan. Hacia dentro cuando Nesped recibe, hacia fuera cuando
   ejecuta, y a golpes cuando habla. Es la mitad de la gramática visual. */
float anillos(vec3 p, float t) {
  float rho = length(p.xy);
  float caida = exp(-p.z * p.z * 2.6) * smoothstep(1.7, 0.25, rho);
  float dens = 0.0;

  if (uEntra > 0.001) {
    float fase = rho * 2.1 + t * 0.62;
    dens += uEntra * pow(max(0.0, sin(fase * TAU)), 28.0) * caida;
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
      dens += uReplica * sector * pow(max(0.0, sin(fase * TAU)), 26.0) * caida * 1.1;
    }
  }

  if (uSale > 0.001) {
    /* Al hablar, lo que sale no es un chorro continuo: son paquetes. La
       amplitud la marca uPulsoFase, que el renderer sincroniza con el audio
       real cuando lo hay. */
    float golpe = mix(1.0, pow(max(0.0, sin(uPulsoFase)), 2.4), uPulso);
    float fase = rho * 2.1 - t * 0.78;
    dens += uSale * golpe * pow(max(0.0, sin(fase * TAU)), 24.0) * caida;
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
  /* La celda mide unas quince centésimas de unidad. Con celdas grandes
     esto se ve como luces desenfocadas; con celdas pequeñas se lee como una
     estructura de datos, que es lo que tiene que parecer. */
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

  float dens = nodo * (0.4 + brote * 2.6) + (ax + ay + az) * vivo * 0.34;

  // Se apaga con la distancia al eje por el que vamos entrando.
  /* Se apaga deprisa al alejarse del eje por el que se entra. Sin esto la
     retícula llega a los bordes del encuadre y deja de leerse como el
     interior de algo: parece una rejilla de fondo. */
  return dens * exp(-dot(p.xy, p.xy) * 1.05);
}

float campo(vec3 p, float t) {
  float base = filamentos(p, t) * (0.35 + uAgita * 0.9);

  /* La retícula del logo y el interior se evalúan sólo cuando existen.
     Estaban los dos en la mezcla siempre, y eso es pagar un hash y media
     docena de exponenciales por cada paso del volumen durante toda la
     película para multiplicarlo por cero. */
  if (uFormacion > 0.002) {
    base = mix(base, reticulaLogo(p) * 1.5, clamp(uFormacion, 0.0, 1.0));
  }

  float dens = base + anillos(p, t) * 0.95;

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

  return dens * (0.25 + uEnergia * 1.6);
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

float marchar(vec3 ro, vec3 rd, float lejos) {
  float t = 0.02;
  for (int i = 0; i < PASOS; i++) {
    vec3 p = ro + rd * t;
    float d = mapa(p);
    if (d < 0.0007 * t) return t;
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
/* Relieve microscópico. No entra en la marcha —costaría dos octavas de ruido
   por paso— sino sólo en la normal del impacto. El efecto visual es el
   mismo: aparece con luz rasante y desaparece de frente. */
vec3 microNormal(vec3 p, vec3 n) {
  const float e = 0.006;
  float b = ruido3(p * 27.0);
  vec3 g = vec3(
    ruido3(p * 27.0 + vec3(e, 0.0, 0.0)) - b,
    ruido3(p * 27.0 + vec3(0.0, e, 0.0)) - b,
    ruido3(p * 27.0 + vec3(0.0, 0.0, e)) - b) / e;
  g -= n * dot(n, g);
  return normalize(n - g * 0.0055);
}
#endif

/* ── Iluminación ─────────────────────────────────────────────────────── */
vec3 sombrear(vec3 p, vec3 n, vec3 rd) {
  /* Tres luces y ninguna es ambiente.

     La clave barre: durante la revelación, girar uBarrido es lo que descubre
     primero una línea, luego una superficie y luego la curvatura. El contra
     separa la silueta del fondo —sin él un objeto negro sobre negro no tiene
     borde por detrás— y el relleno impide que la cara opuesta sea un agujero.

     La difusa aporta poquísimo, y es correcto: esto es obsidiana. Lo que da
     volumen en un objeto negro es el especular, igual que en una fotografía
     de cerámica negra. Por eso hay dos lóbulos, uno cerrado para el filo del
     barniz y otro abierto para el satinado. */
  vec3 lClave  = normalize(vec3(cos(uBarrido) * 0.9, 0.78, sin(uBarrido) * 0.9 + 0.4));
  vec3 lContra = normalize(vec3(-cos(uBarrido) * 0.8, 0.2, -0.85));
  vec3 lRelleno = normalize(vec3(-0.8, -0.35, 0.5));

  float ndl = max(0.0, dot(n, lClave));
  float sombra = sombraSuave(p + n * 0.008, lClave);
  float fres = pow(1.0 - max(0.0, dot(n, -rd)), 3.1);

  vec3 col = C_MATERIA * (0.10 + ndl * 0.55 * sombra);
  col += C_MATERIA * max(0.0, dot(n, lRelleno)) * 0.18;

  vec3 h1 = normalize(lClave - rd);
  float nh1 = max(0.0, dot(n, h1));
  col += C_LUZ * (pow(nh1, 240.0) * 2.6 + pow(nh1, 70.0) * 0.045) * sombra * uRevelado;

  vec3 h2 = normalize(lContra - rd);
  col += C_LUZ * pow(max(0.0, dot(n, h2)), 60.0) * 0.35 * uRevelado;

  /* Borde. Es la línea que dibuja la silueta: lo primero que aparece al salir
     de la oscuridad y lo último que queda al volver a ella. */
  col += C_LUZ * fres * (0.06 + 0.20 * uRevelado);

  /* Un cielo mínimo. Sin él la cara de arriba y la de abajo son idénticas
     cuando la clave está de lado, y el objeto se aplana. */
  col += C_LUZ * (0.5 + 0.5 * n.y) * 0.008;

  /* La apertura ilumina hacia dentro.

     Esta es la firma del objeto y no es un adorno: la energía vive en el
     vacío central, así que las caras que miran al vacío están encendidas y
     las que miran afuera siguen siendo negras. De ahí sale el anillo verde
     por el interior que se reconoce a dos segundos, y de ahí sale que la luz
     esté ATRAPADA en una estructura y no puesta como una bola en el medio. */
  vec3 tono = mix(C_ENERGIA, C_ALTA, clamp(uEnergia * 0.75 - 0.3 + uRuido, 0.0, 1.0));
  float haciaDentro = max(0.0, dot(n, normalize(-p - vec3(0.0, 0.0, 1e-4))));
  float cerca = exp(-max(0.0, length(p) - VACIO) * 2.0);
  col += tono * haciaDentro * cerca * (0.18 + uEnergia * 1.4) * 1.1;

  /* Luz que atraviesa la membrana donde es fina: los filamentos de dentro se
     transparentan. Es lo que separa el cristal ahumado del plástico negro. */
  col += tono * campo(p - n * 0.09, uTiempo) * 0.35 * (0.35 + fres);

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
  float t = marchar(ro, rd, lejos);

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
  vec2 caja = esfera(ro, rd, uDentro > 0.5 ? 2.8 : 2.2);
  vec3 acum = vec3(0.0);
  float t0 = max(0.03, caja.x);
  float t1 = min(hasta, caja.y);
  float dt = (t1 - t0) / float(PASOS_VOL);
  if (caja.y > 0.0 && dt > 0.0) {
    /* Ruido de arranque por píxel: sin él, los pasos del volumen se ven como
       anillos concéntricos, que es el sello de un raymarch mal hecho. */
    float jit = hash31(vec3(gl_FragCoord.xy, uTiempo * 60.0));
    float tv = t0 + dt * jit;
    vec3 tono = mix(C_ENERGIA, C_ALTA, clamp(uEnergia * 0.75 - 0.3, 0.0, 1.0));
    for (int i = 0; i < PASOS_VOL; i++) {
      vec3 p = ro + rd * tv;
      float d = campo(p, uTiempo);
      acum += tono * d * dt * 1.15;
      tv += dt;
    }
  }

  if (t > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = normal(p);
#ifdef MICRO
    n = microNormal(p, n);
#endif
    col = sombrear(p, n, rd);
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
