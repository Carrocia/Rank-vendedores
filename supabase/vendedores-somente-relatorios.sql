-- Permite marcar cadastros de matriz/supervisão para que apareçam nos
-- relatórios, mas não participem dos rankings, destaques ou conquistas.
-- Execute uma vez no SQL Editor após publicar o front-end atualizado.
begin;

alter table public.vendedores
  add column if not exists participa_ranking boolean not null default true;
update public.vendedores set participa_ranking = true where participa_ranking is null;
alter table public.vendedores alter column participa_ranking set default true;
alter table public.vendedores alter column participa_ranking set not null;
grant update (participa_ranking) on table public.vendedores to authenticated;

create or replace function public.destaques_externos_globais()
returns table (
  periodo text, filial_id bigint, filial_nome text, vendedor_id bigint,
  vendedor_nome text, vendas bigint
)
language sql stable security definer set search_path = ''
as $function$
  with relogio as (
    select now() at time zone 'America/Manaus' as agora_local
  ),
  periodos as (
    select 'semana'::text as periodo,
      date_trunc('week', agora_local) at time zone 'America/Manaus' as inicio,
      (date_trunc('week', agora_local) + interval '1 week') at time zone 'America/Manaus' as fim
    from relogio
    union all
    select 'mes'::text,
      date_trunc('month', agora_local) at time zone 'America/Manaus',
      (date_trunc('month', agora_local) + interval '1 month') at time zone 'America/Manaus'
    from relogio
  ),
  totais as (
    select p.periodo, f.id as filial_id, f.nome::text as filial_nome,
      vd.id as vendedor_id, vd.nome::text as vendedor_nome, count(*)::bigint as vendas
    from periodos p
    join public.vendas v on v.data_venda >= p.inicio and v.data_venda < p.fim
    join public.vendedores vd on vd.id = v.vendedor_id
      and vd.tipo::text = 'externo'
      and vd.ativo is true
      and coalesce(vd.participa_ranking, true) is true
      and v.filial_origem_id = vd.filial_id
    join public.filiais f on f.id = vd.filial_id and f.ativo is true
    where v.fora_filial is not true
    group by p.periodo, f.id, f.nome, vd.id, vd.nome
  ),
  classificados as (
    select totais.*, row_number() over (
      partition by periodo order by vendas desc, vendedor_nome asc, filial_nome asc
    ) as posicao
    from totais
  )
  select periodo, filial_id, filial_nome, vendedor_id, vendedor_nome, vendas
  from classificados where posicao = 1
  order by case periodo when 'semana' then 1 else 2 end;
$function$;
revoke all on function public.destaques_externos_globais() from public;
grant execute on function public.destaques_externos_globais() to anon, authenticated;

-- Esta RPC pode ter assinatura anterior diferente. Recria dentro da transação,
-- como no script original de conquistas, e restaura as permissões logo abaixo.
drop function if exists public.conquistas_mensais_globais();
create function public.conquistas_mensais_globais()
returns table (
  filial_id bigint, filial_nome text, vendedor_id bigint,
  vendedor_nome text, tipo text, conquista text
)
language sql stable security definer set search_path = ''
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
    where v.data_venda >= p.inicio and v.data_venda < p.fim
      and v.filial_origem_id = vd.filial_id
      and v.fora_filial is not true
      and (vd.tipo::text = 'interno'
        or (vd.tipo::text = 'externo' and v.filial_destino_id = vd.filial_id))
    group by v.vendedor_id
  )
  select distinct on (f.id, vd.id, vd.tipo::text)
    f.id, f.nome::text, vd.id, vd.nome::text, vd.tipo::text, metas_conquista.conquista
  from public.vendedores vd
  join public.filiais f on f.id = vd.filial_id and f.ativo is true
  cross join periodo p
  left join public.metas m on m.vendedor_id = vd.id and m.mes = p.mes and m.ano = p.ano
  left join vendas_mes vm on vm.vendedor_id = vd.id
  cross join lateral (
    select 'M3'::text as conquista, m.meta_m3::numeric as meta where vd.tipo::text = 'interno'
    union all select 'M2'::text, m.meta_m2::numeric where vd.tipo::text = 'interno'
    union all select 'M1'::text, m.meta_m1::numeric where vd.tipo::text = 'interno'
    union all select 'M1'::text, 15::numeric where vd.tipo::text = 'externo' and coalesce(vm.quantidade, 0) >= 15
    union all select 'M2'::text, 14::numeric where vd.tipo::text = 'externo' and coalesce(vm.quantidade, 0) = 14
  ) as metas_conquista
  where vd.ativo is true
    and coalesce(vd.participa_ranking, true) is true
    and (vd.tipo::text = 'externo' or m.vendedor_id is not null)
    and metas_conquista.meta is not null and metas_conquista.meta > 0
    and coalesce(vm.quantidade, 0) >= metas_conquista.meta
  order by f.id, vd.id, vd.tipo::text,
    case metas_conquista.conquista when 'M1' then 3 when 'M2' then 2 else 1 end desc;
$function$;
revoke all on function public.conquistas_mensais_globais() from public;
grant execute on function public.conquistas_mensais_globais() to anon, authenticated;

commit;
notify pgrst, 'reload schema';
