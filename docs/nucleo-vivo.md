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

## Rendimiento

Una web preciosa a 17 fps es una mala web.

Tres niveles en `CALIDAD`, y se baja solo: el vigilante mide cuánto tarda el
pintado —no los fps, que mezclan el coste de la escena con el del resto de la
página— y baja de nivel si la mediana se pasa del objetivo. Sólo baja: subir en
caliente haría que el objeto cambiara de nitidez cada dos segundos.

Lo que más ahorra, por orden:

1. **La escala de render.** El núcleo se pinta a una fracción del lienzo. El
   objeto es oscuro y suave: a 0,85 no se distingue del 1,0 y se pintan casi la
   mitad de los píxeles.
2. **La sombra proyectada.** Es el gasto extra más caro porque se paga por cada
   píxel que toca el objeto. En calidad baja va a cero, y el volumen lo siguen
   dando el especular y el borde.
3. **No evaluar lo que no existe.** La retícula del logo y el campo interior
   sólo se calculan cuando su magnitud es distinta de cero.
4. **Pausa fuera de pantalla.** El estado sigue avanzando —al volver no puede
   aparecer congelado— pero no se pinta.

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
