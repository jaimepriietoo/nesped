# Histórico de migraciones

Volcado de las migraciones aplicadas en Supabase, generado por
`npm run volcar:migraciones`. Es lo que permite reconstruir el esquema sin
depender de que la consola del proveedor siga estando ahí.

Los ficheros `../2026*_fase*.sql` son otra cosa: explican **por qué** se hizo
cada cambio. Estos de aquí son el **qué**, tal cual se aplicó.

Última actualización: 2026-09-09
Migraciones publicadas: 30 de 31

## Lo que NO está aquí, y por qué

Este repositorio es público. Se excluyen las migraciones que insertan datos de
personas —nombres, correos, contraseñas hasheadas de clientes reales—, porque
no reconstruyen ningún esquema y no pueden publicarse.

Se listan para que nadie reconstruya la base de datos creyendo que la tiene
entera:

- `20260907145218_alta_cliente_fibergreen.sql` — contiene una dirección de correo (5), algo que parece una clave o un hash (2)

Si hace falta rehacer un entorno con esos datos, salen de una copia de
seguridad de Supabase, no de aquí.
