-- Histórico agregado da identidade de carreira para a aba Analítica.
-- Permite preservar a trajetória após transferência entre filiais sem liberar
-- a leitura de snapshots de outras pessoas para contas regionais.

begin;

do $check$
begin
  if to_regprocedure('private.admin_tem_acesso_filial(bigint)') is null then
    raise exception 'Aplique primeiro supabase/regional-access.sql.';
  end if;
  if to_regclass('public.ranks_carreira_mensais') is null then
    raise exception 'Aplique as migrações de progressão e fechamento de ranks antes desta.';
  end if;
end;
$check$;

create or replace function public.historico_rank_carreira_analitica(
  p_carreira_pessoa_id uuid,
  p_filial_id bigint
)
returns table (
  ano integer,
  mes integer,
  rank_mensal text,
  m1_vendas boolean,
  m1_renovacoes boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para consultar este perfil.' using errcode = '42501';
  end if;

  if p_carreira_pessoa_id is null or not exists (
    select 1
    from public.vendedores v
    where v.carreira_pessoa_id = p_carreira_pessoa_id
      and v.filial_id = p_filial_id
  ) then
    raise exception 'O colaborador não pertence à filial selecionada.' using errcode = '42501';
  end if;

  return query
  select r.ano, r.mes, r.rank_mensal, r.m1_vendas, r.m1_renovacoes
  from public.ranks_carreira_mensais r
  where r.carreira_pessoa_id = p_carreira_pessoa_id
  order by r.ano, r.mes, r.filial_id;
end;
$function$;

revoke all on function public.historico_rank_carreira_analitica(uuid, bigint) from public, anon;
grant execute on function public.historico_rank_carreira_analitica(uuid, bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
