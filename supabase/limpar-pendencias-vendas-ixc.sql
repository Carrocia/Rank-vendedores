-- Permite ao administrador remover do painel as pendências selecionadas,
-- marcando-as como válidas sem apagar nem alterar as vendas.
-- Execute uma vez no SQL Editor do Supabase antes de usar o botão.

create or replace function public.resolver_conferencias_ixc_lote_validar(
  p_pendencia_ids bigint[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ids bigint[];
  v_afetadas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar no painel administrativo.';
  end if;

  select coalesce(array_agg(distinct x), array[]::bigint[])
    into v_ids
  from unnest(coalesce(p_pendencia_ids, array[]::bigint[])) x
  where x is not null;

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  if exists (
    select 1
    from public.vendas_conferencia_ixc c
    where c.id = any(v_ids)
      and private.admin_tem_acesso_filial(c.filial_id) is not true
  ) then
    raise exception 'Sua conta não tem acesso a todas as pendências selecionadas.';
  end if;

  update public.vendas_conferencia_ixc c
  set situacao = 'validada',
      resolvido_em = now(),
      resolvido_por = auth.uid()
  where c.id = any(v_ids)
    and c.situacao = 'pendente'
    and private.admin_tem_acesso_filial(c.filial_id) is true;

  get diagnostics v_afetadas = row_count;
  return v_afetadas;
end;
$function$;

revoke all on function public.resolver_conferencias_ixc_lote_validar(bigint[]) from public, anon;
grant execute on function public.resolver_conferencias_ixc_lote_validar(bigint[]) to authenticated;
