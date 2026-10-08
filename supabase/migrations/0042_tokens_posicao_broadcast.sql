-- Posição de PC: o UPDATE continua autorizado pela RLS de tokens (0021).
-- Só o servidor publica o resultado confirmado; cliente não recebe policy INSERT neste tópico.
alter table public.tokens add column if not exists versao_posicao bigint not null default 0;

create or replace function public.tokens_incrementar_versao_posicao()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    NEW.versao_posicao := 0;
  elsif NEW.x is distinct from OLD.x or NEW.y is distinct from OLD.y then
    NEW.versao_posicao := OLD.versao_posicao + 1;
  else
    -- A versão não é editável por payload do cliente.
    NEW.versao_posicao := OLD.versao_posicao;
  end if;
  return NEW;
end;
$$;
revoke all on function public.tokens_incrementar_versao_posicao() from public, anon, authenticated;

create trigger tokens_incrementar_versao_posicao
before insert or update on public.tokens
for each row execute function public.tokens_incrementar_versao_posicao();

create or replace function public.tokens_publicar_posicao_pc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    pg_catalog.jsonb_build_object(
      'id', NEW.id, 'x', NEW.x, 'y', NEW.y, 'versao_posicao', NEW.versao_posicao
    ),
    'posicao',
    'token-pc:' || NEW.id::text,
    true
  );
  return NEW;
exception when others then
  -- Broadcast é aceleração opcional. Sua indisponibilidade não deve impedir salvar a posição.
  raise warning 'broadcast de posicao de token indisponivel (%): %', SQLSTATE, SQLERRM;
  return NEW;
end;
$$;
revoke all on function public.tokens_publicar_posicao_pc() from public, anon, authenticated;

create trigger tokens_publicar_posicao_pc
after update on public.tokens
for each row
when (NEW.tipo = 'pc' and NEW.versao_posicao > OLD.versao_posicao)
execute function public.tokens_publicar_posicao_pc();

-- O SELECT do token é reavaliado no join. PCs não têm a visibilidade dinâmica de NPCs.
-- Nenhuma policy INSERT é criada: até um dono já revinculado precisa passar pelo UPDATE RLS.
create policy "authenticated recebe posicao confirmada de token pc"
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and exists (
    select 1 from public.tokens t
    where t.tipo = 'pc' and realtime.topic() = 'token-pc:' || t.id::text
  )
);
