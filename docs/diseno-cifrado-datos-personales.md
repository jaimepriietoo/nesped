# Cifrado de datos personales en la base (diseño, punto 1.2)

Estado: **implementado el 21-09-2026** (`lib/server/cifrado-datos.js`,
migración `20260921010000_columnas_cifradas`). Las fases se activan con la
variable `NESPED_CIFRADO_DATOS`; ver "Cómo se despliega" al final. El
diseño original se conserva abajo.

## Qué se protege y de qué

Hoy `leads.telefono`, `leads.email`, `leads.nombre`, `calls.transcript`,
`calls.summary`, `lead_notes.body`, `lead_memory.*` y `lead_comments.body`
están en claro. Quien tenga un volcado de la base —copia robada, cuenta de
Supabase comprometida, panel abierto— lo tiene todo.

Objetivo: que un volcado sin la clave sea inútil, que cada empresa use material
criptográfico separado y que la app siga
buscando por teléfono y correo sin descifrar la tabla entera.

No protege de: alguien con acceso al servidor en ejecución (Vercel con las
variables), que tiene la clave maestra. Para eso está el KMS (fuera del
código).

## Diseño

**Claves.** Una maestra `NESPED_DATA_ENCRYPTION_KEY` (32 bytes, en Vercel;
después en KMS). Por empresa, `HKDF-SHA256(maestra, info = "nesped:datos:" +
client_id)`. Nada se guarda en la base: la clave de empresa se deriva en cada
petición. Esto separa los cifrados, pero todavía no permite borrado
criptográfico independiente: mientras exista la maestra se puede volver a
derivar cualquier clave. Una DEK aleatoria y destruible por empresa queda
como fase posterior. Rotar la maestra = recifrar todo por lotes (abajo).

**Formato.** El mismo sobre que ya usa `lib/server/totp.js`:
`v1.<iv>.<tag>.<cifrado>` con AES-256-GCM, y el `client_id` como AAD para que
un valor cifrado de una empresa no se pueda pegar en otra.

**Columnas.** Por cada columna sensible, una gemela `<columna>_cifrado text`
y, para las que se buscan, `<columna>_hash_empresa text` =
HMAC-SHA256(clave de búsqueda derivada con `client_id`, valor normalizado).
Durante la transición se mantiene `<columna>_hash`, que era global, para que
el rollback no deje filas sin encontrar. El teléfono se normaliza antes de
hashear; el correo, en minúsculas y sin espacios.

**Lectura y escritura.** Un módulo `lib/server/cifrado-datos.js` con
`cifrar(clientId, valor)`, `descifrar(clientId, sobre)`, `hashBusqueda(...)`,
y un envoltorio de tabla en `datos-cliente.js` que, para las tablas y
columnas del catálogo, cifra al insertar/actualizar y descifra al leer. Las
rutas no cambian: siguen pidiendo `telefono` y reciben `telefono`. Las
consultas `.eq("telefono", x)` se reescriben a `.eq("telefono_hash",
hashBusqueda(x))`. Las `ilike` sobre columnas cifradas dejan de funcionar:
hay que ver dónde se usan (búsqueda libre de contactos) y decidir si se
mantiene una columna en claro sólo con las primeras letras, o se busca por
hash exacto.

**Lo que no pasa por PostgREST.** Los RPC que leen esas columnas
(`resumen_portal`, `exportar_tabla_de_empresa`, `calculate_lead_score`,
`inventario_de_empresa`) tienen que dejar de leerlas o recibir el valor ya
descifrado. Los informes por correo (`weekly_reports`) y los prompts de IA
leen desde Node, así que van por el envoltorio.

## Fases

1. **Añadir sin usar.** Migración con las columnas `_cifrado` y `_hash`
   (nulas). Módulo de cifrado con tests (vector cruzado con Postgres
   `pgcrypto` no hace falta: sólo Node cifra y descifra). Nada cambia.
2. **Escribir doble.** Toda escritura rellena claro y cifrado. Toda lectura
   sigue en claro. Un trabajo de la cola recorre las filas antiguas y
   rellena las cifradas por lotes de 500 (como `archivar_*`).
3. **Leer cifrado con red.** Lectura prefiere `_cifrado` y cae a claro si
   está vacío. Búsquedas por hash. Una semana así, mirando logs.
4. **Vaciar el claro.** Migración que pone a `null` las columnas en claro
   (no las borra: aditiva). RLS y grants no cambian.
5. **Rotación.** `scripts/recifrar-datos.mjs`: con `NESPED_DATA_ENCRYPTION_KEY`
   y `NESPED_DATA_ENCRYPTION_KEY_ANTERIOR`, descifra con la vieja y cifra
   con la nueva por lotes; al acabar, se retira la anterior.

Cada fase es un PR y se puede parar entre dos sin dejar nada a medias:
hasta la fase 4 el claro sigue ahí.

## Lo que hay que decidir antes de empezar

- Qué columnas exactamente (la lista de arriba es la propuesta).
- Qué hacer con la búsqueda libre por nombre en Contactos.
- Si `calls.transcript` se cifra o se mueve a Storage cifrado (son textos
  largos; cifrarlos en columna funciona, pero pesan).
- Ventana: fuera de horario de llamadas, con `pausa_global` puesta durante
  las migraciones de datos.

## Estimación honesta

Dos o tres días de trabajo con pruebas, y una semana de convivencia entre
fases 3 y 4. No es un cambio de una tarde.


## Cómo se despliega (lo que hay hecho)

La variable `NESPED_CIFRADO_DATOS` en Vercel decide la fase. Cambiarla es
redesplegar; no hace falta tocar código ni base.

| Valor | Escribe | Lee | Busca por |
| --- | --- | --- | --- |
| `apagado` (por defecto) | claro | claro | claro |
| `doble` | claro + sobre + hash | claro | claro |
| `cifrado` | claro + sobre + hash | sobre (claro si aún no hay) | hash |
| `solo` | sobre + hash, claro a null | sobre | hash |

Necesita `NESPED_DATA_ENCRYPTION_KEY` (32 bytes, `node -e
"console.log(require('crypto').randomBytes(32).toString('hex'))"`), que
puede y debe ir en sobre KMS.

Pasos:

1. Poner la clave y `NESPED_CIFRADO_DATOS=doble` en **Preview**, redesplegar
   una preview y recorrer el portal. Luego lo mismo en Production. El
   mantenimiento diario rellena los sobres de las filas antiguas por lotes
   (`rellenarCifrado`); se ve en su resultado (`cifrado.cifradas`,
   `cifrado.quedaTrabajo`).
2. Cuando `quedaTrabajo` sea `false` dos días seguidos: `cifrado`. Una
   semana mirando logs (`cifrado.no_se_pudo_descifrar` no debe aparecer).
3. `solo`. A partir de aquí las escrituras dejan el claro a null.
4. `npm run vaciar:claro` (cuenta) y `npm run vaciar:claro -- --de-verdad`
   (vacía). Desde entonces la base no tiene datos personales en claro en
   esas columnas.
5. Rotación: nueva clave en `.env.local`, la vieja en
   `NESPED_DATA_ENCRYPTION_KEY_ANTERIOR`, `npm run recifrar:datos`, y al
   acabar la nueva a Vercel.

Lo que queda en claro a propósito: `leads.nombre` (búsqueda libre de
contactos) y `calls.to_number` (es el número de la empresa, no del
cliente). Las relaciones anidadas en un `select("*, calls(*)")` no se
descifran: las rutas del portal no las usan con columnas cifradas.

## Migración del hash de búsqueda

La migración `20260922122509_hashes_busqueda_por_empresa.sql` añade las
columnas e índices nuevos sin cambiar datos. `NESPED_HASH_BUSQUEDA` controla
la convivencia:

| Valor | Escritura | Consulta | Uso |
| --- | --- | --- | --- |
| `global` | hash antiguo | hash antiguo | rollback temporal |
| `doble` (por defecto) | ambos hashes | cualquiera de los dos | despliegue y relleno |
| `empresa` | sólo hash por empresa | sólo hash por empresa | estado final |

El mantenimiento rellena `*_hash_empresa` descifrando el sobre, siempre con
`client_id`, y en modo `empresa` limpia por lotes el valor del hash global.
No se elimina la columna antigua: volver a `doble` permite reconstruirla si
hace falta un rollback.

Rollback en cualquier fase anterior a la 4: bajar la variable un escalón.
En la 4 ya no hay claro que leer: el rollback es `cifrado`, que lee el
sobre, y funciona igual.
