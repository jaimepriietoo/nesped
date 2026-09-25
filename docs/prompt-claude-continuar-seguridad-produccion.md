# Prompt para continuar la seguridad de producción con Claude Code

```text
Trabaja en /Users/jaimeprieto/nesped y continúa la fase uno de
profesionalización de seguridad de producción.

Antes de tocar nada, lee completos:
- README.md
- AGENTS.md
- docs/production-runbook.md
- docs/cuando-se-cae-algo.md
- docs/copias-y-recuperacion.md
- docs/rls-por-empresa.md
- docs/sobres-kms.md
- docs/diseno-cifrado-datos-personales.md
- docs/verificacion-seguridad-produccion-2026-09-25.md

Reglas obligatorias:
- Trabaja sobre la rama codex/verificar-seguridad-produccion o una rama nueva
  codex/* basada en ella. Main está protegida.
- No leas, abras, modifiques, imprimas ni reproduzcas ningún `.env*`. Puedes
  comprobar únicamente si esos nombres de archivo están ignorados por Git.
- No muestres valores de secretos, tokens, claves, sobres cifrados, datos
  personales ni resultados SQL con información de clientes.
- Si encuentras una credencial real en código o historial, para y avisa sin
  reproducirla.
- No toques el número de voz de Fibergreen ni la configuración de ElevenLabs.
- Cambios pequeños, reversibles y con una prueba por cada hallazgo corregido.
- No elimines funcionalidad ni datos. Las migraciones sólo pueden ser
  aditivas, deben estar explicadas en `supabase/migrations/` y después debe
  ejecutarse `npm run volcar:migraciones`.
- No introduzcas Inngest, Redis, workers nuevos, OTel completo,
  PostHog/Langfuse, SSO, particionado ni réplicas.
- No hagas commit, PR, merge ni despliegue hasta que el usuario lo pida.
- Antes de cada commit ejecuta exactamente y en este orden:
  1. npx eslint app components lib tests scripts
  2. npm run test:unidad
  3. npm run build
  4. npx playwright test

Hechos ya verificados; no los repitas a ciegas:
- Supabase está sano, en Postgres 17 y eu-west-1; la organización es Pro.
- No hay permisos de tablas públicas para anon/authenticated/PUBLIC.
- `nesped_app` es NOLOGIN, no tiene BYPASSRLS, el pre-request está activo y
  pg_stat_statements confirma que el portal lo usa.
- KMS abre nueve sobres con OIDC de Vercel en el despliegue activo.
- La cadena de 194 registros de auditoría está íntegra.
- El smoke de cabeceras, sesiones, redirecciones y páginas legales pasó.
- Todos los `.env*` están ignorados y ninguno está versionado.

Hallazgo prioritario a resolver:
- Hay dos llamadas antiguas con transcripción clara pero sin
  `transcript_cifrado` y veintinueve con `from_number` claro pero sin
  `from_number_cifrado`, aunque tienen `client_id` y la cola de mantenimiento
  termina correctamente.

Haz lo siguiente, en orden:

1. Reproduce el fallo sólo con fixtures sintéticos. No leas el contenido de
   esas filas ni ningún dato personal.
2. Audita `lib/server/cifrado-relleno.js`, `lib/server/cifrado-datos.js` y la
   ejecución de mantenimiento. Determina por qué quedan filas pendientes sin
   que el trabajo falle ni se vuelva a encolar.
3. Corrige el comportamiento de forma mínima. Como mínimo, un error de
   lectura/escritura o cualquier fila cifrable aún pendiente debe dejar
   `quedaTrabajo=true`; evita bucles infinitos mediante contadores y alertas.
4. Añade pruebas unitarias que reproduzcan cada causa corregida.
5. Añade una comprobación agregada y sin PII al estado operativo para detectar
   backlog de cifrado envejecido. No expongas los contadores públicamente sin
   autenticación administrativa.
6. No pases producción a `solo` ni vacíes columnas claras. Primero deben quedar
   cero pendientes, mantenerse así dos días y existir una copia restaurable.
7. Actualiza `docs/verificacion-seguridad-produccion-2026-09-25.md` con causa,
   arreglo, pruebas y cualquier riesgo residual.

Después continúa la recuperación, sin acciones destructivas:
- Verifica en el panel/API de Supabase la última copia correcta, retención y
  estado de PITR. Si no puedes verlo, deja exactamente qué debe comprobar el
  propietario; no inventes el resultado.
- Prepara el primer simulacro en un proyecto o rama aislada, pero no crees
  recursos con coste ni restaures nada sin confirmar antes el coste y pedir
  autorización.
- Inventaría en Vercel sólo nombres, ámbitos y antigüedad de variables, nunca
  sus valores. Confirma que no quedan claves AWS estáticas y que Preview no
  recibe acceso de producción innecesario.
- Propón un destino externo e inmutable para los checkpoints de auditoría,
  respetando la prohibición de introducir OTel completo o sistemas nuevos no
  autorizados.

Entrega al usuario:
- Hallazgos con severidad, explotación/impacto y evidencia.
- Cambios aplicados y prueba asociada.
- Qué está demostrado en producción y qué sigue pendiente de una acción del
  propietario.
- Estado exacto de ESLint, unidad, build y Playwright.
```
