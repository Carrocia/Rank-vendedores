begin;

-- O fechamento manual pode ser feito assim que o mês anterior estiver pronto.
-- O job automático roda diariamente às 08:15 no horário de Manaus e só fecha
-- o mês anterior a partir do dia 8, dando uma semana para os relatórios finais.

-- Bancos que criaram a tabela antes desses indicadores precisam recebê-los
-- explicitamente: CREATE TABLE IF NOT EXISTS não atualiza tabelas existentes.
alter table public.ranks_carreira_mensais
  add column if not exists m1_vendas boolean not null default false,
  add column if not exists m1_renovacoes boolean not null default false;

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
  v_quantidade integer := 0;
begin
  if auth.uid() is null then
    if session_user <> 'postgres' then
      raise exception 'Sem permissão para fechar ranks desta regional.' using errcode = '42501';
    end if;
  elsif not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para fechar ranks desta regional.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;

  v_inicio := make_date(p_ano, p_mes, 1);
  if v_inicio < date '2026-10-01' then
    raise exception 'O projeto de carreira começa em outubro de 2026; não há meses anteriores para fechar.' using errcode = '22023';
  end if;
  if v_inicio >= date_trunc('month', timezone('America/Manaus', now()))::date then
    raise exception 'O mês vigente ou um mês futuro não pode ser fechado.' using errcode = '22023';
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

create or replace function public.consolidar_xp_comercial_filial(p_filial_id bigint, p_mes integer, p_ano integer)
returns integer language plpgsql security definer set search_path = '' as $function$
declare
  v_inicio date;
  v_vendedor record;
  v_fechados integer := 0;
begin
  if auth.uid() is null then
    if session_user <> 'postgres' then
      raise exception 'Sem permissão para consolidar XP desta filial.' using errcode = '42501';
    end if;
  elsif not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para consolidar XP desta filial.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 then
    raise exception 'Mês ou ano inválido.' using errcode = '22023';
  end if;
  v_inicio := make_date(p_ano, p_mes, 1);
  if v_inicio < date '2026-10-01'
     or v_inicio >= date_trunc('month', timezone('America/Manaus', now()))::date then
    raise exception 'O mês vigente, futuro ou anterior ao início do projeto não pode ser consolidado.' using errcode = '22023';
  end if;
  for v_vendedor in
    select min(v.id) as vendedor_id from public.vendedores v
    where v.filial_id = p_filial_id and v.carreira_pessoa_id is not null
      and (v.ativo is true
        or exists (
          select 1 from public.vendas_admin sa
          where sa.vendedor_id = v.id
            and sa.data_venda >= v_inicio
            and sa.data_venda < (v_inicio + interval '1 month')
        )
        or exists (
          select 1 from public.renovacoes_mensais rm
          where rm.vendedor_id = v.id and rm.filial_id = v.filial_id
            and rm.mes = p_mes and rm.ano = p_ano
        ))
    group by v.carreira_pessoa_id
  loop
    perform * from public.calcular_xp_comercial_vendedor(v_vendedor.vendedor_id, p_mes, p_ano);
    update public.xp_comercial_periodos p
      set status = 'fechado', fechado_em = coalesce(p.fechado_em, now()), fechado_por = coalesce(p.fechado_por, auth.uid())
      where p.carreira_pessoa_id = (select v.carreira_pessoa_id from public.vendedores v where v.id = v_vendedor.vendedor_id)
        and p.mes = p_mes and p.ano = p_ano and p.status <> 'fechado';
    v_fechados := v_fechados + 1;
  end loop;
  return v_fechados;
end;
$function$;

revoke all on function public.consolidar_rank_mensal_filial(bigint, integer, integer) from public, anon;
grant execute on function public.consolidar_rank_mensal_filial(bigint, integer, integer) to authenticated;
revoke all on function public.consolidar_xp_comercial_filial(bigint, integer, integer) from public, anon;
grant execute on function public.consolidar_xp_comercial_filial(bigint, integer, integer) to authenticated;

create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.auto_consolidar_rank_xp_mes_anterior()
returns jsonb
language plpgsql security definer set search_path = ''
as $function$
declare
  v_hoje date := timezone('America/Manaus', now())::date;
  v_mes_inicio date;
  v_mes integer;
  v_ano integer;
  v_filial record;
  v_rank integer;
  v_xp integer;
  v_fechamentos jsonb := '[]'::jsonb;
begin
  if session_user <> 'postgres' then
    raise exception 'Esta rotina só pode ser executada pelo agendador interno.' using errcode = '42501';
  end if;
  if v_hoje < (date_trunc('month', v_hoje)::date + 7) then
    return jsonb_build_object('status', 'aguardando_primeira_semana', 'data', v_hoje);
  end if;

  v_mes_inicio := (date_trunc('month', v_hoje)::date - interval '1 month')::date;
  if v_mes_inicio < date '2026-10-01' then
    return jsonb_build_object('status', 'fora_do_periodo_do_projeto', 'mes', v_mes_inicio);
  end if;
  v_mes := extract(month from v_mes_inicio)::integer;
  v_ano := extract(year from v_mes_inicio)::integer;

  for v_filial in
    select distinct v.filial_id
    from public.vendedores v
    where v.filial_id is not null
    order by v.filial_id
  loop
    begin
      v_rank := public.consolidar_rank_mensal_filial(v_filial.filial_id, v_mes, v_ano);
      v_xp := public.consolidar_xp_comercial_filial(v_filial.filial_id, v_mes, v_ano);
      v_fechamentos := v_fechamentos || jsonb_build_array(jsonb_build_object(
        'filial_id', v_filial.filial_id,
        'ranks', v_rank,
        'periodos_xp', v_xp
      ));
    exception when others then
      raise warning 'Falha na consolidação automática da filial % para %/%: %', v_filial.filial_id, v_mes, v_ano, sqlerrm;
      v_fechamentos := v_fechamentos || jsonb_build_array(jsonb_build_object(
        'filial_id', v_filial.filial_id,
        'erro', sqlerrm
      ));
    end;
  end loop;

  return jsonb_build_object('status', 'processado', 'mes', v_mes_inicio, 'filiais', v_fechamentos);
end;
$function$;

revoke all on function private.auto_consolidar_rank_xp_mes_anterior() from public, anon, authenticated;
grant execute on function private.auto_consolidar_rank_xp_mes_anterior() to postgres;

do $schedule$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'uni-close-monthly-rank-xp'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
  perform cron.schedule(
    'uni-close-monthly-rank-xp',
    '15 12 * * *',
    'select private.auto_consolidar_rank_xp_mes_anterior()'
  );
end;
$schedule$;

commit;
notify pgrst, 'reload schema';
