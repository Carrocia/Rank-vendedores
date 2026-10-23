-- Atualiza o cálculo mensal vivo sem alterar snapshots de meses fechados.
begin;

do $check$
begin
  if to_regprocedure('public.calcular_rank_mensal_filial_vivo(bigint, integer, integer)') is null then
    raise exception 'Aplique primeiro supabase/fechamento-progressao-ranks.sql.';
  end if;
end;
$check$;

create or replace function public.calcular_rank_mensal_filial_vivo(
  p_filial_id bigint,
  p_mes integer,
  p_ano integer
)
returns table (
  carreira_pessoa_id uuid,
  vendedor_id bigint,
  vendedor_nome text,
  tipo text,
  vendas bigint,
  valor_vendas numeric,
  meta_vendas numeric,
  renovacoes bigint,
  meta_renovacoes numeric,
  ticket_medio numeric,
  ticket_referencia numeric,
  rank_mensal text,
  elegivel boolean,
  m1_vendas boolean,
  m1_renovacoes boolean
)
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para calcular ranks desta regional.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;

  return query
  with vendedores_alvo as (
    select v.id, v.carreira_pessoa_id, v.nome, v.tipo, v.filial_id, v.ativo
    from public.vendedores v
    where v.filial_id = p_filial_id
      and v.ativo is true
      and coalesce(v.participa_ranking, true) is true
  ), pessoas_alvo as (
    select distinct va.carreira_pessoa_id from vendedores_alvo va
  ), vendedores_pessoa as (
    select v.id, v.carreira_pessoa_id, v.tipo, v.filial_id, v.ativo
    from public.vendedores v
    join pessoas_alvo pa on pa.carreira_pessoa_id = v.carreira_pessoa_id
  ), vendas_pessoa as (
    select vp.carreira_pessoa_id,
           count(sa.vendedor_id)::bigint as quantidade,
           coalesce(sum(sa.valor_total), 0)::numeric as valor
    from vendedores_pessoa vp
    left join public.vendas_admin sa
      on sa.vendedor_id = vp.id
     and sa.data_venda >= make_date(p_ano, p_mes, 1)
     and sa.data_venda < (make_date(p_ano, p_mes, 1) + interval '1 month')
     and (
       vp.tipo <> 'externo'
       or (
         sa.fora_filial is not true
         and sa.filial_origem_id = vp.filial_id
         and sa.filial_destino_id = vp.filial_id
       )
     )
    group by vp.carreira_pessoa_id
  ), renovacoes_pessoa as (
    select vp.carreira_pessoa_id, coalesce(sum(rm.quantidade), 0)::bigint as quantidade
    from vendedores_pessoa vp
    left join public.renovacoes_mensais rm
      on rm.vendedor_id = vp.id and rm.filial_id = vp.filial_id
     and rm.mes = p_mes and rm.ano = p_ano
    group by vp.carreira_pessoa_id
  ), filiais_alvo as (
    select distinct va.filial_id from vendedores_alvo va
  ), ticket_referencia_filial as (
    select fa.filial_id,
           (sum(sa.valor_total) / nullif(count(sa.vendedor_id), 0))::numeric as ticket
    from filiais_alvo fa
    left join public.vendas_admin sa
      on sa.filial_origem_id = fa.filial_id
     and sa.filial_destino_id = fa.filial_id
     and sa.fora_filial is not true
     and sa.data_venda >= make_date(p_ano, p_mes, 1)
     and sa.data_venda < (make_date(p_ano, p_mes, 1) + interval '1 month')
    group by fa.filial_id
  ), metricas as (
    select va.carreira_pessoa_id,
           va.id as vendedor_id,
           va.nome as vendedor_nome,
           va.tipo,
           coalesce(vp.quantidade, 0)::bigint as vendas,
           coalesce(vp.valor, 0)::numeric as valor_vendas,
           case
             when va.tipo = 'interno' then coalesce(m.meta_m1, 0)
             when va.ativo is true or m.id is not null then coalesce(m.meta_vendas, 0)
             else 0
           end::numeric as meta_vendas,
           case when va.tipo = 'externo' then 0 else coalesce(rp.quantidade, 0) end::bigint as renovacoes,
           case when va.tipo = 'externo' then null else coalesce(mr.meta_m1, 0) end::numeric as meta_renovacoes,
           case when va.tipo = 'externo' then 0 else coalesce(mr.meta_m3, 0) end::numeric as meta_renovacoes_m3,
           case when va.tipo = 'externo' then 0 else coalesce(mr.meta_m2, 0) end::numeric as meta_renovacoes_m2,
           case when va.tipo = 'externo' then 0 else coalesce(mr.meta_m1, 0) end::numeric as meta_renovacoes_m1,
           case when coalesce(vp.quantidade, 0) > 0 then vp.valor / vp.quantidade else 0 end::numeric as ticket_medio,
           tr.ticket as ticket_referencia,
           (va.tipo = 'externo') as somente_externo,
           coalesce(rp.quantidade, 0)::bigint as renovacoes_reais
    from vendedores_alvo va
    left join vendas_pessoa vp on vp.carreira_pessoa_id = va.carreira_pessoa_id
    left join renovacoes_pessoa rp on rp.carreira_pessoa_id = va.carreira_pessoa_id
    left join ticket_referencia_filial tr on tr.filial_id = va.filial_id
    left join public.metas m
      on m.vendedor_id = va.id and m.mes = p_mes and m.ano = p_ano
    left join public.metas_renovacao_individual mr
      on mr.vendedor_id = va.id and mr.filial_id = va.filial_id
     and mr.mes = p_mes and mr.ano = p_ano
  ), elegibilidade as (
    select m.*,
      (coalesce(m.meta_vendas, 0) > 0) as pode_classificar,
      case when m.meta_vendas > 0 then m.vendas::numeric / m.meta_vendas else 0 end as pct_vendas,
      case when m.meta_renovacoes > 0 then m.renovacoes_reais::numeric / m.meta_renovacoes else 0 end as pct_renovacoes,
      case
        when m.somente_externo or coalesce(m.meta_renovacoes_m1, 0) <= 0 then 0::numeric
        when m.meta_renovacoes_m3 > 0
         and m.meta_renovacoes_m3 <= m.meta_renovacoes_m2
         and m.meta_renovacoes_m2 <= m.meta_renovacoes_m1 then
          case
            when m.renovacoes_reais < m.meta_renovacoes_m3 then 0::numeric
            when m.renovacoes_reais < m.meta_renovacoes_m2 and m.meta_renovacoes_m2 > m.meta_renovacoes_m3
              then 5 + (m.renovacoes_reais - m.meta_renovacoes_m3)::numeric / (m.meta_renovacoes_m2 - m.meta_renovacoes_m3) * 5
            when m.renovacoes_reais < m.meta_renovacoes_m1 and m.meta_renovacoes_m1 > m.meta_renovacoes_m2
              then 10 + (m.renovacoes_reais - m.meta_renovacoes_m2)::numeric / (m.meta_renovacoes_m1 - m.meta_renovacoes_m2) * 5
            else 15::numeric
          end
        else least(15::numeric, greatest(0::numeric, m.renovacoes_reais::numeric / m.meta_renovacoes_m1 * 15))
      end as bonus_renovacoes,
      coalesce(m.ticket_medio, 0)::numeric as ticket_medio_valido
    from metricas m
  )
  select e.carreira_pessoa_id,
         e.vendedor_id,
         e.vendedor_nome::text,
         e.tipo::text,
         e.vendas,
         e.valor_vendas,
         e.meta_vendas,
         e.renovacoes,
         e.meta_renovacoes,
         e.ticket_medio,
         e.ticket_referencia,
         case
           when not e.pode_classificar then null
           when e.pct_vendas * 100 + e.bonus_renovacoes >= 115 and e.ticket_medio_valido >= 130 then 'S'
           when e.pct_vendas * 100 + e.bonus_renovacoes >= 100 and e.ticket_medio_valido >= 120 then 'A'
           when e.pct_vendas * 100 + e.bonus_renovacoes >= 85 and e.ticket_medio_valido >= 115 then 'B'
           when e.pct_vendas * 100 + e.bonus_renovacoes >= 70 and e.ticket_medio_valido >= 110 then 'C'
           when e.pct_vendas * 100 + e.bonus_renovacoes >= 50 and e.ticket_medio_valido >= 105 then 'D'
           else null
         end::text as rank_mensal,
         e.pode_classificar as elegivel,
         case when e.somente_externo then e.vendas > 14 else e.meta_vendas > 0 and e.vendas >= e.meta_vendas end as m1_vendas,
         case when e.somente_externo then false else e.meta_renovacoes > 0 and e.renovacoes_reais >= e.meta_renovacoes end as m1_renovacoes
  from elegibilidade e
  order by e.tipo, e.vendedor_nome;
end;
$function$;

revoke all on function public.calcular_rank_mensal_filial_vivo(bigint, integer, integer) from public, anon;
grant execute on function public.calcular_rank_mensal_filial_vivo(bigint, integer, integer) to authenticated;
commit;
