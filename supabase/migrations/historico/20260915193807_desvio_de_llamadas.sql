alter table public.clients add column if not exists telefono_desvio text;
alter table public.clients add column if not exists desvio_activo boolean not null default false;
alter table public.clients add column if not exists desvio_voice_url_anterior text;
alter table public.clients add column if not exists desvio_cambiado_en timestamptz;;
