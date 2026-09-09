# Pruebas de unidad

```bash
npm run test:unidad          # una vez
npm run test:unidad:watch    # se relanzan al guardar
npm test                     # unidad + navegador
```

Usan el lanzador que trae Node (`node --test`). No hay ninguna dependencia
nueva: el proyecto ya tenía Playwright para lo que necesita un navegador, y
meter un segundo marco completo para probar cuatro funciones puras habría
sido peor que no tenerlas.

## Qué va aquí y qué no

Aquí van **funciones puras**: dadas unas entradas, devuelven algo y no tocan
red ni base de datos. Son las que se pueden probar rápido y a fondo, con los
casos raros incluidos.

Lo que necesita un navegador, una sesión de verdad o el servidor levantado va
en `tests/e2e` con Playwright.

## Por qué existen estas cuatro

No son pruebas de cobertura: cada fichero cubre algo que ya falló o que, si
falla, no da error en ninguna parte.

- **planes** — si Growth pudiera usar Intelligence, el plan de 999 € deja de
  existir y nadie se entera hasta mirar la facturación.
- **texto-ajeno** — los nombres de los contactos son lo que alguien dicta por
  teléfono, y entran en el prompt del copiloto.
- **url-segura** — la prueba de webhooks hacía `fetch` a la dirección que le
  mandaras y devolvía la respuesta.
- **sesion-edge** — el middleware decidía quién entra en /admin mirando una
  cookie sin firmar.
- **inteligencia** — la promesa de esa pantalla es no enseñar ni una cifra que
  no pueda sostener. Un módulo nuevo sin compuerta no da error: miente.

La primera vez que se lanzaron encontraron un fallo real que las pruebas a
mano no habían visto: `new URL()` reescribe `::ffff:127.0.0.1` como
`::ffff:7f00:1`, y el validador de SSRF sólo reconocía la primera forma. O
sea que la dirección de bucle local escrita así pasaba el filtro.
