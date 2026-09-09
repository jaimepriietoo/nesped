alter table public.clients
  add column if not exists original_number text;

comment on column public.clients.twilio_number is 'Numero de Telnyx TUYO asignado a este cliente. Recibe las llamadas desviadas; el enrutado busca el cliente por este numero.';
comment on column public.clients.original_number is 'Numero real de la empresa cliente, el que desvia hacia twilio_number. Solo informativo: no se usa para enrutar llamadas.';

create unique index if not exists clients_twilio_number_unique
  on public.clients (twilio_number)
  where twilio_number is not null and twilio_number <> '';
;
