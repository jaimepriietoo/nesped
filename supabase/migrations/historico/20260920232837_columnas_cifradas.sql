alter table public.leads
  add column if not exists telefono_cifrado text,
  add column if not exists telefono_hash text,
  add column if not exists email_cifrado text,
  add column if not exists email_hash text;

alter table public.calls
  add column if not exists from_number_cifrado text,
  add column if not exists from_number_hash text,
  add column if not exists phone_cifrado text,
  add column if not exists phone_hash text,
  add column if not exists transcript_cifrado text,
  add column if not exists summary_cifrado text,
  add column if not exists summary_long_cifrado text;

alter table public.lead_notes add column if not exists body_cifrado text;
alter table public.lead_comments add column if not exists body_cifrado text;
alter table public.lead_memory add column if not exists last_summary_cifrado text;

create index if not exists leads_telefono_hash on public.leads (client_id, telefono_hash) where telefono_hash is not null;
create index if not exists leads_email_hash on public.leads (client_id, email_hash) where email_hash is not null;
create index if not exists calls_from_number_hash on public.calls (client_id, from_number_hash) where from_number_hash is not null;
create index if not exists calls_phone_hash on public.calls (client_id, phone_hash) where phone_hash is not null;

create index if not exists leads_sin_cifrar on public.leads (id) where telefono_cifrado is null and telefono is not null;
create index if not exists calls_sin_cifrar on public.calls (id) where transcript_cifrado is null and transcript is not null;

notify pgrst, 'reload schema';;
