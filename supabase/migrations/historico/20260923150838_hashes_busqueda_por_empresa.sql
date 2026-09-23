-- Hashes ciegos separados por empresa para teléfonos y correos cifrados.
--
-- POR QUÉ. Las columnas `_hash` originales usan una misma clave HMAC para
-- todas las empresas. Aunque no revelan el valor, dos filas iguales de dos
-- empresas producen el mismo hash y permiten correlacionar un volcado.
--
-- DESPLIEGUE. La aplicación escribe temporalmente ambos hashes y consulta
-- ambos durante el relleno. El mantenimiento completa estas columnas por
-- lotes. Cuando no quede trabajo se puede activar el modo `empresa`, que
-- deja de escribir el hash global. No se elimina ni reescribe ninguna
-- columna existente en esta migración: el rollback sigue siendo inmediato.

alter table public.leads
  add column if not exists telefono_hash_empresa text,
  add column if not exists email_hash_empresa text;

alter table public.calls
  add column if not exists from_number_hash_empresa text,
  add column if not exists phone_hash_empresa text;

create index if not exists leads_telefono_hash_empresa
  on public.leads (client_id, telefono_hash_empresa)
  where telefono_hash_empresa is not null;

create index if not exists leads_email_hash_empresa
  on public.leads (client_id, email_hash_empresa)
  where email_hash_empresa is not null;

create index if not exists calls_from_number_hash_empresa
  on public.calls (client_id, from_number_hash_empresa)
  where from_number_hash_empresa is not null;

create index if not exists calls_phone_hash_empresa
  on public.calls (client_id, phone_hash_empresa)
  where phone_hash_empresa is not null;

notify pgrst, 'reload schema';;
