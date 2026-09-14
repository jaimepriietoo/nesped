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

**Los hilos no se muestrean: se resuelven.** Un hilo de dos centésimas de radio
integrado a pasos de cuatro es un hilo que aparece y desaparece entre
fotogramas, y sumado sobre un volumen da exactamente la mancha verde que tenía
la primera versión.

Lo que se hace es buscar por dónde pasa el rayo más cerca de cada arco. Y la
clave está en qué se barre: **el ángulo sobre el arco, no la distancia sobre el
rayo**. El arco es un tramo acotado, así que con veinticuatro muestras se cubre
entero; el rayo no tiene cota natural y obligaba a mirar los catorce arcos en
cada uno de los setenta y dos pasos del volumen —mil evaluaciones por píxel
para encontrar catorce mínimos—.

Además, visto como función del ángulo, el cuadrado de la distancia de un punto
del arco al rayo es un polinomio trigonométrico de grado dos:

```
d²(θ) = c0 + c1·cosθ + c2·senθ + c3·cos2θ + c4·sen2θ
```

—sale de proyectar el arco sobre el plano perpendicular al rayo, donde es una
elipse—. Los cinco coeficientes se calculan una vez por arco y evaluar el
perfil son diez multiplicaciones. El seno y el coseno del barrido avanzan por
recurrencia, así que las veinticuatro muestras cuestan un seno y un coseno en
total. Después, seis iteraciones de sección áurea dejan el ángulo con un error
diez veces menor que el grosor del hilo.

Ese último afinado no es un lujo. Sin él —ajustando una parábola a las tres
muestras del fondo del valle, que fue el primer intento— los hilos salían con
**muescas perpendiculares, una por muestra**: el ángulo estimado saltaba de una
muestra a su vecina entre un píxel y el de al lado.

Y el resplandor ancho que rodea al hilo tampoco se suma a pasos: se integra. A
lo largo del rayo la distancia al arco crece como una parábola alrededor del
punto más cercano, así que `exp(-90·d²)` es una campana y su integral tiene
fórmula cerrada. Lo abierta que es la campana sale del mismo perfil derivado
dos veces —medirla restando muestras vecinas daba cortes rectos a media luz por
toda la apertura, porque había que recortar la resta y el recorte se veía—.

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

Una web preciosa a 17 fps es una mala web. Y durante un tiempo esta lo fue: con
la calidad alta puesta, la escena costaba **155 ms por fotograma** —seis fps y
medio— en un MacBook con M3 Pro. No se notaba porque el vigilante bajaba la
calidad a la primera y el sitio se veía siempre en el nivel más bajo.

Hoy, la misma máquina y el mismo encuadre:

| momento de la película       | ms/fotograma | fps |
| ---------------------------- | ------------ | --- |
| la oscuridad y el despertar  | 5,1 – 9,1    | 110–195 |
| la apertura llena la pantalla| 18,2         | 55  |
| dentro, atravesando          | 8,9 – 14,4   | 70–113 |
| el resto de la película      | 4,2 – 11,4   | 88–239 |
| núcleo anclado (el producto) | 1,4          | 725 |

A 2288×1440, que es lo que ocupa a pantalla completa en un portátil. El único
momento por debajo de sesenta es el pico de la travesía, y dura cerca de un
segundo de scroll.

### De dónde salieron los trece aumentos

Por orden de lo que dieron:

1. **`arcoDe()` fuera del bucle.** Calcular el plano, el radio y el reparto de
   un arco cuesta diez senos y cosenos, dos productos vectoriales y una
   normalización, y se estaba haciendo **mil ocho veces por píxel**: catorce
   arcos dentro de setenta y dos pasos del volumen, cuando el resultado sólo
   depende del arco y del tiempo. Resolver cada arco una vez, por el perfil en
   forma cerrada, quitó 110 ms de los 144.
2. **La esfera envolvente antes de marchar.** Todo el objeto cabe en una esfera
   de radio 1,35, y cortar un rayo con una esfera es una raíz cuadrada. Sin
   eso, cada rayo del fondo —la mitad larga de la pantalla en un encuadre
   abierto— recorría las nueve unidades del escenario a pasos de la función de
   distancia para acabar sin tocar nada. Seis milisegundos.
   Ojo: no es la comprobación por paso que se probó una vez y salió más lenta.
   Aquella preguntaba lo mismo dentro del bucle; ésta se hace una vez y decide
   si hay bucle.
3. **Descartar arcos por su envolvente.** Un hilo sólo se ve hasta unas cuatro
   décimas: más allá, `exp(-90·d²)` vale una cienmilésima. Como todos los
   puntos de un arco están a la misma distancia de su centro, un producto
   escalar decide si hay que mirarlo. Ocho milisegundos.
4. **La cota de la distancia, exacta.** La sección de la hoja es elíptica: se
   aplasta un eje por 3,6. Al escalar un eje la función deja de devolver una
   distancia, y lo obvio es dividir por el factor de aplastamiento —que
   funciona, pero reparte el castigo por igual—. En el plano del arco, que es
   por donde llega casi cualquier rayo, la función no crece 3,6 veces más
   deprisa: crece igual, y el rayo avanzaba a un sexto de lo que podía.
   Dividiendo por el módulo del gradiente, que vale 1 de frente y 3,6 de canto,
   la cota sigue siendo válida y el rayo avanza lo que le corresponde.
5. **Pasos del volumen que crecen.** Con la cámara dentro del corredor, una
   celda de la retícula a media unidad ocupa en pantalla diez veces lo que la
   misma celda a cuatro. A pasos iguales las dos reciben el mismo número de
   muestras. Creciendo un 6% por paso, la densidad medida EN PANTALLA queda
   casi constante: veintiocho pasos dan mejor imagen que los cincuenta y seis
   de antes, y el interior dejó de leerse como un estallido radial.
6. **El campo, partido en dos.** El campo es afín en la densidad de hilos: lo
   que los hilos aportan se suma y todo lo demás los multiplica. Separarlo en
   `campoBase()` —anillos, retícula, envolvente— y `pesoHilos()` permite
   integrar el trasfondo a pasos, que es suave y lo admite, y resolver los
   hilos aparte y exactos.

### Cómo se mide esto, que tampoco fue gratis

Tres maneras de medir mal, las tres probadas aquí:

- **Cronometrar `pintar()` con un reloj normal.** Las llamadas a WebGL encolan
  trabajo y vuelven enseguida: salían décimas de milisegundo yendo a cuatro
  fotogramas por segundo.
- **Envolver N fotogramas en una consulta de tiempo de la tarjeta.** `pintar()`
  ya abre la suya, y el cronómetro admite una consulta a la vez: anidarlas
  devuelve basura sin dar error visible. Y aun bien puesta, `TIME_ELAPSED`
  mide desde que la GPU procesa el principio hasta que procesa el final, así
  que con la pestaña oculta recoge también el tiempo en que la tarjeta estaba
  haciendo otra cosa: cientos de milisegundos en una escena que va suelta.
- **Mirar el hueco entre fotogramas sin más.** Se cuantiza al refresco: en un
  panel de 120 Hz, todo lo que cueste entre 25 y 33 ms sale como 33,3 y no
  distingue una mejora del 20%.

Lo que sí funciona: un navegador de verdad con la tarjeta de verdad —sin
ventana, macOS pinta con SwiftShader y el número no significa nada—, pintando
K veces dentro del mismo fotograma y dividiendo. El hueco se va muy por encima
del refresco y queda resolución de sobra.

### Una trampa que no se ve venir

Añadir seis iteraciones de sección áurea al pase de hilos multiplicó por ocho
el coste **en un encuadre y no en el otro**: 8 ms con la cámara lejos, 88 ms con
la cámara cerca. No era el trabajo de más —son doce senos por arco—, era que el
estado vivo dentro del bucle pasó de caber en registros a no caber, y el
compilador cambió de estrategia. Se arregló soltando lo que ya no hacía falta
—el eje, el centro y el radio del arco, que sólo se usaban para calcular los
coeficientes— antes de entrar en el afinado.

Si un cambio pequeño en un bucle de shader multiplica el coste, mirar primero
cuántas cosas siguen vivas dentro.

### Lo demás

Tres niveles en `CALIDAD`, y se baja solo: el vigilante mide lo que tarda la
tarjeta —no los fps, que mezclan el coste de la escena con el del resto de la
página— y baja de nivel si la mediana se pasa del objetivo. Sólo baja: subir en
caliente haría que el objeto cambiara de nitidez cada dos segundos.

**Pero no juzga durante la travesía.** Ese plano es el más caro con diferencia
—la cámara dentro del objeto, las tres membranas llenando el encuadre y la
retícula del interior entera— y dura un par de segundos. Dejar que el vigilante
opine ahí significaba que un solo viaje por el agujero bajaba la calidad del
sitio entero y ya no volvía a subir, cuando el resto de la película va sobrada.

Y antes que todo eso: **si lo dibuja la CPU, no se dibuja**. Una máquina
virtual, un portátil con la aceleración desactivada o un navegador en modo de
compatibilidad tienen WebGL, pero lo ejecuta el procesador. Ahí una marcha de
rayos no va "más lenta": deja la página agarrotada, con el scroll a tirones y
los botones sin responder. Se detecta por el nombre del renderizador y se pasa
directamente a la silueta en SVG, que es el mismo objeto y va instantánea.

La calidad alta pinta a 1,6 píxeles de dispositivo por píxel de CSS, no a los 2
de una pantalla retina. Con la cobertura analítica del borde, el filo no viene
de la resolución sino de cómo se calcula, y esas cuatro décimas de más se
gastan mejor en pasos y en hilos: a 2,0 la travesía se iba a 35 fps.

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

## Revisión de movimiento y definición — septiembre de 2026

Las tres membranas articulan su posición con fases diferentes. El renderer
calcula sus rotaciones y respiración una vez por fotograma y las pasa al
shader; no se añaden senos por paso de raymarch. `MOVIMIENTO` reúne amplitud,
profundidad, ritmo, iluminación, halo y reconstrucción del filo.

La señal de `senal.js` transforma una onda en relaciones de contexto y una
salida dirigida. Comparte el avance del director, admite retroceso y no usa
estado React por fotograma. Las trazas continuas se pausan fuera de su acto y
se desactivan con movimiento reducido. La composición móvil reserva la zona
superior para la señal y la inferior para la conversación.

El presupuesto de GPU se mide también dentro del portal. Interior y exterior
recuerdan su calidad por separado, de forma que el plano más costoso no
reduzca permanentemente la definición del resto de la película. Los destinos
WebGL conservan su referencia hasta liberarse al redimensionar.

En desarrollo, el canvas expone `data-frame-ms`, `data-gpu-ms` y
`data-calidad` para inspección. Son medias recientes, no una garantía de FPS
en todos los dispositivos; los cálculos de diagnóstico se eliminan en
producción. Las pruebas de rendimiento unitarias cubren la recuperación de
calidad al salir y la conservación de los recursos hasta su liberación.
