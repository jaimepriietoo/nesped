# Webhooks salientes

Lo que Nesped le cuenta al sistema del cliente cuando pasa algo. Se
configura en el portal (Ajustes → URL del webhook, `clients.webhook`) y se
prueba con el botón de prueba.

## Eventos

| Evento | Cuándo | `data` |
| --- | --- | --- |
| `nesped.llamada.terminada` | al guardar una llamada atendida | `conversation_id`, `lead_id`, `lead_captured`, `duration_seconds`, `status`, `summary`, `from_number` |
| `nesped.contacto.actualizado` | al editar un contacto desde el portal | `lead_id`, `cambios`, `status` |
| `nesped.webhook_test` | el botón de prueba | `ok`, `message` |

La transcripción entera **no viaja**: si hace falta, se pide al portal.

## Forma

`POST` con `Content-Type: application/json` y estas cabeceras:

- `X-Nesped-Event`: el nombre del evento.
- `X-Nesped-Delivery`: id de la entrega (el mismo en cada reintento).
- `X-Nesped-Signature`: `t=<unix>,v1=<hmac-sha256 hex>` sobre `"<t>.<cuerpo>"`
  con la clave que da el portal (Ajustes → clave del webhook).
- `X-Nesped-Version`: `1`.

```json
{
  "event": "nesped.llamada.terminada",
  "created_at": "2026-09-15T10:00:00.000Z",
  "client_id": "acme",
  "client_name": "Acme",
  "data": { "conversation_id": "conv_…", "lead_id": "…", "lead_captured": true, "duration_seconds": 42, "status": "completed", "summary": "…", "from_number": "+34…" }
}
```

Verificar: recalcular el HMAC, comparar en tiempo constante y rechazar si
`t` tiene más de 5 minutos.

## Entregas y reintentos

- Un `2xx` es entregado.
- Un `4xx` (salvo 408 y 429) es **muerto**: no se reintenta, la URL o la
  autorización están mal.
- Lo demás se reintenta 5 veces con espera creciente (1, 5, 15, 60, 180
  minutos) y queda en **fallido**.
- `GET /api/portal/webhook/entregas` lista las entregas (por cursor, con
  `?estado=`); `POST` con `{ "entrega": id }` vuelve a intentar una.
- Las entregas se guardan 30 días.

Cada envío comprueba la URL antes de salir: nada apunta a localhost ni a la
red interna.
