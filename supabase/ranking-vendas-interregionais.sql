-- Atribui vendas entre regionais à filial do vendedor nos dados semanais
-- nos indicadores semanais da origem e na meta individual mensal dos internos.
-- A função devolve agregados, sem expor cliente, contrato ou observação.

drop function if exists public.ranking_vendas_externos_origem(bigint, timestamptz, timestamptz);
drop function if exists public.ranking_vendas_por_origem(bigint, timestamptz, timestamptz);

create function public.ranking_vendas_por_origem(
  p_filial_origem_id bigint,
  p_inicio timestamptz,
  p_fim timestamptz
)
returns table (
  vendedor_id bigint,
  tipo text,
  dia date,
  vendas bigint,
  valor numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_filial_origem_id is null
     or p_inicio is null
     or p_fim is null
     or p_fim <= p_inicio
     or p_fim > p_inicio + interval '32 days' then
    raise exception 'Período inválido para consulta de desempenho regional.'
      using errcode = '22023';
  end if;

  -- O ranking público pode consultar dados agregados. Sessões autenticadas
  -- só podem consultar a própria regional (superadmins mantêm acesso global).
  if coalesce(auth.role(), 'anon') <> 'anon'
     and not private.admin_tem_acesso_filial(p_filial_origem_id) then
    raise exception 'Sem acesso à regional informada.'
      using errcode = '42501';
  end if;

  return query
  select v.vendedor_id,
         vendedor.tipo::text,
         (v.data_venda::timestamptz at time zone 'America/Manaus')::date as dia,
         count(*)::bigint as vendas,
         coalesce(sum(v.valor), 0)::numeric as valor
  from public.vendas v
  join public.vendedores vendedor on vendedor.id = v.vendedor_id
  where v.filial_origem_id = p_filial_origem_id
    and v.filial_destino_id is not null
    and v.filial_destino_id <> p_filial_origem_id
    and v.data_venda >= p_inicio
    and v.data_venda < p_fim
    and v.fora_filial is not true
  group by v.vendedor_id,
           vendedor.tipo,
           (v.data_venda::timestamptz at time zone 'America/Manaus')::date;
end;
$function$;

revoke all on function public.ranking_vendas_por_origem(bigint, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.ranking_vendas_por_origem(bigint, timestamptz, timestamptz)
  to anon, authenticated;
