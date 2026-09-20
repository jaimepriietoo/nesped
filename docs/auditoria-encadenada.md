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

## Lo que falta

Quien pueda quitar el trigger puede reescribir la cadena y recalcularla
entera. Contra eso sólo vale sacar la cadena fuera: volcar cada día el tramo
del día a un almacén que no admita reescrituras (S3 con object lock o
similar). El código de exportación no está hecho todavía; necesita decidir
proveedor y credenciales.
