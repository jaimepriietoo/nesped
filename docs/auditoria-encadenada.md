# Auditoría encadenada

Desde el 20-09-2026 cada fila de `audit_logs` lleva `secuencia`, `hash_anterior`
y `hash`. El hash cubre la fila entera y el de la anterior, así que cambiar o
borrar una rompe todas las que vienen detrás. Dos triggers impiden `UPDATE` y
`DELETE`; sólo `archivar_audit_logs()` y `purgar_archivo()` pueden mover o
borrar, y lo hacen dentro de su propia transacción con una ventana que nadie
más ve.

## Cómo se comprueba

- **Cada día**, el mantenimiento llama a `verificar_cadena_auditoria()` (la
  cadena entera, en Postgres) y recalcula en Node las últimas 200 filas. Si
  algo no cuadra, registra `auditoria.cadena_verificada` con nivel `error`,
  y eso dispara la alerta operativa.
- Si está configurado el secreto exclusivo
  `NESPED_AUDIT_CHECKPOINT_SECRET`, firma además el último par
  `secuencia/hash` y lo escribe en el log estructurado del runtime, fuera de
  Supabase y sin datos personales. El material firmado es
  `v1|secuencia|hash|emitido_en`. Para que sea una prueba duradera, el log debe
  drenarse a un destino append-only o con retención WORM/Object Lock que
  rechace retrocesos de secuencia y cambios de hash para una secuencia ya
  guardada. Un reintento con igual secuencia y hash sí debe ser idempotente.
  El secreto debe contener al menos 32 bytes aleatorios, no puede reutilizar
  ninguna otra credencial y puede cerrarse con
  `npm run cerrar:sobre NESPED_AUDIT_CHECKPOINT_SECRET`.
- **A mano**: `npm run verificar:auditoria`. Sale con 1 si está rota y dice
  en qué secuencia y por qué.

## Qué hacer si está rota

1. No tocar la tabla. Anotar la secuencia y el motivo que da la comprobación.
2. Mirar en los logs de Postgres quién ejecutó `ALTER TABLE ... DISABLE
   TRIGGER` o `DROP TRIGGER` sobre `audit_logs`: es la única forma de
   saltarse la protección, y sólo puede hacerlo el rol `postgres` desde el
   panel de Supabase o el editor SQL.
3. Comparar con la última copia de seguridad: las filas anteriores a la
   rotura deberían coincidir; las posteriores hay que revisarlas una a una.
4. Volver a crear los triggers con la migración `20260920210000` (es
   idempotente) y volver a verificar.

## Límite que permanece

Quien pueda quitar el trigger puede reescribir la cadena y recalcularla
entera. El checkpoint firmado permite detectarlo siempre que el registro se
conserve fuera de Supabase y el secreto no se comprometa a la vez. El emisor
ya está preparado, pero todavía hay que provisionar un Log Drain inmutable.
Hasta que se configure el secreto, la comprobación informa `no_configurado`.
