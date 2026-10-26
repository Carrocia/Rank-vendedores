-- Exibe somente metas atingidas no mês atual, consolidadas entre filiais.
-- Contagens e alvos não são retornados pela RPC para não expor os números
-- individuais de vendas aos clientes públicos do painel.
drop function if exists public.conquistas_mensais_globais();

create function public.conquistas_mensais_globais()
returns table (
  filial_id bigint,
  filial_nome text,
  vendedor_id bigint,
  vendedor_nome text,
  tipo text,
  conquista text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with periodo as (
    select
      date_trunc('month', now() at time zone 'America/Manaus') at time zone 'America/Manaus' as inicio,
      (date_trunc('month', now() at time zone 'America/Manaus') + interval '1 month') at time zone 'America/Manaus' as fim,
      extract(month from now() at time zone 'America/Manaus')::integer as mes,
      extract(year from now() at time zone 'America/Manaus')::integer as ano
  ),
  vendas_mes as (
    select v.vendedor_id, count(*)::bigint as quantidade
    from public.vendas v
    join public.vendedores vd on vd.id = v.vendedor_id
    cross join periodo p
    where v.data_venda >= p.inicio
      and v.data_venda < p.fim
      and v.filial_origem_id = vd.filial_id
      and v.fora_filial is not true
      and (
        vd.tipo::text = 'interno'
        or (vd.tipo::text = 'externo' and v.filial_destino_id = vd.filial_id)
      )
    group by v.vendedor_id
  ), conquistas_candidatas as (
    select
      f.id as filial_id,
      f.nome::text as filial_nome,
      vd.id as vendedor_id,
      vd.nome::text as vendedor_nome,
      vd.tipo::text as tipo,
      metas_conquista.conquista,
      case metas_conquista.conquista when 'M1' then 3 when 'M2' then 2 else 1 end as prioridade
    from public.vendedores vd
    join public.filiais f on f.id = vd.filial_id and f.ativo is true
    cross join periodo p
    left join public.metas m
      on m.vendedor_id = vd.id
     and m.mes = p.mes
     and m.ano = p.ano
    left join vendas_mes vm on vm.vendedor_id = vd.id
    cross join lateral (
      select 'M3'::text as conquista, m.meta_m3::numeric as meta where vd.tipo::text = 'interno'
      union all
      select 'M2'::text, m.meta_m2::numeric where vd.tipo::text = 'interno'
      union all
      select 'M1'::text, m.meta_m1::numeric where vd.tipo::text = 'interno'
      union all
      select 'M1'::text, 15::numeric
        where vd.tipo::text = 'externo' and coalesce(vm.quantidade, 0) >= 15
      union all
      select 'M2'::text, 14::numeric
        where vd.tipo::text = 'externo' and coalesce(vm.quantidade, 0) = 14
    ) as metas_conquista
    where vd.ativo is true
      and coalesce(vd.participa_ranking, true) is true
      and (vd.tipo::text = 'externo' or m.vendedor_id is not null)
      and metas_conquista.meta is not null
      and metas_conquista.meta > 0
      and coalesce(vm.quantidade, 0) >= metas_conquista.meta
  ), conquistas_priorizadas as (
    select *, row_number() over (
      partition by filial_id, vendedor_id, tipo order by prioridade desc
    ) as ordem
    from conquistas_candidatas
  )
  select
    filial_id,
    filial_nome,
    vendedor_id,
    vendedor_nome,
    tipo,
    conquista
  from conquistas_priorizadas
  where ordem = 1
  order by filial_nome, vendedor_nome;
$function$;

revoke all on function public.conquistas_mensais_globais() from public;
grant execute on function public.conquistas_mensais_globais() to anon, authenticated;
