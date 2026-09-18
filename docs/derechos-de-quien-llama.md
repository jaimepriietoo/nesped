# Derechos de quien llama

Qué se hace cuando alguien que llamó a un cliente de Nesped pide acceso,
rectificación, supresión u oposición (RGPD, arts. 15–21). Plazo legal: **un
mes** desde que llega la petición; objetivo: una semana.

## Quién es quién

- **Responsable**: la empresa a la que llamó (el cliente de Nesped). Ella
  decide. Nesped es **encargado** y ejecuta por su cuenta.
- La petición puede llegar a `privacidad@nesped.com` (es la dirección que
  dice la asistente y la que está en nesped.com/llamadas) o directamente a
  la empresa. En ambos casos: se avisa a la empresa el mismo día y se
  documenta.

## Cómo se identifica a la persona

Sólo hace falta el **número desde el que llamó** y una fecha aproximada. Se
contesta al mismo número o al correo desde el que escribe; no se piden
documentos de identidad para una llamada de recepción (sería pedir más datos
para borrar datos).

## Dónde están sus datos

Todo está ligado al teléfono, normalizado a E.164 (`+34…`):

| Dónde | Qué | Cómo se encuentra |
| --- | --- | --- |
| `calls` | grabación (`grabacion_propia` en Storage), transcripción, resumen | `from_number = '+34…'` |
| `leads` | nombre, necesidad, localidad, notas, etiquetas, departamento | `telefono = '+34…'` |
| `lead_events`, `lead_notes`, `lead_comments`, `lead_reminders` | historial | por `lead_id` |
| `notificaciones_lead`, `automatismos_ejecuciones` | avisos y acciones | por `lead_id` |
| ElevenLabs | conversación y audio | por `conversation_id` (= `calls.call_sid`) |
| Twilio | registro de la llamada (número, duración) | consola de Twilio |

## Qué se hace en cada caso

**Acceso / copia.** Exportar las filas de arriba y la grabación propia
(Storage) en un ZIP; mandarlo por correo cifrado o enlace firmado de 24 h.

**Rectificación.** Editar `leads` desde el portal de la empresa (ficha del
contacto). Se anota en `audit_logs` como cualquier edición.

**Supresión.**
1. Borrar `leads` de ese teléfono en esa empresa (arrastra historial, notas,
   avisos y ejecuciones por clave ajena).
2. En `calls`: borrar la fila o, si la empresa necesita conservar que hubo
   una llamada, dejar sólo fecha y duración y vaciar `transcript`,
   `summary`, `recording_url`, `grabacion_propia` (y borrar el objeto de
   Storage).
3. En ElevenLabs: borrar la conversación (`DELETE
   /v1/convai/conversations/{id}`).
4. Apuntar en `audit_logs` (`entity_type: 'derechos'`, `action:
   'supresion'`, `entity_id`: hash del teléfono, nunca el teléfono).

**Oposición a la grabación** durante la llamada: la asistente ofrece otra
vía y no insiste (está en su prompt). Si la persona quiere que no se grabe
en el futuro, se le indica que llame fuera de la asistente (el número de
desvío de la empresa) o escriba.

## Lo que sigue pendiente

- Un botón "exportar / borrar por teléfono" en administración, para no
  hacerlo con SQL. Hasta entonces, lo hace Nesped a mano con el guion de
  arriba.
- Retención automática de grabaciones y transcripciones: ya existe
  (`RECORDING_RETENTION_DAYS`, `TRANSCRIPT_RETENTION_DAYS`, barrido diario).
