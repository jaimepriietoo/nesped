# Nesped

Una voz que contesta el teléfono de un negocio, apunta quién ha llamado y qué
quería, y lo deja en un CRM. **Twilio** pone la línea, **ElevenLabs Agents**
lleva la conversación entera y Nesped guarda contexto, contactos y llamadas.

> **No hay ningún número de voz contratado.** La cuenta de Twilio está activa
> pero con cero líneas, y el agente de ElevenLabs no tiene número asignado, así
> que hoy no entra ni sale ninguna llamada. Los pasos para resolverlo están en
> [`docs/voz-elevenlabs-twilio.md`](docs/voz-elevenlabs-twilio.md).

## Arrancar

```bash
npm install
npm run dev          # http://localhost:3000
```

Hace falta `.env.local`. `npm run verify:env` dice qué falta y por qué hace
falta cada cosa.

## Comprobar antes de tocar nada

```bash
npx eslint app components lib tests scripts
npm run test:unidad     # incluye el guardián de shaders
npm run build
npx playwright test     # levanta su propio servidor
```

Los cuatro tienen que pasar. `test:unidad` ejecuta primero
`scripts/revisar-shaders.mjs`, que comprueba que los shaders siguen siendo un
fichero válido: viven dentro de literales de plantilla y un acento grave
escrito en un comentario del shader rompe el fichero entero señalando una
línea de GLSL que no tiene nada malo.

## Cómo está repartido

```
app/                  rutas. page.js es la película de la portada
  portal/             el área de clientes (~3.000 líneas, once pantallas)
  admin/              la administración de Nesped, no la del cliente
  api/                todo el servidor. Ninguna página vive aquí (hay prueba)
components/nucleo/    la Apertura Neural: el objeto vivo y sus once estados
components/v3/        la web pública
lib/                  planes, sesiones, Stripe, Supabase, Twilio, ElevenLabs
lib/server/           lo que sólo puede ejecutarse en el servidor
tests/unidad/         node:test, sin marco extra
tests/e2e/            Playwright
docs/                 las decisiones que no se leen en el código
scripts/              comprobaciones y utilidades
```

## Dos reglas que este código sí sostiene

**Autenticación por colocación.** El proxy decide quién entra mirando el
primer tramo de la dirección: `/portal` y `/admin` piden sesión, el resto es
público. Eso deja una trampa —una página guardada en otro sitio se sirve a
quien la pida, y ya pasó con una copia del panel dentro de `app/api/`— y hay
una prueba que la vigila: `tests/unidad/rutas-protegidas.test.mjs`.

**Una sola fuente de verdad por cosa.** Los planes en `lib/planes.js`, los
precios desde Stripe, la geometría y los estados del núcleo en
`components/nucleo/tokens.js`. Tenerlos en dos sitios fue lo que hizo que la
web anunciara un precio y se cobrara otro.

## Los documentos que importan

| documento | para qué |
| --- | --- |
| [`docs/nucleo-vivo.md`](docs/nucleo-vivo.md) | la Apertura Neural: qué es, cómo se marcha, de dónde sale la nitidez, el rendimiento medido y **cuatro trampas de CSS y React que se ven en pantalla y no leyendo el fichero** |
| [`docs/voz-elevenlabs-twilio.md`](docs/voz-elevenlabs-twilio.md) | el recorrido de una llamada, los webhooks y qué falta para que suene el teléfono |
| [`docs/production-runbook.md`](docs/production-runbook.md) | desplegar y qué mirar cuando algo va mal |
| [`docs/hasta-donde-aguanta.md`](docs/hasta-donde-aguanta.md) | los límites conocidos, medidos con 506 empresas y 45.000 llamadas |
| [`docs/copias-y-recuperacion.md`](docs/copias-y-recuperacion.md) | qué se pierde y cuánto se tarda si algo se borra; el simulacro de restauración |
| [`docs/cuando-se-cae-algo.md`](docs/cuando-se-cae-algo.md) | un runbook por proveedor: detección, impacto, mitigación, vuelta atrás |
| [`scripts/carga/LEEME.md`](scripts/carga/LEEME.md) | pruebas de carga con k6, sólo contra un entorno de pruebas; se niegan a apuntar a producción |
| [`tests/unidad/LEEME.md`](tests/unidad/LEEME.md) | qué se prueba y por qué eso y no otra cosa |

## Despliegue

Producción sale de `main`, en Vercel, con las funciones en `dub1` (Dublín, la
misma región que la base de datos). Cada empuje a `main` despliega, **y `main`
está protegida**: sólo admite fusiones con el flujo `verificar` en verde
(eslint, unidad, build, e2e), también para administradores, sin force push.
Se trabaja en rama y se fusiona por pull request.

Si algo sale mal ya desplegado: Vercel → Deployments → el anterior → *Promote
to Production*. Un minuto. Y hay interruptores de emergencia que paran la IA,
las llamadas o todo sin desplegar: `docs/cuando-se-cae-algo.md`.

## El banco de pruebas del núcleo

`/dev/living-core` tiene los once estados a un clic y los mandos de cámara y
luz sueltos. No sale en producción salvo que se pida a mano con `NESPED_LAB=1`.
