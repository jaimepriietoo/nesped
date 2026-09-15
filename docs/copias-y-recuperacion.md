# Copias y recuperación

Qué pasa si se pierden datos, cuánto se pierde y cuánto se tarda en volver.
Escrito el 15 de septiembre de 2026 con lo que se pudo comprobar desde el
código y la API; lo que sólo se ve en el panel de Supabase está marcado como
**[VERIFICAR EN EL PANEL]** y hay que rellenarlo antes de dar este documento
por bueno.

## Dónde viven los datos

Una sola base transaccional: Supabase, proyecto `ocztumkhliddagdumlyg`,
región `eu-west-1` (Irlanda), Postgres 17. **Todo** está ahí: empresas,
cuentas, contactos, llamadas, consumo, cola de trabajos, retos de segundo
factor. Las grabaciones de voz se copian al almacenamiento propio del
proyecto (`grabaciones_pendientes`, `calls.grabacion_propia`).

No hay ningún otro sitio con datos que importen. Prisma sobre SQLite ya no
existe (eliminado el 15 de septiembre); Redis no se usa; Railway no guarda
nada.

## Lo que hay que saber del plan **[VERIFICAR EN EL PANEL]**

En Supabase → Settings → Database → Backups:

| Pregunta | Plan Free | Plan Pro | Lo que hay |
| --- | --- | --- | --- |
| ¿Hay copias diarias? | No | Sí, 7 días | ☐ |
| ¿Hay PITR (recuperación a un instante)? | No | Opcional, de pago | ☐ |
| Retención | — | 7 días (más con PITR) | ☐ |

**Si el proyecto está en Free, no hay copia de nada.** Un `delete` sin
`where` es definitivo. Ésa es la primera cosa que decidir de este documento,
antes que cualquier otra de la hoja de ruta: el plan Pro cuesta menos que
un solo cliente perdido.

## RPO y RTO

Con lo que se sabe hoy:

| Escenario | RPO (cuánto se pierde) | RTO (cuánto se tarda) | Cómo |
| --- | --- | --- | --- |
| Plan Free | **todo desde el principio** | ∞ | no hay copia |
| Plan Pro, copia diaria | hasta 24 h | 1–2 h | restaurar la copia del día |
| Plan Pro + PITR | ~2 min | 1–2 h | restaurar a un instante |
| Con el volcado propio (abajo) | desde el último volcado | 2–4 h | recrear proyecto y cargar |

Objetivo razonable para Nesped hoy: **RPO ≤ 24 h, RTO ≤ 2 h** (Pro con copia
diaria). Cuando haya clientes pagando por llamadas: **PITR** (RPO minutos).

## Los tres casos del encargo

**Alguien borra 100.000 contactos.** Con PITR: se restaura a un minuto
antes del borrado y se pierde lo que entró después (llamadas de esos
minutos, que están también en ElevenLabs y se pueden pedir). Sin PITR: se
restaura la copia del día y se pierde el día. Sin plan Pro: se pierden.
Mitigación que ya existe: `exigirContactoPropio` y el cliente acotado hacen
que un borrado desde el portal sólo alcance a una empresa; el panel de
administración es el único sitio desde donde se puede borrar en masa.

**Una migración rompe una tabla.** Las migraciones son *expand* (añaden,
no quitan) por norma del repositorio, así que romper una tabla exige un
`drop` o un `alter … type` explícito. Antes de aplicar una que quite algo:
copia manual (`pg_dump` de esa tabla) y aplicar en horario sin llamadas.
Si aun así rompe: PITR al instante anterior, o volver a crear desde
`supabase/migrations/historico/`, que es reconstruible.

**Una aplicación defectuosa modifica miles de registros.** Se para primero
(`ajustes_plataforma.pausa_global = true`: la cola, la IA y las llamadas se
quedan quietas en treinta segundos), se identifica el intervalo por
`audit_logs` y `updated_at`, y se restaura con PITR al instante anterior.
Sin PITR, el `audit_logs.changes` (jsonb) permite deshacer a mano lo que
pasó por rutas que auditan; lo que no auditó, no.

## Volcado propio, independiente del proveedor

Además de lo que haga Supabase, un volcado semanal fuera del proveedor. No
sustituye a PITR —tiene RPO de una semana— pero es lo único que sobrevive a
una cuenta de Supabase suspendida o borrada.

```bash
# desde una máquina con acceso a la base (la cadena está en el panel)
pg_dump "$DATABASE_URL_DIRECTA" --no-owner --no-privileges --format=custom \
  --exclude-table-data='public.security_rate_limits' \
  --exclude-table-data='public.auth_challenges' \
  --file="nesped-$(date +%F).dump"
```

Guardarlo cifrado y fuera de Vercel/Supabase. **Contiene datos personales**:
teléfonos, nombres, transcripciones. Trátese como tal.

## Simulacro de restauración (cada trimestre)

Una copia que nunca se ha restaurado no es una copia. El simulacro no toca
producción:

1. Crear un proyecto nuevo de Supabase (o una rama, en Pro).
2. Restaurar en él el volcado más reciente: `pg_restore --no-owner -d …`.
3. Apuntar un `.env.local` de prueba a ese proyecto y arrancar `npm run dev`.
4. Entrar al portal con la cuenta de prueba y abrir Contactos, Llamadas e
   Inteligencia: tienen que enseñar lo mismo que producción en la fecha del
   volcado.
5. Anotar aquí cuánto ha tardado el paso 2 (ése es el RTO real) y la fecha.
6. Borrar el proyecto de prueba.

| Fecha | Volcado | Tiempo de restauración | Quién | Resultado |
| --- | --- | --- | --- | --- |
| — | — | — | — | pendiente del primero |

## Lo que protege antes de necesitar la copia

- **RLS forzada y cero permisos públicos** en las 38 tablas: la clave
  pública no puede borrar nada.
- **Cliente del portal acotado por construcción**: una ruta no puede tocar
  otra empresa aunque lo intente.
- **Interruptores de emergencia**: parar en treinta segundos sin desplegar.
- **Migraciones aditivas** y volcadas al repositorio: el esquema se
  reconstruye desde `supabase/migrations/historico/`.
- **Archivado antes de purgar**: `lead_events_archivo` y `audit_logs_archivo`
  guardan lo viejo antes de que se borre.
