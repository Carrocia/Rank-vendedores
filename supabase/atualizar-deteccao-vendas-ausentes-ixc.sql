-- Atualiza a comparação do IXC para sinalizar contratos ausentes com qualquer valor,
-- inclusive R$ 0,00, e reabrir conferências resolvidas que sumiram do relatório.
-- Não cancela vendas automaticamente. Execute após conferencia-vendas-ixc.sql.
begin;
create or replace function public.conferir_vendas_ausentes_ixc(
  p_filial_ids bigint[],
  p_contratos_ativos text[],
  p_periodo_inicio date,
  p_periodo_fim date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_filiais bigint[];
  v_contratos text[];
  v_afetadas integer := 0;
  v_revisoes_zero integer := 0;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar no painel administrativo.';
  end if;

  select coalesce(array_agg(distinct x), array[]::bigint[])
    into v_filiais
  from unnest(coalesce(p_filial_ids, array[]::bigint[])) x
  where x is not null;

  select coalesce(array_agg(distinct regexp_replace(btrim(x), '\s+', '', 'g')), array[]::text[])
    into v_contratos
  from unnest(coalesce(p_contratos_ativos, array[]::text[])) x
  where nullif(btrim(x), '') is not null;

  if cardinality(v_filiais) = 0 or cardinality(v_contratos) = 0 then
    raise exception 'O relatório precisa conter filial reconhecida e contratos ativos.';
  end if;

  if p_periodo_inicio is null
     or p_periodo_fim is null
     or p_periodo_inicio <> date_trunc('month', p_periodo_inicio)::date
     or p_periodo_fim <> (p_periodo_inicio + interval '1 month')::date then
    raise exception 'Informe o primeiro dia e o fim exclusivo de um único mês.';
  end if;

  if exists (
    select 1 from unnest(v_filiais) f
    where not private.admin_tem_acesso_filial(f)
  ) then
    raise exception 'Sua conta não tem acesso a todas as filiais deste relatório.';
  end if;

  -- Se uma venda pendente reaparecer como ativa, retira-a da fila sem apagar
  -- a decisão ou o histórico das demais situações.
  update public.vendas_conferencia_ixc c
  set situacao = 'regularizada',
      resolvido_em = now(),
      resolvido_por = auth.uid(),
      relatorio_em = now()
  from public.vendas v
  where c.venda_id = v.id
    and c.situacao = 'pendente'
    and c.motivo <> 'revisar_valor_variavel_ixc'
    and v.filial_destino_id = any(v_filiais)
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date >= p_periodo_inicio
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date < p_periodo_fim
    and regexp_replace(btrim(coalesce(v.numero_venda, '')), '\s+', '', 'g') = any(v_contratos);

  -- Vendas antigas com valor zero e contrato ainda ativo vão para revisão de preço.
  -- Se estiverem ausentes, a fila abaixo registra a ausência como prioridade.
  insert into public.vendas_conferencia_ixc
    (venda_id, filial_id, numero_venda, situacao, motivo, relatorio_em)
  select v.id, v.filial_destino_id, btrim(v.numero_venda), 'pendente',
         'revisar_valor_zero_legado', now()
  from public.vendas v
  where v.filial_destino_id = any(v_filiais)
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date >= p_periodo_inicio
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date < p_periodo_fim
    and coalesce(v.valor, 0) = 0
    and nullif(btrim(coalesce(v.numero_venda, '')), '') is not null
    and regexp_replace(btrim(v.numero_venda), '\s+', '', 'g') = any(v_contratos)
  on conflict (venda_id) do update
    set situacao = 'pendente',
        numero_venda = excluded.numero_venda,
        relatorio_em = now(),
        motivo = 'revisar_valor_zero_legado'
    where public.vendas_conferencia_ixc.situacao in ('pendente', 'regularizada')
      and public.vendas_conferencia_ixc.motivo <> 'revisar_valor_variavel_ixc';
  get diagnostics v_revisoes_zero = row_count;

  insert into public.vendas_conferencia_ixc
    (venda_id, filial_id, numero_venda, situacao, relatorio_em)
  select v.id, v.filial_destino_id, btrim(v.numero_venda), 'pendente', now()
  from public.vendas v
  where v.filial_destino_id = any(v_filiais)
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date >= p_periodo_inicio
    and (v.data_venda::timestamptz at time zone 'America/Manaus')::date < p_periodo_fim
    and nullif(btrim(v.numero_venda), '') is not null
    and not (regexp_replace(btrim(v.numero_venda), '\s+', '', 'g') = any(v_contratos))
  on conflict (venda_id) do update
    set situacao = 'pendente',
        numero_venda = excluded.numero_venda,
        relatorio_em = now(),
        motivo = 'Contrato não encontrado na lista de contratos ativos do IXC.'
    where public.vendas_conferencia_ixc.situacao in ('pendente', 'regularizada', 'validada', 'vinculada');

  get diagnostics v_afetadas = row_count;
  return v_afetadas + v_revisoes_zero;
end;
$function$;
revoke all on function public.conferir_vendas_ausentes_ixc(bigint[], text[], date, date) from public, anon;
grant execute on function public.conferir_vendas_ausentes_ixc(bigint[], text[], date, date) to authenticated;

commit;
