# El Núcleo Vivo

Nesped tiene cuerpo. Se llama internamente **Apertura Neural**, y es lo mismo
en la portada, en el banco de pruebas y en el portal: la misma geometría, el
mismo material y los mismos once estados. Lo que cambia entre sitios es dónde
está la cámara y cuánto ocupa.

Este documento cuenta las decisiones que no se leen en el código y dónde se
tocan las cosas.

## Qué es y qué no es

No es una esfera, ni un blob, ni un orbe. Son **tres membranas asimétricas
alrededor de un vacío central**, y el vacío importa tanto como las membranas:
es por donde entra la energía, por donde sale y por donde la cámara atraviesa
el objeto en la portada.

Sus proporciones salen del logotipo. Las columnas del logo miden `[6,4,2,3,5,6]`
puntos; leídas por parejas dan el arco y el grosor de cada membrana. De ahí
viene que la silueta tenga el mismo ritmo irregular que la marca sin que el
logo esté dibujado en ninguna parte. Los tres arcos suman 5,6 de los 6,28
radianes de una vuelta: sobra hueco, y el hueco es lo que se ve.

Hay una segunda relación, y es la que se descubre: **cuando a Nesped no le
queda energía, lo poco que hay se ordena en seis columnas de puntos dentro del
vacío** —las alturas del logotipo—. Sube la energía y la formación se deshace.
Es el único momento en que la marca aparece dentro del objeto, y aparece porque
no hay nada que la deshaga.

## Los once estados y su gramática

`components/nucleo/tokens.js` es la única fuente de verdad. Cada estado es una
combinación de siete magnitudes, y la gramática es la que se lee sin texto:

| lo que se ve                    | lo que significa    |
| ------------------------------- | ------------------- |
| energía hacia dentro            | Nesped recibe       |
| energía moviéndose dentro       | comprende o piensa  |
| energía dirigida hacia fuera    | ejecuta             |
| pulsos rítmicos hacia fuera     | habla               |
| respiración                     | está disponible     |
| inestabilidad temporal          | atención o error    |

Cambiar `MUELLES` o los presets de `ESTADOS` cambia el carácter de Nesped en
todo el producto a la vez. Es a propósito: si "escuchar" se animara distinto en
la portada y en el panel, dejaría de ser un lenguaje.

Los estados no se disparan porque queden bien. Se disparan porque está pasando
algo: la muestra de llamada de la portada pone a Nesped a escuchar cuando habla
el cliente y a hablar cuando habla el agente; la llamada de prueba lo pone a
ejecutar y luego a éxito o a error según responda la API; el portal le pasa si
está cargando, si hay avisos abiertos o si algo ha fallado.

## Cómo está montado

```
tokens.js        geometría, color, muelles, los once estados, calidad
estado.js        máquina de estados: integra muelles, fuera de React
silueta.js       la misma geometría resuelta en 2D
respaldo.js      Nesped en SVG, sin WebGL y con movimiento reducido
nucleo.js        <NucleoVivo>: monta el lienzo y decide QUÉ hace Nesped
marca.js         <NucleoMarca>: la versión de icono, para el producto
director.js      la película: claves de cámara y avance por scroll
gl/gl.js         lo mínimo de WebGL2
gl/sombras.js    los shaders
gl/render.js     el bucle de render y la calidad adaptativa
```

Separación estricta, y no es teórica:

- **estado del producto** → React
- **estado de escena** → `NucleoEstado`, muelles, fuera de React
- **bucle de render** → un solo `requestAnimationFrame`

Las magnitudes cambian sesenta veces por segundo. Meterlas en `useState` sería
repintar el árbol sesenta veces por segundo para no cambiar ni un nodo del DOM.

No se instala three.js. Aquí no hay malla: hay un cuadrado a pantalla completa
y una función de distancia que se marcha desde la cámara. Eso da tres cosas que
una malla no da gratis y que aquí son el producto: la luz revela el volumen en
vez de iluminar un contorno, la cámara puede atravesar el vacío central sin
trucos de plano, y la energía de dentro es un campo de verdad.

## La película de la portada

El scroll no dispara animaciones: **es** la línea de tiempo. Cada posición de la
página corresponde a un fotograma concreto, y avanzar o retroceder recorre la
misma película en los dos sentidos.

No se secuestra el scroll. Lo que se amortigua es la cámara, que sigue a la
rueda con inercia porque pesa.

Las claves de cámara están en `director.js` y los tramos de texto en
`actos.js`. **Los dos ficheros tienen que cuadrar**: cada acto ocurre mientras
la cámara está donde toca. Y los actos dejan tres centésimas de hueco entre sí,
porque `avanceActo` abre y cierra cada cartel con un margen a cada lado; con
huecos más estrechos que ese margen, dos actos se encienden a la vez.

Los primeros dos segundos y pico los dirige el reloj, no el scroll: la escena de
apertura consiste en que Nesped salga de la oscuridad, y eso no puede depender
de que alguien mueva la rueda. Terminada la obertura la revelación no se
deshace; lo que se recorre en los dos sentidos es la película.

Móvil no es escritorio encogido. En vertical no hay sitio para apartar el objeto
a un lado y dejar el texto en el otro, así que el desplazamiento del encuadre
pasa a ser vertical —Nesped arriba, el texto debajo—, la cámara se retira y todos
los actos se alinean abajo a la izquierda.

## De dónde sale la nitidez

Un raymarch hecho de cualquier manera se reconoce a un metro: bordes en
escalones, superficies planas y una niebla en vez de estructura. Las cuatro
cosas que lo evitan, por orden de lo que se nota:

**La silueta tiene filo.** La marcha guarda a cuántos píxeles ha pasado el rayo
de la superficie en su punto de máxima aproximación, y con eso pinta el borde
con cobertura parcial en vez de dentro-o-fuera. Sin esto no hay material ni luz
que disimule los escalones. El umbral de impacto también es relativo al tamaño
de un píxel a esa distancia, no un número fijo: con un umbral fijo el borde
cambia de grosor según lo lejos que esté el objeto.

**Los hilos de luz no se muestrean.** Un hilo de dos centésimas de radio
integrado a pasos de cuatro es un hilo que aparece y desaparece entre
fotogramas, y sumado sobre un volumen da exactamente la mancha verde que tenía
la primera versión. Se calcula la distancia mínima del rayo a cada arco —que es
exacta— y se afina con cuatro iteraciones de sección áurea. El resultado no
depende del número de pasos, así que sale igual de nítido en calidad baja.

Lo mismo con los puntos del logo: la distancia mínima de un rayo a un punto se
resuelve de una vez, sin muestrear.

Y la primera versión de los hilos eran hélices alrededor del eje del vacío, que
fue un error de concepto: una hélice vista POR SU EJE se proyecta como una
circunferencia, y el eje del vacío es justo desde donde se mira el objeto. Seis
hélices daban un disco. Son arcos finitos en planos inclinados, que desde
cualquier ángulo se ven cruzarse a distintas profundidades.

**El material tiene dirección.** El especular no es una potencia del coseno
—eso reparte el brillo igual en todas direcciones y da una mancha redonda, que
se lee como plástico— sino tres lóbulos anisótropos estirados a lo largo del
barrido de la hoja. Encima va un relieve microscópico con más ruido que veta:
al revés salía pana.

**La definición está en la forma, no pintada encima.** Cada membrana lleva dos
canales recorriéndola a lo largo, tallados en la propia función de distancia.
Un canal produce dos aristas donde la luz se parte, y esas aristas son lo que
hace que la pieza se lea como algo construido.

## Rendimiento

Una web preciosa a 17 fps es una mala web.

Tres niveles en `CALIDAD`, y se baja solo: el vigilante mide cuánto tarda el
pintado —no los fps, que mezclan el coste de la escena con el del resto de la
página— y baja de nivel si la mediana se pasa del objetivo. Sólo baja: subir en
caliente haría que el objeto cambiara de nitidez cada dos segundos.

Y antes que todo eso: **si lo dibuja la CPU, no se dibuja**. Una máquina
virtual, un portátil con la aceleración desactivada o un navegador en modo de
compatibilidad tienen WebGL, pero lo ejecuta el procesador. Ahí una marcha de
rayos no va "más lenta": deja la página agarrotada, con el scroll a tirones y
los botones sin responder. Se detecta por el nombre del renderizador y se pasa
directamente a la silueta en SVG, que es el mismo objeto y va instantánea.

Lo que más ahorra, por orden:

1. **Los pasos del volumen.** En calidad alta son cincuenta y seis, no los
   ciento y pico que harían falta si los hilos se integraran: como salen por
   distancia mínima, lo único que queda a pasos es la vaina, los anillos y el
   trasfondo, que son todos suaves.
2. **La sombra proyectada.** Es el gasto extra más caro porque se paga por cada
   píxel que toca el objeto. En calidad baja va a cero, y el volumen lo siguen
   dando el especular y el borde.
3. **No evaluar lo que no existe.** Los puntos del logo, el campo interior y el
   cono de energía dirigida sólo se calculan cuando su magnitud no es cero.
4. **Una sola pasada por los arcos.** El bucle del volumen calcula la distancia
   a cada hilo una vez y la usa para dos cosas: sumar la vaina y quedarse con el
   mínimo.
5. **Pausa fuera de pantalla.** El estado sigue avanzando —al volver no puede
   aparecer congelado— pero no se pinta.

La calidad alta se pinta a resolución completa. Reescalar es lo primero que se
nota cuando lo que falta es nitidez, así que lo que se recorta es todo lo demás
antes que eso.

Y hay una salida de emergencia: un solo fotograma por encima de 125 ms no es un
pico, es un equipo que no puede, y ahí se baja de nivel al momento en vez de
esperar a reunir la muestra completa.

La capa de WebGL entera se carga aparte: la portada pinta su texto sin esperar
a nada de esto, y quien nunca llega a ver el núcleo no lo descarga.

## Sin WebGL y con movimiento reducido

Se pinta el mismo objeto en SVG, con la misma geometría. No es un placeholder:
la accesibilidad no puede ser la excusa para que la alternativa parezca otra
web. Lo que se quita es el viaje de cámara, la deformación y el movimiento
continuo. Lo que se queda es la identidad.

Y lo que Nesped está haciendo se dice también en texto, en una región `status`
para lectores de pantalla. Un estado que sólo existe como movimiento no existe
para quien no ve la pantalla.

## El banco de pruebas

`/dev/living-core` tiene los once estados a un clic y los mandos de cámara y
luz sueltos. Desarrollar la Apertura Neural dentro de la película es imposible:
para ver un estado hay que llegar hasta su punto de scroll.

No sale a producción salvo que se pida a mano con `NESPED_LAB=1`.

Dos ayudas más, las dos sólo en desarrollo:

- `npm run revisar:shaders` comprueba que los shaders siguen siendo un fichero
  válido. Viven dentro de literales de plantilla, así que un acento grave
  escrito en un comentario del shader cierra el literal y rompe el fichero
  entero; el error que sale entonces señala una línea de GLSL que no tiene nada
  malo. Se ejecuta también dentro de `npm run test:unidad`.
- `window.__nucleoIgnorarSoftware = true` antes de cargar la página fuerza la
  marcha aunque la dibuje la CPU. Es la única manera de revisar el objeto desde
  un navegador sin tarjeta, que es con lo que se hacen las capturas
  automatizadas.
