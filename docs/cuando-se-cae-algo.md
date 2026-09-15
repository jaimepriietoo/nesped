# Cuando se cae algo

Un runbook por cada cosa de la que Nesped depende. Cada uno contesta lo
mismo: cómo se nota, a quién afecta, qué se hace ahora mismo, cómo se vuelve
atrás, cómo se recupera, cómo se comprueba, y qué se le dice a quién.

Lo que ya existe y en lo que se apoyan todos: los **cortacircuitos por
proveedor** (`lib/server/cortacircuitos.js`: tras N fallos seguidos dejan de
llamar durante un rato y `/api/ops/salud` los enseña), los **interruptores
de emergencia** (`ajustes_plataforma`, ver `interruptores.js`), la **cola con
reintentos** (`trabajos`) y el aviso a `OPS_ALERT_WEBHOOK_URL` desde
`logEvent("error", …)`.

---

## Vercel caído

**Detección.** nesped.com no responde o devuelve 5xx de Vercel; el panel de
Vercel lo dice; `curl -I https://www.nesped.com` sin `server: Vercel`.
**Impacto.** Todo lo web: portada, portal, API. **Las llamadas siguen
entrando** —Twilio y ElevenLabs no dependen de Vercel—, pero ElevenLabs no
puede pedir contexto ni guardar el post-call: las llamadas se atienden sin
saber quién llama y no se registran hasta que vuelva.
**Mitigación.** Nada que hacer en Vercel. Avisar a los clientes con
llamadas activas. Los webhooks de ElevenLabs y Stripe **reintentan** solos
durante horas.
**Rollback.** No aplica.
**Recuperación.** Al volver, `/api/cola/procesar` recoge lo pendiente;
Stripe y ElevenLabs reentregan. Comprobar en `calls` que las llamadas del
hueco han llegado; si no, pedirlas por la API de ElevenLabs
(`conversations`) y reinyectarlas al post-call.
**Verificación.** `/api/ops/salud`, una llamada de prueba, un login.
**Comunicación.** Estado en la web (§24 del informe: aún no hay página de
estado; correo a los clientes activos).

## Supabase caído

**Detección.** Todas las rutas devuelven 500 o 503 a la vez; Sentry se
llena de errores de PostgREST; `/api/ops/salud` no contesta.
**Impacto.** Total: no hay login (el reto de 2FA y el límite de peticiones
viven en la base y **fallan cerrados**), no hay portal, no se guardan
llamadas. Es la dependencia sin la que no hay producto.
**Mitigación.** Nada que hacer en Supabase. Poner `pausa_global`... no se
puede: también está en la base. El sistema se para solo, que es lo
correcto: no se puede escribir nada.
**Rollback.** No aplica.
**Recuperación.** Al volver: comprobar `salud_de_la_base`, los webhooks
reentregados, y la cola. Si la caída fue larga, ElevenLabs habrá agotado
reintentos: recuperar las conversaciones por su API.
**Verificación.** Login completo con 2FA, abrir Contactos, `/api/ops/salud`.

## Railway caído (el latido)

**Detección.** `/api/ops/salud` avisa "la cola de trabajos no se está
procesando"; `/api/cola/procesar` manda `cola.sin_latido` al webhook de
operaciones en la siguiente pasada (como tarde, el cron diario de Vercel).
**Impacto.** Bajo: informes por correo, purgas y copias de grabaciones
esperan. Nada visible para el cliente en las primeras horas.
**Mitigación.** Llamar a mano a `/api/cola/procesar` con `CRON_SECRET`
cada pocos minutos, o desde un cron externo. Con Vercel Pro esto deja de
depender de Railway (crons cada minuto).
**Recuperación.** Reiniciar el servicio en Railway; la cola se pone al día
sola.

## ElevenLabs caído

**Detección.** El cortacircuitos de `elevenlabs` se abre
(`/api/ops/salud` → `proveedores`); la llamada de demostración devuelve
503; Twilio muestra llamadas que no se conectan.
**Impacto.** **No se atiende ninguna llamada.** Es el único caso en que el
cliente lo nota de inmediato: el teléfono suena y nadie contesta.
**Mitigación.** No hay proveedor de respaldo (§Resiliencia del informe: no
se ha construido). Lo que sí: **desviar el número al teléfono del cliente**
mientras dure. Es un botón: `POST /api/admin/desvio` con
`{ "empresa": "acme", "activar": true, "telefono": "+34…" }` (el teléfono se
guarda en `clients.telefono_desvio`; la siguiente vez no hace falta). El
número de Twilio pasa a contestar un `<Dial>` al teléfono del cliente y se
guarda a dónde apuntaba antes.
**Recuperación.** El cortacircuitos se cierra solo al volver. Quitar el
desvío: el mismo `POST` con `"activar": false` restaura la URL anterior.
**Verificación.** Llamada de prueba de extremo a extremo.

## Twilio caído

**Detección.** Twilio status page; llamadas que no llegan a ElevenLabs;
WhatsApp/SMS que no salen (cortacircuitos `twilio`).
**Impacto.** Igual que ElevenLabs: nadie contesta. Más: no salen
recordatorios ni respuestas de WhatsApp.
**Mitigación.** Ninguna propia: Twilio ES la línea. Avisar a los clientes.
**Recuperación.** Los mensajes salientes están en `lead_events` y en la
cola: comprobar cuáles no salieron y reenviar los que aún tengan sentido.

## Stripe caído

**Detección.** `/api/precios` devuelve `{}` (la portada enseña
"Consultar"); el checkout no abre; webhooks que no llegan.
**Impacto.** No se puede contratar ni cambiar de plan. **Nadie pierde
acceso**: el plan vive en `clients.plan`, no se consulta a Stripe en cada
petición.
**Mitigación.** Ninguna necesaria. Los pagos hechos durante la caída llegan
después por webhook, y `reclamar_webhook` impide aplicarlos dos veces.
**Recuperación.** Comprobar en Stripe → Webhooks los eventos fallidos y
reenviarlos desde su panel.

## OpenAI caído

**Detección.** Cortacircuitos `openai` abierto; el copiloto y las
sugerencias devuelven error; las autorrespuestas de WhatsApp no se generan.
**Impacto.** Medio: la voz sigue (la conversación la lleva ElevenLabs, no
OpenAI). Lo que se pierde es análisis, copiloto y respuestas automáticas.
**Mitigación.** Ninguna necesaria: el cortacircuitos evita reintentar en
bucle. Si se alarga, `pausa_ia = true` para que no se acumulen fallos.
**Recuperación.** Automática al cerrarse el cortacircuitos.

## Credenciales comprometidas

**Detección.** Actividad rara en `audit_logs`; avisos del proveedor;
cargos inesperados; una clave en un sitio público.
**Impacto.** Depende de cuál. Las peores: `SUPABASE_SERVICE_ROLE_KEY`
(acceso total a la base), `STRIPE_SECRET_KEY` (cobros y reembolsos),
`TWILIO_AUTH_TOKEN` (llamadas y mensajes a cuenta de Nesped),
`INTERNAL_API_TOKEN` (escribir contactos en nombre de ElevenLabs).
**Mitigación, en este orden.**
1. `pausa_global = true` (si la base sigue siendo de confianza).
2. Rotar la clave en el proveedor y en Vercel/Railway (sección 2 del
   runbook de producción).
3. Si es la de sesión (`NESPED_SESSION_SECRET`): rotarla **cierra todas las
   sesiones**; además subir `session_epoch` de los usuarios afectados
   (`revocar_sesiones_usuario`).
4. Revisar `audit_logs` desde la fecha sospechada.
**Recuperación.** Quitar la pausa cuando todas las claves sean nuevas.
**Comunicación.** Si hubo acceso a datos personales, es un incidente RGPD:
72 horas para notificar a la AEPD. Guardar la línea temporal.

## Despliegue defectuoso

**Detección.** Sentry se llena tras un despliegue; los e2e de `verificar`
no lo habrían dejado pasar, así que lo que llega aquí es algo que las
pruebas no cubren.
**Mitigación.** Vercel → Deployments → el anterior → **Promote to
Production**. Un minuto. Es el rollback más barato que existe y conviene
usarlo antes de intentar arreglar nada.
**Rollback de base.** Las migraciones son aditivas: el código anterior
funciona con el esquema nuevo. Nunca revertir una migración a la vez que
el código.
**Verificación.** Smoke: portada, login, `/api/ops/salud`.

## Base de datos corrupta

Ver `docs/copias-y-recuperacion.md`: PITR si lo hay; volcado propio si no.
Antes de nada, `pausa_global` para que nada más escriba encima.

## Región caída (eu-west-1 / dub1)

**Impacto.** Vercel y Supabase están en Irlanda los dos. Si cae la región
de AWS Irlanda entera, cae todo, y no hay réplica en otra región.
**Decisión pendiente.** Con clientes que paguen por disponibilidad, PITR y
réplica de lectura en otra región de la UE. Hoy no está justificado.

---

## Lo que falta para que estos runbooks sean completos

- **Página de estado** (§24 del informe): cuando haya más de diez clientes.
- **Simulacro**: ejecutar uno de estos runbooks en frío una vez, y anotar
  lo que no cuadró.
