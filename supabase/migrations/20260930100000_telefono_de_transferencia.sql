-- Pasar la llamada a una persona del departamento.
--
-- POR QUÉ. La asistente puede ofrecer «¿quiere que le pase con el servicio
-- técnico?» y, si el cliente dice que sí, ElevenLabs llama al teléfono de ese
-- departamento, le cuenta en una frase quién llama y para qué, conecta a los
-- dos y se sale. Hace falta saber a qué teléfono pasar cada departamento.
--
-- QUÉ HACE. Sólo añade departamentos.telefono_transferencia (E.164, lo
-- normaliza la aplicación). Vacío quiere decir que ese departamento no
-- recibe llamadas pasadas: la asistente toma nota como hasta ahora.
--
-- ORDEN. Aplicar ANTES de publicar el código: departamentosDeEmpresa() lee la
-- columna y, sin ella, el contexto de las llamadas y la clasificación
-- fallarían.
--
-- VUELTA ATRÁS. Vaciar los teléfonos deja de ofrecer el paso al momento. La
-- columna puede quedarse.

alter table public.departamentos
  add column if not exists telefono_transferencia text;

notify pgrst, 'reload schema';
