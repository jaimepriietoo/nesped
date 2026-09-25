# Ensayo de restauración

Una copia que nunca se ha restaurado no demuestra nada. Esto se hace una vez
por trimestre y se anota abajo. No toca producción: se restaura en un
proyecto aparte y se borra al terminar.

## Antes de empezar

En Supabase → Database → Backups, comprobar y anotar: si hay copias diarias,
cuántos días se guardan y si está activado PITR (recuperación a un instante).
En el plan gratuito **no hay copias**: hace falta el plan Pro.

## Pasos

1. **Foto de producción.** Ejecutar en el editor SQL de producción y guardar
   el resultado:

   ```sql
   select 'clients' t, count(*) from clients union all
   select 'leads', count(*) from leads union all
   select 'calls', count(*) from calls union all
   select 'lead_events', count(*) from lead_events union all
   select 'audit_logs', count(*) from audit_logs;
   ```

2. **Restaurar en un proyecto nuevo.** Backups → «Restore to a new project»
   (restaurar en un proyecto nuevo) con la copia de ayer. Con PITR, elegir una
   hora concreta.
3. **Comprobar.** En el proyecto restaurado:
   - la misma consulta del paso 1 (las cifras deben cuadrar con las de ayer);
   - `select * from verificar_cadena_auditoria(0);` debe devolver cero filas
     (la cadena de auditoría llega intacta);
   - que los datos cifrados se abren: `npm run` del script de verificación de
     cifrado apuntando al proyecto restaurado (lo lanza Claude).
4. **Medir.** Anotar cuánto tardó de principio a fin: es el tiempo real de
   recuperación.
5. **Borrar** el proyecto restaurado.

## Registro

| Fecha | Copia usada | Tiempo total | ¿Cuadra? | Quién |
| --- | --- | --- | --- | --- |
| [ ] | [ ] | [ ] | [ ] | [ ] |
