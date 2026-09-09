# Hasta dónde aguanta Nesped

Medido el 9 de septiembre de 2026 contra la base de datos de producción,
cargando datos sintéticos y borrándolos después.

Esto existe porque la hoja de ruta de la auditoría decía "particionar",
"réplicas de lectura" y "repartir por fragmentos" para cuando haya entre
50.000 y 200.000 empresas. Eso no es un plan: es una lista de deseos con un
número al lado que nadie sabe medir. Un plan así se cumple tarde o pronto, y
las dos son caras.

## Lo que había cuando se midió

5 empresas, 29 llamadas, 2 contactos. 13 MB de base de datos.

## Lo que se cargó

20.000 contactos y 20.000 llamadas con transcripción en una empresa, más 500
empresas con 25.000 llamadas repartidas entre ellas. En total 506 empresas y
45.000 llamadas, 46 MB.

## Los números

Cada uno es la media de cinco o seis ejecuciones seguidas, descartando la
primera cuando pagaba la planificación.

| Qué | Con 5 empresas | Con 506 empresas y 45.000 llamadas |
|---|---|---|
| Portal de una empresa pequeña (`resumen_portal`) | — | **0,79 ms** |
| Portal de una empresa con 40.000 filas | — | 28,5 ms |
| Panel de administración, primera página | — | 13,0 ms |
| Panel de administración, páginas siguientes | — | 3,0 ms |
| Cifras globales (`resumen_global`) | — | 13,9 ms |
| Consumo del mes | — | 1,8 ms |
| Informe por correo sobre 20.000 contactos | — | 13,0 ms |

**El número que importa es el primero.** El portal de una empresa pequeña
tarda lo mismo con 29 llamadas en la tabla que con 45.000: 0,6–1,3 ms. Crecer
la plataforma no ralentiza a nadie, porque cada consulta entra por el índice
`(client_id, created_at)` y sólo toca sus propias filas.

Lo contrario —una empresa que ocupa el 99% de la tabla— tarda 28 ms, y está
bien que así sea: ahí Postgres recorre la tabla porque la tabla ES esa
empresa. Ese caso no se da con muchas empresas.

## Lo que la medición encontró y se arregló

El panel de administración recalculaba los totales globales en **cada** página.
De los 13,5 ms que costaba una página, 7,4 eran volver a contar exactamente lo
mismo. Y esa proporción empeora con el tiempo: el coste de una página no cambia
—siempre son cien empresas— pero contar todas las llamadas crece con la
plataforma. A 200.000 empresas, paginar el panel entero habría contado la tabla
de llamadas dos mil veces seguidas.

Ahora los totales van sólo en la primera respuesta. Página siguiente: 13,5 ms
→ 3,0 ms.

## Dónde está la primera pared

No es ninguna de las de la hoja de ruta.

`max_connections` es **60**, y hay 14 en uso. Pero de esas 14 sólo **dos** son
de la aplicación: Nesped habla con PostgREST por HTTP y PostgREST mantiene su
propio pool. O sea que la aplicación no puede agotar las conexiones por mucho
tráfico que reciba, porque no abre ninguna. El resto son procesos de Supabase.

Eso es una propiedad buena de la arquitectura y conviene no perderla: el día
que algo abra conexiones directas a Postgres —Prisma las abre— ese límite pasa
a ser el techo real.

## Qué dice el perfil de la base de datos

Los diez primeros consumidores de tiempo de `pg_stat_statements` son **todos**
de infraestructura: recargas del caché de esquema de PostgREST y el registro de
migraciones. No aparece ni una sola consulta de la aplicación.

No hay nada que optimizar. La base de datos está aburrida.

## Un aviso sobre el propio medidor

`/api/ops/salud` señala índices que nadie usa. La primera vez que se ejecutó
señaló dos, y uno era `idx_calls_call_sid`: el que usa el servidor de voz para
encontrar una llamada por su identificador. Sale con cero usos por el motivo
más simple del mundo —no hay número de teléfono contratado y no ha entrado
ninguna llamada—, no porque sobre.

Un índice con cero usos no es un índice inútil. Puede ser una función del
producto que todavía no se usa, o unas estadísticas recién reiniciadas. Así que
el medidor mira desde cuándo lleva contando y, con menos de una semana, enseña
el dato sin aconsejar nada. Hoy lleva 2,9 días.

## Cuándo tocar cada palanca

Está medido en vivo por `/api/ops/salud`, que trae cada aviso con la palanca
que le corresponde. Hoy contesta `hay_que_hacer_algo: false`.

**Particionar por fecha** — cuando una tabla pase de cincuenta millones de
filas. Antes de eso no ahorra nada y además cuesta: `alerts.related_call_id`
referencia `calls(id)`, y particionar `calls` por fecha obliga a que la clave
primaria sea `(id, created_at)`, lo que rompe esa clave ajena. Se cambiaría
integridad referencial de verdad por un beneficio que no llega en años.

**Réplica de lectura** — cuando el acierto de caché baje del 95% y subir la RAM
no lo arregle. Hoy está en 99,87%. Una réplica no arregla que los índices no
quepan en memoria: los duplica. Primero más RAM, que además es un botón.

**Repartir por fragmentos** — nada lo bloquea, y por eso no hay prisa. Pero
"nada lo bloquea" se ha dejado de suponer y se ha comprobado.

Repartir por fragmentos no es una capa de enrutado: es poder coger una empresa
y ponerla en otro sitio. Si eso se puede hacer limpiamente, repartir es hacerlo
muchas veces. Si no, ninguna capa de enrutado lo arregla.

Así que se ha hecho una vez, con `demo`: 129 filas en 11 tablas, más sus
grabaciones del depósito. Sale entera, cuadra con el inventario y ninguna fila
sacada era de otra empresa. Está en `/api/admin/empresa/exportar`, y hace falta
hoy por motivos que no tienen que ver con crecer: el RGPD da derecho a la
portabilidad de los datos, y cuando un cliente se va hay que poder
entregárselos.

La condición que hace posible mover una empresa es que ninguna de sus filas
apunte a filas de otra. Eso lo comprueba `referencias_que_cruzan_empresas()`,
derivada de las claves ajenas del catálogo, y sale en `/api/ops/salud`. Hoy:
cero cruces sobre 7 enlaces reales. Siete enlaces es poquísimo, así que la
comprobación vale sobre todo por lo que comprobará cuando haya datos —y se ha
verificado que detecta un cruce plantando uno a propósito.

Lo que falta antes de repartir de verdad, el día que haga falta: las quince
rutas de `CRUZAN_EMPRESAS` (administración, trabajos programados, webhooks)
tendrían que consultar varios fragmentos en vez de uno. No es difícil, pero es
trabajo, y no se hace hasta que sirva para algo.

**Varias regiones** — cuando haya clientes fuera de Europa. No los hay. La base
está en `eu-west-1`, que es donde tiene que estar mientras los clientes sean
españoles: los datos de sus clientes finales son datos personales europeos, y
tenerlos en Europa evita una conversación entera sobre transferencias
internacionales.

Si algún día hay clientes fuera, lo que manda no es la base de datos sino la
latencia del teléfono: una llamada de voz atraviesa Telnyx, el servidor de voz
y OpenAI en tiempo real, y ahí doscientos milisegundos se notan. La base de
datos sería el último problema, no el primero.
