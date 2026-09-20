# Cifrado de datos personales en la base (diseño, punto 1.2)

Estado: **diseño, sin código.** Escrito el 20-09-2026 después de cerrar el
aislamiento por empresa (RLS real) y la auditoría encadenada. Es el cambio
más invasivo del plan de seguridad y merece su propia ventana.

## Qué se protege y de qué

Hoy `leads.telefono`, `leads.email`, `leads.nombre`, `calls.transcript`,
`calls.summary`, `lead_notes.body`, `lead_memory.*` y `lead_comments.body`
están en claro. Quien tenga un volcado de la base —copia robada, cuenta de
Supabase comprometida, panel abierto— lo tiene todo.

Objetivo: que un volcado sin la clave sea inútil, que cada empresa tenga su
propia clave (borrar la empresa = borrar la clave) y que la app siga
buscando por teléfono y correo sin descifrar la tabla entera.

No protege de: alguien con acceso al servidor en ejecución (Vercel con las
variables), que tiene la clave maestra. Para eso está el KMS (fuera del
código).

## Diseño

**Claves.** Una maestra `NESPED_DATA_ENCRYPTION_KEY` (32 bytes, en Vercel;
después en KMS). Por empresa, `HKDF-SHA256(maestra, info = "nesped:datos:" +
client_id)`. Nada se guarda en la base: la clave de empresa se deriva en cada
petición. Rotar la maestra = recifrar todo por lotes (abajo).

**Formato.** El mismo sobre que ya usa `lib/server/totp.js`:
`v1.<iv>.<tag>.<cifrado>` con AES-256-GCM, y el `client_id` como AAD para que
un valor cifrado de una empresa no se pueda pegar en otra.

**Columnas.** Por cada columna sensible, una gemela `<columna>_cifrado text`
y, para las que se buscan, `<columna>_hash text` = HMAC-SHA256(clave de
empresa, valor normalizado). El teléfono se normaliza con `normalizePhone`
antes de hashear; el correo, en minúsculas y sin espacios.

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
