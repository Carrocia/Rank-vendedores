-- Evita somar renovações repetidas ao reenviar uma planilha do mês.
-- A importação acrescenta somente contratos ainda não registrados e recompõe
-- os totais mensais a partir de todo o detalhamento preservado.
begin;

create or replace function public.substituir_registros_renovacao(
  p_filial_id bigint, p_mes integer, p_ano integer, p_arquivo text, p_linhas jsonb
)
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare
  linhas_inseridas integer;
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para atualizar renovações desta filial.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 or p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Mês, ano ou linhas do relatório inválidos.' using errcode = '22023';
  end if;

  -- Serializa importações simultâneas para a mesma filial e mês.
  perform pg_advisory_xact_lock(p_filial_id, (p_ano * 12 + p_mes)::bigint);

  if exists (
    select 1
    from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
    left join public.vendedores v on v.id = r.vendedor_id
    where v.id is null or nullif(trim(r.contrato), '') is null
      or nullif(trim(r.cliente), '') is null or nullif(trim(r.plano), '') is null
      or r.valor is null or r.valor < 0 or r.data is null or r.conferencia_pendente is null
      or (r.plano_id is not null and not exists (select 1 from public.planos p where p.id = r.plano_id))
      or extract(month from r.data)::integer <> p_mes or extract(year from r.data)::integer <> p_ano
  ) then
    raise exception 'O relatório contém dados inválidos ou data fora do mês.' using errcode = '22023';
  end if;

  -- A constraint filial/mês/ano/contrato faz a importação idempotente.
  -- Itens existentes mantêm inclusive correções manuais já feitas.
  insert into public.renovacoes_registros (
    filial_id, vendedor_id, mes, ano, contrato, cliente, plano, plano_id,
    valor, data_renovacao, conferencia_pendente, arquivo_origem
  )
  select p_filial_id, r.vendedor_id, p_mes, p_ano,
    regexp_replace(trim(r.contrato), '\s+', '', 'g'), trim(r.cliente), trim(r.plano),
    r.plano_id, r.valor, r.data, r.conferencia_pendente, left(p_arquivo, 255)
  from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
  on conflict (filial_id, mes, ano, contrato) do nothing;
  get diagnostics linhas_inseridas = row_count;

  -- Atualiza os totais agregados sem apagar o histórico detalhado.
  delete from public.renovacoes_mensais
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano;
  insert into public.renovacoes_mensais (filial_id, vendedor_id, mes, ano, quantidade, arquivo_origem)
  select p_filial_id, vendedor_id, p_mes, p_ano, count(*)::integer, left(p_arquivo, 255)
  from public.renovacoes_registros
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano
  group by vendedor_id;

  return linhas_inseridas;
end;
$function$;

revoke all on function public.substituir_registros_renovacao(bigint, integer, integer, text, jsonb) from public, anon;
grant execute on function public.substituir_registros_renovacao(bigint, integer, integer, text, jsonb) to authenticated;

commit;
