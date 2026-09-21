# Departamentos, avisos y automatismos

Cómo una empresa usa Nesped como recepción de verdad: cada contacto se
clasifica por departamento, el aviso llega por correo a quien toca, y los
automatismos hacen lo que la empresa haya decidido, con límites y registro.

## El recorrido de un contacto

1. Entra por una llamada (ElevenLabs) o por WhatsApp (Twilio). El webhook
   guarda el evento y contesta; no llama a OpenAI.
2. La cola ejecuta `clasificar_lead` (`lib/server/clasificacion.js`):
   - **Clasificación** (`lib/server/departamentos.js`): la IA lee lo que se
     sabe del contacto y elige un departamento con motivo y confianza, y
     saca señales (urgente, enfadado, oportunidad, importante). Si la IA no
     está —sin clave, en pausa, con error— se clasifica por **palabras
     clave** de cada departamento y queda escrito que fue así.
   - **Automatismos** (`lib/server/automatismos.js`): se ejecutan las
     piezas activas para `lead.nuevo` (si acaba de crearse),
     `mensaje.entrante` (si vino por WhatsApp) y `lead.clasificado`.
3. `notificar_departamentos` (activo de serie) manda el correo a los
   **destinatarios** (`lib/server/destinatarios.js`): quienes atienden ese
   departamento, quienes reciben copia de todo, y quienes tienen Dirección
   si el contacto es importante. Cada intento queda en `notificaciones_lead`.

Además, **cada llamada entera** (quién, cuánto, resumen, transcripción,
contacto, departamento) llega por correo a quien tenga **copia de todo**,
un minuto después de guardarse (`notificar_llamada`, en la cola). Si esa
persona acaba de recibir el aviso del contacto por departamento, no se le
repite.

Desde la ficha de un contacto se puede **clasificar ahora** a mano
(`POST /api/portal/contactos/clasificar`).

## Pantallas del portal

| Pantalla | Qué configura | Quién |
| --- | --- | --- |
| **Tu IA** | tono, autonomía, qué puede y qué no, cuándo deriva, preguntas, datos, horario, mensajes, instrucciones libres, prueba en vivo | owner/admin (`ai.configure`) |
| **Automatismos** | cada pieza del catálogo: activa, modo (avisar / preparar / solo), configuración; últimas ejecuciones | owner/admin, manager con la casilla (`routing.manage`) |
| **Departamentos y avisos** | departamentos (descripción para la IA, palabras clave de respaldo) y destinatarios | owner/admin, manager con la casilla (`routing.manage`) |

`routing.manage` es la única acción que un manager **sólo** tiene con su
casilla marcada en Equipo, tenga o no otras: decidir a quién le llegan los
datos de quien llama no se hereda del rol.

## ¿Está la IA encendida?

`lib/server/estado-ia.js` junta las cuatro cosas que pueden apagarla —sin
`OPENAI_API_KEY`, pausa global, pausa de IA de la plataforma, pausa de IA de
la empresa— y dice, por función, qué pasa sin ella:

- WhatsApp: el mensaje se guarda, se crea un aviso "hay que contestar a
  mano", y **no sale ninguna respuesta automática**.
- Sugerencias: se devuelve la plantilla base marcada como tal; el portal lo
  dice antes de dejar enviar.
- Clasificación: por palabras clave.
- Automatismos que necesitan la IA: se omiten con el motivo apuntado.
- Copiloto: contesta 503 con el motivo.

El portal lo enseña arriba (píldora "IA apagada · motivo") y en Tu IA.

## Palancas

- `ajustes_plataforma.pausa_global`: ningún automatismo actúa; todo queda
  como `omitido: pausa global`.
- `NESPED_SIN_CORREO=si` (o `NODE_ENV=test`, o sin `RESEND_API_KEY`): no
  sale ningún correo; los avisos quedan `omitido`.

## Dejar lista una empresa (ejemplo: Fibergreen Valladolid)

1. **Equipo → alta** del owner si no existe.
2. **Departamentos y avisos**: dejar Ventas (fibra, presupuesto, cobertura,
   alta), Soporte (avería, sin servicio, router, lento), Facturación
   (factura, cobro, recibo), Instalaciones (instalación, técnico, visita),
   Dirección; quitar los que no apliquen (RRHH, Marketing). Añadir palabras
   clave propias ("cobertura", "router", "portabilidad").
3. **Destinatarios**: una persona por departamento con su correo y cargo;
   el gerente con Dirección y, si quiere, copia de todo.
4. **Tu IA**: tono, horario real, mensaje de fuera de horario, y en
   "con tus palabras" lo que sólo ellos saben ("si preguntan por cobertura,
   pide la dirección exacta…"). Pulsar **Pruébalo** con dos o tres mensajes
   típicos.
5. **Automatismos**: de serie quedan encendidos avisar por correo,
   etiquetar, motivo de derivación, urgencia, enfado, oportunidad y
   consentimiento. Encender "Avisar si nadie contesta" (30 min) y "Resumen
   diario" (08:00). Las piezas de WhatsApp sólo preparan hasta que haya
   canal.
6. **Un número de teléfono** en Twilio conectado al agente. Sin él, nada de
   lo anterior recibe ninguna llamada.

## Tablas

`departamentos`, `destinatarios`, `notificaciones_lead`, `automatismos`,
`automatismos_ejecuciones`, `restablecer_password`; en `leads`:
`departamento`, `departamento_motivo`, `departamento_confianza`,
`clasificado_en`, `senales`; en `client_settings`: `ia_config` (JSON) y
`daily_report_email` (existía en el código y no en la base: el alta fallaba).

## Lo que la IA debe saber ahora, y Ruperta

**Conocimiento.** En Tu IA → "Lo que la IA debe saber ahora" se escriben
avisos cortos con fecha de fin opcional ("Valdestillas sin servicio hasta
las 18:00"). Entran en el prompt de la voz, del WhatsApp y del copiloto
mientras estén vigentes, y desaparecen solos al caducar. Tabla
`conocimiento`; quien configura la IA (owner, admin) añade y retira.

**Ruperta** es el nombre con el que la IA acepta instrucciones por
teléfono. Sólo si se cumplen las dos cosas: quien llama lo hace desde el
teléfono de un owner o admin (el que tiene en Equipo) **y** dice el PIN
configurado en Tu IA. El agente pide el PIN, repite la instrucción para
confirmar y llama a la herramienta `anotar_instruccion`; el servidor vuelve
a comprobar número y PIN (lo que diga el modelo no cuenta), guarda el aviso
con origen `voz`, lo audita y avisa por correo a los owners. Un PIN
incorrecto queda en la auditoría. Sin PIN configurado, nadie puede dictar
nada. La herramienta se da de alta en ElevenLabs con
`node scripts/configurar-ruperta.mjs` (idempotente).

Cualquiera que diga "Ruperta" sin estar autorizado oye que no se puede
hacer desde esa llamada, y la conversación sigue con normalidad.
