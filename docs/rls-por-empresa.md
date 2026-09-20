# RLS real por empresa

## Qué cambia

Las peticiones del portal dejan de consultar PostgREST como `service_role` y
usan un JWT de cinco minutos cuyo rol es `nesped_app` y cuya única empresa está
en `client_id`. El hook `private.fijar_contexto_nesped()` copia esa empresa a
`app.client_id` al comienzo de cada transacción. Las políticas de cada tabla
comparan su `client_id` —o `clients.id`— con ese valor.

Se mantiene `datosDeLaEmpresa()` como primera defensa. RLS es la segunda: una
consulta sin `.eq("client_id", ...)` sigue viendo únicamente su empresa.
Login, administración, webhooks y cron conservan `service_role` porque aún no
conocen una empresa o trabajan sobre varias; las excepciones internas deben
pedir `getSupabaseAdministrativo()` por su nombre.

## Variable y clave exactas

`nesped_app` es `NOLOGIN`, por tanto **no tiene contraseña ni cadena de
conexión**. Crear una URL para ese rol contradiría el diseño.

En Vercel hacen falta estas variables sólo del servidor:

- `NESPED_RLS_PORTAL=preparar` durante la primera publicación.
- `SUPABASE_JWT_SECRET`: copiar el **Legacy JWT secret** desde Supabase →
  Project Settings → API → JWT Settings. No es la service role key y nunca
  debe llevar prefijo `NEXT_PUBLIC_`.
- `SUPABASE_PUBLISHABLE_KEY`: crear/copiar una publishable key
  (`sb_publishable_...`) en Supabase → Project Settings → API Keys. Mientras
  se migra también se acepta `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pero la
  publishable es la recomendada por Supabase.
- `NESPED_RLS_PORTAL=obligatorio` sólo después de aplicar y probar las
  migraciones. En este modo, si falta una clave, el portal falla cerrado.

La clave JWT compartida permite firmar cualquier rol y es sensible como
`service_role`; se guarda únicamente en Vercel. La fase posterior de KMS debe
migrar a una clave asimétrica importada en Supabase para que la rotación no
dependa del secreto legado.

## Orden de despliegue

1. Publicar el código con `NESPED_RLS_PORTAL=preparar`. No cambia el tráfico.
2. Aplicar `20260920183000_preparar_rls_por_empresa.sql` en un proyecto de
   prueba. Crea el rol, grants mínimos, hook y políticas permisivas.
3. Poner las dos claves anteriores y cambiar el entorno de prueba a
   `NESPED_RLS_PORTAL=obligatorio`.
4. Ejecutar unidad, abrir todas las pantallas del portal y hacer la prueba
   cruzada de abajo.
5. Aplicar `20260920183100_forzar_rls_por_empresa.sql`.
6. Repetir pruebas y activar `obligatorio` en producción.
7. Después de aplicar en Supabase, ejecutar `npm run volcar:migraciones` para
   conservar el DDL aplicado en `supabase/migrations/historico/`.

No aplicar ambas migraciones a ciegas con un `db push`: la pausa entre los
pasos 2 y 5 es la comprobación solicitada.

## Prueba manual cruzada

1. Crear dos empresas de prueba, A y B, con un contacto distinto en cada una.
2. Entrar como A y abrir Contactos, Llamadas, Bandeja y Auditoría: no debe
   aparecer ninguna fila de B.
3. Con un JWT de A y sin filtro explícito, pedir a PostgREST
   `/rest/v1/leads?select=id,client_id`. Sólo devuelve filas de A.
4. Intentar insertar una fila con `client_id` de B usando el JWT de A. Debe
   responder `42501` por la política `WITH CHECK`.
5. Confirmar en los logs de Postgres la línea
   `nesped_rls_context role=nesped_app client_id_set=true`; no incluye el id.

## Rollback

El rollback de aplicación no borra nada:

1. Cambiar `NESPED_RLS_PORTAL=desactivado` y redesplegar/promover el despliegue
   anterior. El portal vuelve temporalmente a `service_role` con el
   envoltorio por empresa.
2. Dejar rol y políticas creados: no afectan a `service_role` y eliminarlos
   haría el rollback más arriesgado.
3. Si el hook afectase a PostgREST, ejecutar sólo durante el incidente:

   ```sql
   alter role authenticator reset pgrst.db_pre_request;
   notify pgrst, 'reload config';
   ```

   Antes de hacerlo, comprobar que no se había configurado otro pre-request
   fuera del repositorio; el `RESET` también lo quitaría.

Cuando se corrija la causa, reaplicar la primera migración (es idempotente),
probar y volver a `obligatorio`. No se revierte ni se elimina ninguna columna.
