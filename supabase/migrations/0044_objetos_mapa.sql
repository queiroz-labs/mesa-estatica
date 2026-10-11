-- Preparada localmente; NÃO aplicada. Mantém as policies existentes (ocultação apenas visual).
alter table public.mapas_biblioteca
  add column objetos jsonb not null default '[]'::jsonb,
  add column objetos_revisao bigint not null default 0;

create or replace function public.salvar_objetos_mapa(p_mapa_id uuid, p_revisao bigint, p_objetos jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare atual public.mapas_biblioteca%rowtype; item jsonb; nova_revisao bigint;
begin
  if not public.is_gm() then raise exception 'somente mestre' using errcode = '42501'; end if;
  if p_objetos is null or jsonb_typeof(p_objetos) <> 'array' then raise exception 'lista de objetos inválida'; end if;
  if jsonb_array_length(p_objetos) > 40 or octet_length(p_objetos::text) > 131072 then raise exception 'lista de objetos muito grande'; end if;
  for item in select value from jsonb_array_elements(p_objetos) loop
    if jsonb_typeof(item) <> 'object'
      or not (item ?& array['id','nome','imagemUrl','imagemPath','x','y','largura','altura','visivel'])
      or jsonb_typeof(item->'id') <> 'string' or length(item->>'id') not between 1 and 100
      or jsonb_typeof(item->'nome') <> 'string' or length(item->>'nome') > 80
      or jsonb_typeof(item->'imagemUrl') <> 'string' or length(item->>'imagemUrl') > 2048 or (item->>'imagemUrl') !~ '^https?://'
      or jsonb_typeof(item->'imagemPath') <> 'string' or length(item->>'imagemPath') > 500
      or jsonb_typeof(item->'visivel') <> 'boolean'
      or jsonb_typeof(item->'x') <> 'number' or jsonb_typeof(item->'y') <> 'number'
      or jsonb_typeof(item->'largura') <> 'number' or jsonb_typeof(item->'altura') <> 'number'
    then raise exception 'objeto inválido'; end if;
    if (item->>'x')::numeric < 0 or (item->>'y')::numeric < 0
      or (item->>'largura')::numeric < .01 or (item->>'altura')::numeric < .01
      or (item->>'x')::numeric + (item->>'largura')::numeric > 1.000001
      or (item->>'y')::numeric + (item->>'altura')::numeric > 1.000001
    then raise exception 'posição inválida'; end if;
  end loop;
  if (select count(distinct value->>'id') from jsonb_array_elements(p_objetos)) <> jsonb_array_length(p_objetos)
  then raise exception 'ids duplicados'; end if;
  select * into atual from public.mapas_biblioteca where id = p_mapa_id for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'ausente'); end if;
  -- Retry após resposta perdida é idempotente; nunca duplica objetos.
  if atual.objetos = p_objetos then return jsonb_build_object('ok', true, 'revisao', atual.objetos_revisao); end if;
  if p_revisao is null or atual.objetos_revisao <> p_revisao
  then return jsonb_build_object('ok', false, 'motivo', 'conflito'); end if;
  update public.mapas_biblioteca set objetos = p_objetos, objetos_revisao = objetos_revisao + 1
    where id = p_mapa_id returning objetos_revisao into nova_revisao;
  return jsonb_build_object('ok', true, 'revisao', nova_revisao);
end;
$$;
-- Supabase pode conceder EXECUTE diretamente por default ACL; PUBLIC sozinho não basta.
revoke all on function public.salvar_objetos_mapa(uuid, bigint, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.salvar_objetos_mapa(uuid, bigint, jsonb) to authenticated;
