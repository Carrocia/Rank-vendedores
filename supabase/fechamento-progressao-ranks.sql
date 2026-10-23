-- Fechamento de um mês de ranks depois da conferência dos últimos relatórios.
-- Preserva apenas métricas agregadas por vendedor/identidade; não copia clientes
-- nem contratos. Requer progressao-ranks-carreira.sql.

begin;

do $check$
begin
  if to_regprocedure('public.calcular_rank_mensal_filial(bigint, integer, integer)') is null
     or to_regprocedure('private.admin_tem_acesso_filial(bigint)') is null then
    raise exception 'Aplique primeiro supabase/progressao-ranks-carreira.sql e supabase/regional-access.sql.';
  end if;
end;
$check$;

alter table public.ranks_carreira_mensais
  add column if not exists filial_id bigint,
  add column if not exists vendedor_id bigint,
  add column if not exists vendedor_nome text,
  add column if not exists tipo text;

-- A migração de carreira foi aplicada sem snapshots; estes campos passam a
-- identificar o cadastro/regional que originou cada consolidado.
alter table public.ranks_carreira_mensais
  alter column filial_id set not null,
  alter column vendedor_id set not null,
  alter column vendedor_nome set not null,
  alter column tipo set not null;

alter table public.ranks_carreira_mensais
  drop constraint if exists ranks_carreira_mensais_pessoa_mes_key;
create unique index if not exists ranks_carreira_mensais_pessoa_mes_filial_uidx
  on public.ranks_carreira_mensais (carreira_pessoa_id, ano, mes, filial_id);

create table if not exists public.ranks_carreira_periodos_fechados (
  filial_id bigint not null,
  mes integer not null check (mes between 1 and 12),
  ano integer not null check (ano between 2000 and 2200),
  fechado_em timestamptz not null default now(),
  fechado_por uuid references auth.users(id) on delete set null,
  primary key (filial_id, ano, mes)
);

alter table public.ranks_carreira_periodos_fechados enable row level security;
drop policy if exists ranks_carreira_periodos_select_scope on public.ranks_carreira_periodos_fechados;
create policy ranks_carreira_periodos_select_scope
  on public.ranks_carreira_periodos_fechados for select to authenticated
  using (private.admin_tem_acesso_filial(filial_id));
revoke all on public.ranks_carreira_periodos_fechados from public, anon, authenticated;
grant select on public.ranks_carreira_periodos_fechados to authenticated;

drop policy if exists ranks_carreira_mensais_select_scope on public.ranks_carreira_mensais;
create policy ranks_carreira_mensais_select_scope
  on public.ranks_carreira_mensais for select to authenticated
  using (private.admin_tem_acesso_filial(filial_id));

-- Preserva a função viva existente com um nome interno, de forma compatível
-- com uma reexecução desta migração.
do $rename_live$
begin
  if to_regprocedure('public.calcular_rank_mensal_filial_vivo(bigint, integer, integer)') is null then
    execute 'alter function public.calcular_rank_mensal_filial(bigint, integer, integer) rename to calcular_rank_mensal_filial_vivo';
  end if;
end;
$rename_live$;

-- Aplica as regras vigentes também à implementação que alimenta o fechamento.
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
           case when va.tipo = 'interno' then coalesce(m.meta_m3, 0) else 0 end::numeric as meta_vendas_m3,
           case when va.tipo = 'interno' then coalesce(m.meta_m2, 0) else 0 end::numeric as meta_vendas_m2,
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
      case
        when m.meta_vendas_m3 > 0
         and m.meta_vendas_m3 <= m.meta_vendas_m2
         and m.meta_vendas_m2 <= m.meta_vendas then
          case
            when m.vendas < m.meta_vendas_m3 then m.vendas::numeric / m.meta_vendas_m3 * 50
            when m.vendas < m.meta_vendas_m2 and m.meta_vendas_m2 > m.meta_vendas_m3
              then 50 + (m.vendas - m.meta_vendas_m3)::numeric / (m.meta_vendas_m2 - m.meta_vendas_m3) * 20
            when m.vendas < m.meta_vendas and m.meta_vendas > m.meta_vendas_m2
              then 70 + (m.vendas - m.meta_vendas_m2)::numeric / (m.meta_vendas - m.meta_vendas_m2) * 30
            else m.vendas::numeric / m.meta_vendas * 100
          end
        else m.vendas::numeric / nullif(m.meta_vendas, 0) * 100
      end as pontos_vendas,
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
           when e.pontos_vendas + e.bonus_renovacoes >= 115 and e.ticket_medio_valido >= 130 then 'S'
           when e.pontos_vendas + e.bonus_renovacoes >= 100 and e.ticket_medio_valido >= 120 then 'A'
           when e.pontos_vendas + e.bonus_renovacoes >= 85 and e.ticket_medio_valido >= 115 then 'B'
           when e.pontos_vendas + e.bonus_renovacoes >= 70 and e.ticket_medio_valido >= 110 then 'C'
           when e.pontos_vendas + e.bonus_renovacoes >= 50 and e.ticket_medio_valido >= 105 then 'D'
           else null
         end::text as rank_mensal,
         e.pode_classificar as elegivel,
         case when e.somente_externo then e.vendas > 14 else e.meta_vendas > 0 and e.vendas >= e.meta_vendas end as m1_vendas,
         case when e.somente_externo then false else e.meta_renovacoes > 0 and e.renovacoes_reais >= e.meta_renovacoes end as m1_renovacoes
  from elegibilidade e
  order by e.tipo, e.vendedor_nome;
end;
$function$;


create or replace function public.calcular_rank_mensal_filial(
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
    raise exception 'Sem permissão para consultar ranks desta regional.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.ranks_carreira_periodos_fechados f
    where f.filial_id = p_filial_id and f.mes = p_mes and f.ano = p_ano
  ) then
    return query
    select r.carreira_pessoa_id, r.vendedor_id, r.vendedor_nome, r.tipo,
           r.vendas::bigint, r.valor_vendas::numeric, r.meta_vendas::numeric,
           r.renovacoes::bigint, r.meta_renovacoes::numeric,
           r.ticket_medio::numeric, r.ticket_referencia::numeric,
           r.rank_mensal::text, r.elegivel, r.m1_vendas, r.m1_renovacoes
    from public.ranks_carreira_mensais r
    where r.filial_id = p_filial_id and r.mes = p_mes and r.ano = p_ano
    order by r.tipo, r.vendedor_nome;
    return;
  end if;

  return query select * from public.calcular_rank_mensal_filial_vivo(p_filial_id, p_mes, p_ano);
end;
$function$;

create or replace function public.consolidar_rank_mensal_filial(
  p_filial_id bigint,
  p_mes integer,
  p_ano integer
)
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare
  v_inicio date;
  v_fechamento_disponivel date;
  v_quantidade integer := 0;
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para fechar ranks desta regional.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  v_fechamento_disponivel := (v_inicio + interval '1 month' + interval '7 days')::date;
  if v_inicio < date '2026-10-01' then
    raise exception 'O projeto de carreira começa em outubro de 2026; não há meses anteriores para fechar.' using errcode = '22023';
  end if;
  if v_inicio >= date_trunc('month', timezone('America/Manaus', now()))::date then
    raise exception 'O mês vigente ou um mês futuro não pode ser fechado.' using errcode = '22023';
  end if;
  if timezone('America/Manaus', now())::date < v_fechamento_disponivel then
    raise exception 'Feche o mês depois da primeira semana, após importar os últimos relatórios.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.ranks_carreira_periodos_fechados f
    where f.filial_id = p_filial_id and f.mes = p_mes and f.ano = p_ano
  ) then
    return 0;
  end if;

  insert into public.ranks_carreira_mensais (
    carreira_pessoa_id, filial_id, vendedor_id, vendedor_nome, tipo,
    mes, ano, vendas, valor_vendas, meta_vendas, renovacoes, meta_renovacoes,
    ticket_medio, ticket_referencia, rank_mensal, elegivel,
    m1_vendas, m1_renovacoes, consolidado_em, atualizado_em
  )
  select r.carreira_pessoa_id, p_filial_id, r.vendedor_id, r.vendedor_nome, r.tipo,
         p_mes, p_ano, r.vendas, r.valor_vendas, r.meta_vendas, r.renovacoes,
         r.meta_renovacoes, r.ticket_medio, r.ticket_referencia, r.rank_mensal,
         r.elegivel, r.m1_vendas, r.m1_renovacoes, now(), now()
  from public.calcular_rank_mensal_filial_vivo(p_filial_id, p_mes, p_ano) r;
  get diagnostics v_quantidade = row_count;

  insert into public.ranks_carreira_periodos_fechados (filial_id, mes, ano, fechado_por)
  values (p_filial_id, p_mes, p_ano, auth.uid());
  return v_quantidade;
end;
$function$;

create or replace function public.reabrir_rank_mensal_filial(
  p_filial_id bigint,
  p_mes integer,
  p_ano integer
)
returns void
language plpgsql security definer set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.admin_e_superadmin() then
    raise exception 'Somente o superadministrador pode reabrir um mês consolidado.' using errcode = '42501';
  end if;
  delete from public.ranks_carreira_periodos_fechados
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano;
  delete from public.ranks_carreira_mensais
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano;
end;
$function$;

revoke all on function public.calcular_rank_mensal_filial_vivo(bigint, integer, integer) from public, anon;
grant execute on function public.calcular_rank_mensal_filial_vivo(bigint, integer, integer) to authenticated;
revoke all on function public.calcular_rank_mensal_filial(bigint, integer, integer) from public, anon;
grant execute on function public.calcular_rank_mensal_filial(bigint, integer, integer) to authenticated;
revoke all on function public.consolidar_rank_mensal_filial(bigint, integer, integer) from public, anon;
grant execute on function public.consolidar_rank_mensal_filial(bigint, integer, integer) to authenticated;
revoke all on function public.reabrir_rank_mensal_filial(bigint, integer, integer) from public, anon;
grant execute on function public.reabrir_rank_mensal_filial(bigint, integer, integer) to authenticated;

commit;
notify pgrst, 'reload schema';
