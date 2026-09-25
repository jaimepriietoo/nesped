# Conservación y borrado

Cuánto se guarda cada cosa y qué lo borra. Las cifras son las que aplica el
código hoy (`lib/server/compliance.mjs` y `lib/server/mantenimiento.js`); la
tarea de mantenimiento corre cada noche.

| Dato | Plazo | Cómo se borra | Variable que lo cambia |
| --- | --- | --- | --- |
| Grabación de la llamada | 30 días | Barrido de retención: borra el fichero y la referencia | `RECORDING_RETENTION_DAYS` |
| Transcripción de la llamada | 90 días | Barrido de retención: vacía el texto y su versión cifrada | `TRANSCRIPT_RETENTION_DAYS` |
| Historial de actividad del contacto | 180 días en la tabla viva; después pasa al archivo | Archivado nocturno | `ARCHIVO_EVENTOS_DIAS` |
| Registro de auditoría | 365 días vivo; después archivo | Archivado nocturno | `ARCHIVO_AUDITORIA_DIAS` |
| Archivo (actividad y auditoría antiguas) | 3 años desde que se archivó | Purga nocturna | `PURGA_ARCHIVO_DIAS` |
| Cola de trabajos | 30 días | Purga nocturna | `PURGA_TRABAJOS_DIAS` |
| Sesiones sin usar | 8 días | Purga nocturna | — |
| Ficha del contacto (nombre, teléfono, correo, necesidad) | Mientras la empresa cliente tenga contrato, o hasta que pida borrarla | Borrado a petición (derecho de supresión) o baja de la empresa | — |
| Copias de seguridad de Supabase | Las del plan (7 días en Pro; más con PITR) | Caducan solas | Panel de Supabase |

## Al dar de baja a una empresa cliente

1. Exportar sus datos si los pide (función `exportar_tabla_de_empresa`).
2. Borrar sus filas de todas las tablas (la baja de la empresa).
3. Desde que exista la clave por empresa (`../seguridad/clave-por-empresa.md`),
   destruir su clave: lo que quede en copias de seguridad pasa a ser ilegible.
4. Pedir el borrado en los proveedores que guarden copia (ElevenLabs).
5. Anotar la baja en el registro de auditoría.

## Pendiente de decidir

- La política pública dice «entrenar y supervisar los flujos de voz» entre las
  finalidades (`compliance.mjs`). Si no se entrena ningún modelo con las
  llamadas, conviene quitar «entrenar»: es una finalidad que exige base
  jurídica propia y suele alarmar a los clientes.
