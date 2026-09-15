# Pruebas de carga

Guiones de [k6](https://k6.io) para saber cuánto aguanta Nesped **antes** de
que lo pregunte un cliente. No forman parte de `verificar`: se ejecutan a
mano, contra un entorno de pruebas, con datos sintéticos.

## La regla

**Nunca contra producción.** `comun.js` se niega a arrancar si `BASE_URL`
apunta a `nesped.com`. No hay variable que lo desactive: si hace falta
medir producción, se escribe un guion de sólo lectura para eso.

## Entorno de destino

Un despliegue de vista previa de Vercel apuntando a una base de Supabase
que no sea la real (una rama del proyecto, en el plan Pro, o un proyecto
aparte), con:

- una empresa de prueba (`CLIENT_ID`) con **más de 500 contactos y 300
  llamadas** sintéticos, para que la paginación signifique algo;
- una cuenta de prueba del portal (`PORTAL_EMAIL`, `PORTAL_PASSWORD`);
- `RESEND_API_KEY` **sin definir**, para que el 2FA devuelva `debugCode`;
- los secretos de ese entorno: `ELEVENLABS_WEBHOOK_SECRET`,
  `INTERNAL_API_TOKEN`.

## Guiones

| Guion | Qué mide | Variables |
| --- | --- | --- |
| `login.js` | login + 2FA: hash, límite en la base, reto | `PORTAL_EMAIL`, `PORTAL_PASSWORD` |
| `portal.js` | `/overview` y contactos/llamadas por cursor | `NESPED_COOKIE` |
| `post-call.js` | bandeja de webhooks con firma HMAC | `ELEVENLABS_WEBHOOK_SECRET`, `CLIENT_ID` |
| `cola.js` | `/api/cola/procesar` vaciando lo anterior | `INTERNAL_API_TOKEN` |

```bash
BASE_URL=https://nesped-git-rama.vercel.app PORTAL_EMAIL=… PORTAL_PASSWORD=… k6 run scripts/carga/login.js
```

Todos aceptan `VUS` (usuarios virtuales) y algunos `DURACION` o `PAGINAS`.

## Qué mirar

- **p95** de cada ruta (los umbrales están en cada guion; k6 falla si se
  pasan).
- **`http_req_failed`**: en `login.js` los 429 son correctos (el límite por
  correo son 5 intentos); lo que no puede haber es un 5xx.
- En Supabase, durante la prueba: conexiones activas y tiempo de las RPC
  `consumir_limite_seguridad` y `tomar_trabajos`. Son las dos que escriben en
  cada petición y las primeras en notarse.
- Después de `post-call.js` + `cola.js`: `webhook_events` sin filas en
  `fallido`, y `calls` con una fila por conversación (el índice único
  `calls_client_sid_unica` lo garantiza).

## Resultados

| Fecha | Guion | VUS | p95 | Fallos | Notas |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | — | pendiente de la primera ejecución |
