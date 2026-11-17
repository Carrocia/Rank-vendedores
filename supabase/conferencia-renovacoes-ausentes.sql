-- Confere cada relatório mensal completo de renovações contra os registros já
-- importados. Ausências entram na fila de revisão; os totais não são reduzidos.
-- Execute este arquivo no SQL Editor do Supabase antes de usar a conferência.

begin;

alter table public.renovacoes_registros
  add column if not exists ausente_ultimo_relatorio boolean not null default false,
  add column if not exists motivo_conferencia text;

update public.renovacoes_registros
set motivo_conferencia = 'plano_valor'
where conferencia_pendente = true and motivo_conferencia is null;

create or replace function public.importar_relatorio_renovacao_com_conferencia(
  p_filial_id bigint,
  p_mes integer,
  p_ano integer,
  p_arquivo text,
  p_linhas jsonb,
  p_contratos_relatorio text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  linhas_inseridas integer;
  contratos text[];
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para atualizar renovações desta filial.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200
     or p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Mês, ano ou linhas do relatório inválidos.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct regexp_replace(trim(x), '\s+', '', 'g')), array[]::text[])
    into contratos
  from unnest(coalesce(p_contratos_relatorio, array[]::text[])) x
  where nullif(trim(x), '') is not null;
  if cardinality(contratos) = 0 then
    raise exception 'O relatório completo precisa conter ao menos um contrato válido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(p_filial_id::integer, p_ano * 12 + p_mes);

  if exists (
    select 1
    from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
    left join public.vendedores v on v.id = r.vendedor_id
    where v.id is null or nullif(trim(r.contrato), '') is null
      or nullif(trim(r.cliente), '') is null or nullif(trim(r.plano), '') is null
      or r.valor is null or r.valor < 0 or r.data is null
      or r.conferencia_pendente is null
      or (r.plano_id is not null and not exists (select 1 from public.planos p where p.id = r.plano_id))
      or extract(month from r.data)::integer <> p_mes or extract(year from r.data)::integer <> p_ano
  ) then
    raise exception 'O relatório contém dados inválidos ou data fora do mês.' using errcode = '22023';
  end if;

  -- Se uma renovação reaparecer no relatório mais recente, sai da fila de
  -- ausência. Pendências independentes de plano ou valor continuam abertas.
  update public.renovacoes_registros r
  set ausente_ultimo_relatorio = false,
      conferencia_pendente = case when r.motivo_conferencia = 'plano_valor' then true else false end,
      motivo_conferencia = case when r.motivo_conferencia = 'plano_valor' then 'plano_valor' else null end
  where r.filial_id = p_filial_id and r.mes = p_mes and r.ano = p_ano
    and r.contrato = any(contratos) and r.ausente_ultimo_relatorio = true;

  -- Ausência é apenas um sinal para revisão. O evento permanece no histórico
  -- e os agregados não são decrementados sem decisão humana.
  update public.renovacoes_registros r
  set ausente_ultimo_relatorio = true,
      conferencia_pendente = true
  where r.filial_id = p_filial_id and r.mes = p_mes and r.ano = p_ano
    and not (r.contrato = any(contratos));

  insert into public.renovacoes_registros (
    filial_id, vendedor_id, mes, ano, contrato, cliente, plano, plano_id,
    valor, data_renovacao, conferencia_pendente, motivo_conferencia, arquivo_origem
  )
  select p_filial_id, r.vendedor_id, p_mes, p_ano,
    regexp_replace(trim(r.contrato), '\s+', '', 'g'), trim(r.cliente), trim(r.plano),
    r.plano_id, r.valor, r.data, r.conferencia_pendente,
    case when r.conferencia_pendente then 'plano_valor' else null end,
    left(p_arquivo, 255)
  from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
  on conflict (filial_id, mes, ano, contrato) do nothing;
  get diagnostics linhas_inseridas = row_count;

  insert into public.renovacoes_mensais (filial_id, vendedor_id, mes, ano, quantidade, arquivo_origem)
  select p_filial_id, vendedor_id, p_mes, p_ano, count(*)::integer, left(p_arquivo, 255)
  from public.renovacoes_registros
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano
  group by vendedor_id
  on conflict (filial_id, vendedor_id, mes, ano) do update
    set quantidade = greatest(public.renovacoes_mensais.quantidade, excluded.quantidade),
        arquivo_origem = excluded.arquivo_origem,
        importado_em = now();

  return linhas_inseridas;
end;
$function$;

revoke all on function public.importar_relatorio_renovacao_com_conferencia(bigint, integer, integer, text, jsonb, text[]) from public, anon;
grant execute on function public.importar_relatorio_renovacao_com_conferencia(bigint, integer, integer, text, jsonb, text[]) to authenticated;

-- Ao salvar a revisão (plano e valor), confirma manualmente o registro como
-- válido no mês e encerra também eventual alerta de ausência.
create or replace function public.resolver_conferencia_renovacao(
  p_registro_id bigint, p_plano_id bigint, p_plano text, p_valor numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_filial_id bigint;
  v_nome_plano text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação administrativa necessária.' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 or nullif(trim(p_plano), '') is null then
    raise exception 'Plano e valor da renovação inválidos.' using errcode = '22023';
  end if;
  select p.nome into v_nome_plano from public.planos p where p.id = p_plano_id;
  if v_nome_plano is null then
    raise exception 'O plano selecionado não existe no catálogo.' using errcode = '22023';
  end if;
  select filial_id into v_filial_id
  from public.renovacoes_registros
  where id = p_registro_id and conferencia_pendente = true;
  if v_filial_id is null or not private.admin_tem_acesso_filial(v_filial_id) then
    raise exception 'Renovação pendente não encontrada ou sem acesso à filial.' using errcode = '42501';
  end if;
  update public.renovacoes_registros
  set plano_id = p_plano_id, plano = v_nome_plano, valor = p_valor,
      conferencia_pendente = false, ausente_ultimo_relatorio = false,
      motivo_conferencia = null
  where id = p_registro_id and conferencia_pendente = true;
end;
$function$;

revoke all on function public.resolver_conferencia_renovacao(bigint, bigint, text, numeric) from public, anon;
grant execute on function public.resolver_conferencia_renovacao(bigint, bigint, text, numeric) to authenticated;

-- Permite remover apenas uma renovação que ainda está na fila de revisão.
-- A remoção e o ajuste do total agregado ficam na mesma transação.
create or replace function public.excluir_renovacao_pendente_conferencia(p_registro_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_filial_id bigint;
  v_vendedor_id bigint;
  v_mes integer;
  v_ano integer;
  v_excluidas integer;
begin
  if auth.uid() is null then
    raise exception 'Autenticação administrativa necessária.' using errcode = '42501';
  end if;

  select filial_id, vendedor_id, mes, ano
    into v_filial_id, v_vendedor_id, v_mes, v_ano
  from public.renovacoes_registros
  where id = p_registro_id and conferencia_pendente = true;

  if v_filial_id is null or not private.admin_tem_acesso_filial(v_filial_id) then
    raise exception 'Renovação pendente não encontrada ou sem acesso à filial.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(v_filial_id::integer, v_ano * 12 + v_mes);

  select vendedor_id into v_vendedor_id
  from public.renovacoes_registros
  where id = p_registro_id and conferencia_pendente = true
    and filial_id = v_filial_id and mes = v_mes and ano = v_ano
  for update;
  if not found then
    raise exception 'A renovação já foi revisada ou removida.' using errcode = 'P0002';
  end if;

  delete from public.renovacoes_registros
  where id = p_registro_id and conferencia_pendente = true;
  get diagnostics v_excluidas = row_count;
  if v_excluidas <> 1 then
    raise exception 'A renovação já foi revisada ou removida.' using errcode = 'P0002';
  end if;

  update public.renovacoes_mensais
  set quantidade = greatest(quantidade - 1, 0), importado_em = now()
  where filial_id = v_filial_id and vendedor_id = v_vendedor_id
    and mes = v_mes and ano = v_ano;
end;
$function$;

revoke all on function public.excluir_renovacao_pendente_conferencia(bigint) from public, anon;
grant execute on function public.excluir_renovacao_pendente_conferencia(bigint) to authenticated;

commit;
notify pgrst, 'reload schema';
