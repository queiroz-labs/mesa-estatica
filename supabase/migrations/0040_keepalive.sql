-- Keepalive: o plano free pausa projetos sem "atividade suficiente" mesmo com GET no REST
-- (o dev foi avisado com pings a cada 3 dias). Esta RPC faz uma escrita real no Postgres;
-- chamada pelo workflow .github/workflows/keepalive.yml.

create table if not exists public.keepalive_log (
  id int primary key default 1 check (id = 1),
  pings bigint not null default 0,
  ultimo_ping timestamptz not null default now()
);

alter table public.keepalive_log enable row level security;
-- sem policies: ninguém lê/escreve direto; só a função abaixo (security definer).

create or replace function public.keepalive()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  insert into public.keepalive_log as k (id, pings, ultimo_ping)
  values (1, 1, now())
  on conflict (id) do update
    set pings = k.pings + 1, ultimo_ping = now()
  returning k.ultimo_ping;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
