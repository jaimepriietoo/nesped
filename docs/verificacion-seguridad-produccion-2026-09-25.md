# Verificación de seguridad en producción — 25 de septiembre de 2026

Estado: revisión en curso, guardada antes de realizar cambios. Este documento
no contiene valores de secretos ni datos personales.

## Alcance

- Supabase/Postgres: salud, migraciones, RLS, privilegios, cifrado y auditoría.
- Vercel: despliegue activo, KMS/OIDC, errores y cabeceras públicas.
- Repositorio: protección de archivos de entorno y estado de la rama.
- Pendiente: comprobar en panel las copias restaurables y PITR, e inventariar
  los nombres y ámbitos de todas las variables de Vercel.

No se leyó ni modificó ningún `.env*`, no se tocó el número de Fibergreen y
no se hizo commit ni despliegue.

## Confirmado en producción

### Supabase y aislamiento

- Proyecto activo y sano, Postgres 17, región `eu-west-1`.
- Organización en plan Pro.
- Las migraciones de TOTP, passkeys, sesiones, RLS por empresa, auditoría
  encadenada, columnas cifradas y hashes por empresa constan como aplicadas.
- Todas las tablas visibles tienen RLS habilitada.
- No existen permisos de tabla para `anon`, `authenticated` o `PUBLIC` en el
  esquema `public`.
- El rol `nesped_app` existe con `NOLOGIN`, sin privilegios administrativos y
  sin `BYPASSRLS`.
- El `pre-request` de PostgREST llama a `private.fijar_contexto_nesped`.
- `pg_stat_statements` registró 2.345 consultas del rol `nesped_app`, por lo
  que el portal sí está usando en producción el cliente acotado por RLS.
- Todas las tablas de empresa comprobadas tienen `FORCE ROW LEVEL SECURITY` y
  política para `nesped_app`, salvo `auth_webauthn_credentials`. Esa tabla no
  concede ningún permiso a `nesped_app`, `anon` ni `authenticated`, y sólo
  tiene una política pública que siempre devuelve falso: no supone exposición,
  pero debe documentarse como excepción o recibir una política específica si
  el portal acotado llega a usarla.
- El asesor de seguridad sólo informó de dos tablas internas con RLS pero sin
  políticas: `auditoria_ancla` y `security_rate_limits`. Ningún rol público ni
  `nesped_app` tiene permisos sobre ellas; es un cierre intencionado.
- No se encontraron funciones `SECURITY DEFINER` ejecutables por roles
  públicos en los esquemas revisados.

### Cifrado y KMS

- El despliegue activo abre nueve secretos en sobre mediante AWS KMS.
- La identidad utilizada es OIDC de Vercel; no son claves AWS estáticas.
- Una versión anterior del 24 de septiembre produjo doce fallos de arranque
  por un ARN de KMS inválido. El despliegue actual corrigió el problema y
  registra aperturas correctas.
- Los seis contactos existentes tienen teléfono cifrado, hash global y hash
  separado por empresa. No queda trabajo pendiente en teléfonos o correos de
  contactos.
- En llamadas hay dos transcripciones antiguas con texto claro pero sin su
  sobre cifrado, y veintinueve números de origen con valor claro pero sin
  sobre. Todas las filas tienen empresa, por lo que no es una imposibilidad de
  derivar la clave.
- La cola muestra 174 mantenimientos terminados y uno completado la noche del
  25 de septiembre. Por tanto, el trabajo pendiente de llamadas no se explica
  simplemente porque el mantenimiento no se ejecute: hay que reproducir y
  corregir el relleno o su observabilidad.
- Aún existen columnas claras junto a las cifradas. Producción no está en la
  fase final `solo`, o todavía no se ha ejecutado el vaciado final. No debe
  vaciarse nada hasta resolver las filas pendientes, probar lectura cifrada y
  disponer de una copia restaurable verificada.

### Auditoría

- La tabla de auditoría contiene 194 registros, todos con hash.
- La comprobación completa `verificar_cadena_auditoria(0)` no devolvió ninguna
  rotura.
- Falta confirmar que los checkpoints firmados se conservan realmente en un
  destino externo e inmutable; no basta con que se escriban en logs de Vercel
  con retención limitada.

### Superficie pública

El smoke test contra `https://www.nesped.com`, ejecutado desde un directorio
sin `.env.local`, terminó sin incidencias:

- HSTS y cabeceras contra clickjacking, MIME sniffing y aislamiento de origen.
- CSP presente; las páginas privadas usan nonce y no permiten scripts inline.
- `/portal`, `/admin` y APIs sensibles rechazan accesos sin sesión.
- Los intentos de redirección abierta no salen del dominio.
- Páginas legales y `security.txt` publicados.

### Repositorio y secretos locales

- `.env`, `.env.local` y el respaldo local de `.env.local` están cubiertos por
  la regla `.env*` de `.gitignore`.
- Ningún archivo `.env*` está versionado.
- La carpeta `.claude/` sigue sin seguimiento y no se tocó.
- El CLI local de Vercel conserva un token inválido, así que no pudo listar las
  variables por nombre. No se intentó iniciar sesión ni reemplazar el token.

## Riesgos y trabajo siguiente, por prioridad

### Alto — cerrar antes de avanzar la fase de cifrado

1. Añadir una comprobación automática que falle si existe una fila cifrable
   con empresa y valor claro pero sin sobre durante más de un margen corto.
2. Reproducir por qué el mantenimiento deja dos transcripciones y veintinueve
   números sin cifrar aunque termine como `hecho`.
3. Corregir el relleno y añadir una prueba por el hallazgo.
4. Confirmar dos días seguidos que el contador pendiente es cero.
5. Sólo entonces valorar `cifrado`, `solo` y el vaciado del claro, con rollback
   y copia restaurable disponibles.

### Alto — recuperación

1. Verificar en Supabase el inventario real de copias, fecha de la última copia
   correcta, retención y si PITR está activado.
2. Ejecutar el primer simulacro en un proyecto o rama aislada.
3. Medir RPO y RTO y completar la tabla pendiente de
   `docs/copias-y-recuperacion.md`.
4. Confirmar que el volcado externo está cifrado, fuera de Supabase/Vercel y
   sujeto a una política de retención.

### Medio — configuración y vigilancia

1. Inventariar únicamente nombres, ámbitos y antigüedad de variables en
   Vercel, sin extraer valores.
2. Confirmar que Preview no tiene acceso innecesario a datos de producción.
3. Verificar que no quedan credenciales AWS estáticas tras adoptar OIDC.
4. Dar a los checkpoints de auditoría un destino inmutable con mayor retención.
5. Convertir esta revisión en una comprobación periódica con alertas sólo ante
   cambios relevantes.

## Siguiente cambio local propuesto

Preparar, en esta rama y sin desplegar:

- detector agregado de backlog de cifrado para el endpoint de salud;
- registro claro de `quedaTrabajo` cuando haya errores, aunque el lote sea
  menor de 200;
- pruebas unitarias que reproduzcan filas antiguas pendientes;
- actualización del runbook con los hechos ya verificados y los pasos exactos
  para comprobar backups/PITR.

Antes de cualquier commit se ejecutarán, en este orden:

1. `npx eslint app components lib tests scripts`
2. `npm run test:unidad`
3. `npm run build`
4. `npx playwright test`
