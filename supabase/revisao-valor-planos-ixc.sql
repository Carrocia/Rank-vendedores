-- Importa planos com valor variável em R$ 0,00 e cria a pendência de revisão
-- na mesma transação, para nenhuma venda ficar sem aparecer na conferência.
-- Execute uma vez no SQL Editor do Supabase após conferencia-vendas-ixc.sql.

begin;

create or replace function public.importar_venda_variavel_ixc(p_venda jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_vendedor_id bigint;
  v_filial_origem_id bigint;
  v_filial_destino_id bigint;
  v_plano_id bigint;
  v_data_venda timestamptz;
  v_cliente text;
  v_numero text;
  v_observacao text;
  v_fora_filial boolean;
  v_venda_id bigint;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar no painel administrativo.';
  end if;
  if p_venda is null or jsonb_typeof(p_venda) <> 'object' then
    raise exception 'Os dados da venda enviados não são válidos.';
  end if;

  v_vendedor_id := nullif(p_venda->>'vendedor_id', '')::bigint;
  v_filial_origem_id := nullif(p_venda->>'filial_origem_id', '')::bigint;
  v_filial_destino_id := nullif(p_venda->>'filial_destino_id', '')::bigint;
  v_plano_id := nullif(p_venda->>'plano_id', '')::bigint;
  v_data_venda := nullif(p_venda->>'data_venda', '')::timestamptz;
  v_cliente := nullif(btrim(coalesce(p_venda->>'cliente', '')), '');
  v_numero := nullif(btrim(coalesce(p_venda->>'numero_venda', '')), '');
  v_observacao := nullif(btrim(coalesce(p_venda->>'observacao', '')), '');
  v_fora_filial := coalesce((p_venda->>'fora_filial')::boolean, false);

  if v_vendedor_id is null or v_filial_origem_id is null or v_filial_destino_id is null
     or v_plano_id is null or v_data_venda is null or v_numero is null then
    raise exception 'Confira vendedor, filiais, plano, data e contrato da venda.';
  end if;
  if v_numero !~ '^\d+$' then
    raise exception 'O número do contrato deve conter apenas números.';
  end if;
  if coalesce(nullif(p_venda->>'valor', '')::numeric, 0) <> 0 then
    raise exception 'A venda de plano variável deve começar com valor de plano igual a zero.';
  end if;
  if not private.admin_e_superadmin()
     and not private.admin_tem_acesso_filial(v_filial_origem_id) then
    raise exception 'Sua conta não pode importar vendas da filial de origem selecionada.';
  end if;
  if not private.admin_tem_acesso_filial(v_filial_destino_id)
     and not private.admin_tem_acesso_filial(v_filial_origem_id) then
    raise exception 'Sua conta não tem acesso à filial de origem ou destino desta venda.';
  end if;
  if not exists (
    select 1 from public.vendedores v
    where v.id = v_vendedor_id
      and v.filial_id = v_filial_origem_id
      and v.ativo is true
  ) then
    raise exception 'O vendedor precisa estar ativo e pertencer à filial de origem.';
  end if;
  if not exists (
    select 1 from public.filiais f
    where f.id = v_filial_destino_id and f.ativo is true
  ) then
    raise exception 'A filial de destino não existe ou está inativa.';
  end if;
  if not exists (select 1 from public.planos p where p.id = v_plano_id) then
    raise exception 'O plano variável não foi encontrado no catálogo.';
  end if;
  if exists (
    select 1 from public.vendas v
    where btrim(coalesce(v.numero_venda, '')) = v_numero
  ) then
    raise exception 'Este número de contrato já foi registrado.';
  end if;

  insert into public.vendas (
    vendedor_id, filial_origem_id, filial_destino_id, plano_id,
    data_venda, valor, cliente, numero_venda, observacao, fora_filial
  ) values (
    v_vendedor_id, v_filial_origem_id, v_filial_destino_id, v_plano_id,
    v_data_venda, 0, v_cliente, v_numero, v_observacao, v_fora_filial
  ) returning id into v_venda_id;

  insert into public.vendas_conferencia_ixc (
    venda_id, filial_id, numero_venda, situacao, motivo, relatorio_em
  ) values (
    v_venda_id, v_filial_destino_id, v_numero, 'pendente',
    'revisar_valor_variavel_ixc', now()
  );

  return v_venda_id;
end;
$function$;

revoke all on function public.importar_venda_variavel_ixc(jsonb) from public, anon;
grant execute on function public.importar_venda_variavel_ixc(jsonb) to authenticated;

-- Mantém itens de revisão de preço na fila mesmo quando o contrato aparece
-- ativo em uma conferência futura do relatório completo do IXC.
create or replace function public.conferir_vendas_ausentes_ixc(
  p_filial_ids bigint[],
  p_contratos_ativos text[]
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

  select coalesce(array_agg(distinct btrim(x)), array[]::text[])
    into v_contratos
  from unnest(coalesce(p_contratos_ativos, array[]::text[])) x
  where nullif(btrim(x), '') is not null;

  if cardinality(v_filiais) = 0 or cardinality(v_contratos) = 0 then
    raise exception 'O relatório precisa conter filial reconhecida e contratos ativos.';
  end if;

  if exists (
    select 1 from unnest(v_filiais) f
    where not private.admin_tem_acesso_filial(f)
  ) then
    raise exception 'Sua conta não tem acesso a todas as filiais deste relatório.';
  end if;

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
    and btrim(coalesce(v.numero_venda, '')) = any(v_contratos);

  -- Vendas antigas com valor de plano zero não tinham pendência própria.
  -- Coloca-as na fila de revisão, mesmo se o contrato estiver ativo no IXC.
  insert into public.vendas_conferencia_ixc
    (venda_id, filial_id, numero_venda, situacao, motivo, relatorio_em)
  select v.id, v.filial_destino_id, btrim(v.numero_venda), 'pendente',
         'revisar_valor_zero_legado', now()
  from public.vendas v
  where v.filial_destino_id = any(v_filiais)
    and coalesce(v.valor, 0) = 0
    and nullif(btrim(coalesce(v.numero_venda, '')), '') is not null
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
    and nullif(btrim(v.numero_venda), '') is not null
    and coalesce(v.valor, 0) <> 0
    and not (btrim(v.numero_venda) = any(v_contratos))
  on conflict (venda_id) do update
    set situacao = 'pendente',
        numero_venda = excluded.numero_venda,
        relatorio_em = now(),
        motivo = 'Contrato não encontrado na lista de contratos ativos do IXC.'
    where public.vendas_conferencia_ixc.situacao in ('pendente', 'regularizada')
      and public.vendas_conferencia_ixc.motivo <> 'revisar_valor_variavel_ixc';

  get diagnostics v_afetadas = row_count;
  return v_afetadas + v_revisoes_zero;
end;
$function$;

revoke all on function public.conferir_vendas_ausentes_ixc(bigint[], text[]) from public, anon;
grant execute on function public.conferir_vendas_ausentes_ixc(bigint[], text[]) to authenticated;

commit;
