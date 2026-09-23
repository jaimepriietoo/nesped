create table if not exists public.paises_de_acceso (
  client_id text not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  pais text not null check (pais ~ '^[A-Z]{2}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (client_id, email, pais)
);

create table if not exists public.accesos_denegados (
  id uuid primary key default gen_random_uuid(),
  client_id text not null references public.clients(id) on delete cascade,
  email text not null,
  role text not null default '',
  ruta text not null,
  created_at timestamptz not null default now()
);

create index if not exists accesos_denegados_recientes
  on public.accesos_denegados (client_id, created_at desc);

do $$
declare
  v_tabla text;
begin
  foreach v_tabla in array array['paises_de_acceso', 'accesos_denegados']
  loop
    execute format('alter table public.%I enable row level security', v_tabla);
    execute format('alter table public.%I force row level security', v_tabla);
    execute format('revoke all on public.%I from public, anon, authenticated', v_tabla);
    execute format('grant select, insert, update, delete on public.%I to service_role', v_tabla);
    execute format('grant select on public.%I to nesped_app', v_tabla);
    execute format('drop policy if exists sin_acceso_publico on public.%I', v_tabla);
    execute format(
      'create policy sin_acceso_publico on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      v_tabla
    );
    execute format('drop policy if exists nesped_aislamiento_empresa on public.%I', v_tabla);
    execute format(
      'create policy nesped_aislamiento_empresa on public.%I as permissive for all to nesped_app '
      'using ((select current_setting(''app.client_id'', true)) = client_id) '
      'with check ((select current_setting(''app.client_id'', true)) = client_id)',
      v_tabla
    );
  end loop;
end
$$;

create or replace function public.purgar_accesos_denegados(p_lote integer default 1000)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_borradas integer;
begin
  with viejos as (
    select id from public.accesos_denegados
    where created_at < now() - interval '30 days'
    order by created_at
    limit least(greatest(coalesce(p_lote, 1000), 1), 10000)
  )
  delete from public.accesos_denegados a using viejos v where a.id = v.id;
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke all on function public.purgar_accesos_denegados(integer) from public, anon, authenticated;
grant execute on function public.purgar_accesos_denegados(integer) to service_role;

notify pgrst, 'reload schema';;
