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
