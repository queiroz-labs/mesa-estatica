-- Troca de ficha em uma transação: somente a Edge autenticada usa esta RPC.
-- Não altera dados existentes ao instalar, RLS, ownership antigo ou índices.
-- SECURITY INVOKER: usa os privilégios já existentes de service_role, sem elevar
-- o chamador. PUBLIC/anon/authenticated não podem executar a função.
begin;

create function public.vincular_jogador_atomico(p_owner_token uuid, p_auth_uid uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_auth_uid_anterior uuid;
begin
  if p_owner_token is null or p_auth_uid is null then
    raise exception 'parametros de vinculo ausentes' using errcode = '22004';
  end if;

  -- Trava transacional global apenas deste fluxo. Trava por identidade não cobre
  -- trocas cruzadas de duas fichas. Não há espera/rede dentro da seção crítica.
  perform pg_catalog.pg_advisory_xact_lock(723001, 1);

  select id, auth_uid into v_id, v_auth_uid_anterior
    from public.characters_privado
    where owner_token = p_owner_token
    for update;

  -- Não revoga a ficha atual por causa de um link inválido.
  if not found then
    return null;
  end if;

  update public.characters_privado
    set auth_uid = null
    where auth_uid = p_auth_uid and id <> v_id;

  update public.characters_privado
    set auth_uid = p_auth_uid
    where id = v_id;

  -- Mantém o contrato anterior: indisponibilidade da auditoria não bloqueia a
  -- troca de aparelho. O sub-bloco reverte somente a tentativa de inserir o log.
  begin
    insert into public.vinculo_jogador_log
      (character_id, auth_uid_anterior, auth_uid_novo)
      values (v_id, v_auth_uid_anterior, p_auth_uid);
  exception when others then
    null;
  end;

  return v_id;
end;
$$;

revoke all on function public.vincular_jogador_atomico(uuid, uuid) from public, anon, authenticated;
grant execute on function public.vincular_jogador_atomico(uuid, uuid) to service_role;

commit;
