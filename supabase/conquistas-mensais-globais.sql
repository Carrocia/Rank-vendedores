-- Exibe somente metas individuais atingidas no mês atual, consolidadas
-- entre todas as filiais. A função retorna apenas campos usados nos cards.
create or replace function public.conquistas_mensais_globais()
returns table (
  filial_id bigint,
  filial_nome text,
  vendedor_id bigint,
  vendedor_nome text,
  tipo text,
  conquista text,
  vendas bigint,
  meta numeric
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
  )
  select
    f.id,
    f.nome::text,
    vd.id,
    vd.nome::text,
    vd.tipo::text,
    metas_conquista.conquista,
    coalesce(vm.quantidade, 0)::bigint,
    metas_conquista.meta
  from public.vendedores vd
  join public.filiais f on f.id = vd.filial_id and f.ativo is true
  join public.metas m on m.vendedor_id = vd.id
  cross join periodo p
  left join vendas_mes vm on vm.vendedor_id = vd.id
  cross join lateral (
    select 'M3'::text as conquista, m.meta_m3::numeric as meta where vd.tipo::text = 'interno'
    union all
    select 'M2'::text, m.meta_m2::numeric where vd.tipo::text = 'interno'
    union all
    select 'M1'::text, m.meta_m1::numeric where vd.tipo::text = 'interno'
    union all
    select 'Meta de vendas'::text, m.meta_vendas::numeric where vd.tipo::text = 'externo'
  ) as metas_conquista
  where vd.ativo is true
    and m.mes = p.mes
    and m.ano = p.ano
    and metas_conquista.meta is not null
    and metas_conquista.meta > 0
    and coalesce(vm.quantidade, 0) >= metas_conquista.meta
  order by f.nome, coalesce(vm.quantidade, 0) desc, vd.nome, metas_conquista.meta;
$function$;

revoke all on function public.conquistas_mensais_globais() from public;
grant execute on function public.conquistas_mensais_globais() to anon, authenticated;
