create unique index if not exists calls_client_sid_unica
  on public.calls (client_id, call_sid)
  where call_sid is not null;;
