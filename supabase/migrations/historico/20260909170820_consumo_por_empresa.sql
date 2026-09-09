-- Cuánto consume cada empresa, por día.
--
-- Hoy no hay forma de saberlo. Un cliente de 499 € al mes puede estar gastando
-- 2.000 € en minutos de teléfono y voz sintética, y con un cliente eso se ve
-- en la factura del proveedor; con mil, no. Es el riesgo de coste más serio
-- del producto, y no se arregla mirando facturas: hay que medirlo por empresa
-- según ocurre.
--
-- Un registro por empresa y día en vez de uno por evento: mil empresas dan
-- 365.000 filas al año, que no es nada, y las preguntas que se hacen de esto
-- ("¿cuánto gastó marzo?") son por día. Guardar cada llamada suelta multiplica
-- las filas por mil sin responder mejor a ninguna pregunta.
create table if not exists public.consumo_diario (
  client_id       text not null references public.clients(id) on delete cascade,
  dia             date not null,

  llamadas        integer not null default 0,
  segundos_voz    integer not null default 0,
  -- Caracteres de voz sintética: es como factura ElevenLabs.
  caracteres_voz  integer not null default 0,
  -- Tokens de modelo de lenguaje, para el copiloto y los análisis.
  tokens_ia       integer not null default 0,
  mensajes        integer not null default 0,

  actualizado_en  timestamptz not null default now(),

  primary key (client_id, dia)
);

create index if not exists consumo_diario_dia_idx
  on public.consumo_diario (dia desc);

comment on table public.consumo_diario is
  'Consumo por empresa y día. Se suma con anotar_consumo(); nunca se escribe directamente.';

/**
 * Suma consumo al día de hoy de una empresa.
 *
 * Va en una función y no en un UPDATE desde el código por dos motivos: es una
 * suma concurrente —varias llamadas simultáneas del mismo cliente escriben a
 * la vez— y el ON CONFLICT DO UPDATE de Postgres la resuelve sin condiciones
 * de carrera. Hacerlo con leer-sumar-escribir desde JavaScript perdería
 * incrementos en cuanto haya dos llamadas a la vez, que es justo cuando el
 * dato importa.
 */
create or replace function public.anotar_consumo(
  p_client_id      text,
  p_llamadas       integer default 0,
  p_segundos_voz   integer default 0,
  p_caracteres_voz integer default 0,
  p_tokens_ia      integer default 0,
  p_mensajes       integer default 0
) returns void
language sql
security invoker
set search_path to 'public', 'pg_temp'
as $$
  insert into public.consumo_diario as c
    (client_id, dia, llamadas, segundos_voz, caracteres_voz, tokens_ia, mensajes)
  values
    (p_client_id, current_date,
     greatest(p_llamadas, 0), greatest(p_segundos_voz, 0),
     greatest(p_caracteres_voz, 0), greatest(p_tokens_ia, 0), greatest(p_mensajes, 0))
  on conflict (client_id, dia) do update set
    llamadas       = c.llamadas       + excluded.llamadas,
    segundos_voz   = c.segundos_voz   + excluded.segundos_voz,
    caracteres_voz = c.caracteres_voz + excluded.caracteres_voz,
    tokens_ia      = c.tokens_ia      + excluded.tokens_ia,
    mensajes       = c.mensajes       + excluded.mensajes,
    actualizado_en = now();
$$;

comment on function public.anotar_consumo(text, integer, integer, integer, integer, integer) is
  'Suma consumo del día. Solo para el servidor: se revoca EXECUTE a PUBLIC.';

revoke execute on function public.anotar_consumo(text, integer, integer, integer, integer, integer) from public;

-- Mismo blindaje que el resto de tablas.
revoke all on public.consumo_diario from anon, authenticated;
alter table public.consumo_diario enable row level security;
alter table public.consumo_diario force row level security;
drop policy if exists sin_acceso_publico on public.consumo_diario;
create policy sin_acceso_publico on public.consumo_diario
  as restrictive to anon, authenticated using (false) with check (false);;
