alter table public.departamentos
  add column if not exists areas jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';;
