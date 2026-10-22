-- Edição segura de todos os campos de uma venda na fila de conferência IXC.
-- Executar uma vez no SQL Editor do Supabase.

begin;

create or replace function public.editar_venda_pendente_ixc(
  p_pendencia_id bigint,
  p_venda jsonb,
  p_adicionais jsonb default '[]'::jsonb,
  p_vincular boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pendencia public.vendas_conferencia_ixc%rowtype;
  v_venda public.vendas%rowtype;
  v_cliente text;
  v_numero text;
  v_vendedor_id bigint;
  v_filial_origem_id bigint;
  v_filial_destino_id bigint;
  v_plano_id bigint;
  v_data_venda timestamptz;
  v_valor numeric;
  v_observacao text;
  v_fora_filial boolean;
  v_item jsonb;
  v_produto_id bigint;
  v_quantidade integer;
  v_valor_unitario numeric;
begin
  if auth.uid() is null then
    raise exception 'É necessário entrar no painel administrativo.';
  end if;

  select * into v_pendencia
  from public.vendas_conferencia_ixc
  where id = p_pendencia_id
  for update;
  if not found then raise exception 'Pendência não encontrada.'; end if;
  if v_pendencia.situacao <> 'pendente' then
    raise exception 'Esta pendência já foi resolvida.';
  end if;
  if not private.admin_tem_acesso_filial(v_pendencia.filial_id) then
    raise exception 'Sua conta não tem acesso à filial desta pendência.';
  end if;

  select * into v_venda
  from public.vendas
  where id = v_pendencia.venda_id
  for update;
  if not found then raise exception 'A venda original não foi encontrada.'; end if;

  v_numero := nullif(btrim(coalesce(p_venda->>'numero_venda', '')), '');
  v_cliente := nullif(btrim(coalesce(p_venda->>'cliente', '')), '');
  v_vendedor_id := nullif(p_venda->>'vendedor_id', '')::bigint;
  v_filial_origem_id := nullif(p_venda->>'filial_origem_id', '')::bigint;
  v_filial_destino_id := nullif(p_venda->>'filial_destino_id', '')::bigint;
  v_plano_id := nullif(p_venda->>'plano_id', '')::bigint;
  v_data_venda := nullif(p_venda->>'data_venda', '')::timestamptz;
  v_valor := nullif(p_venda->>'valor', '')::numeric;
  v_observacao := nullif(btrim(coalesce(p_venda->>'observacao', '')), '');
  v_fora_filial := coalesce((p_venda->>'fora_filial')::boolean, false);

  if v_numero is not null and v_numero !~ '^\d+$' then
    raise exception 'O número do contrato deve conter apenas números.';
  end if;
  if v_filial_origem_id is null or v_filial_destino_id is null or v_plano_id is null or v_data_venda is null or v_valor is null or v_valor < 0 then
    raise exception 'Confira filial de origem, destino, plano, data e valor.';
  end if;
  if not private.admin_tem_acesso_filial(v_filial_destino_id) then
    raise exception 'Sua conta não pode alterar uma venda destinada a essa filial.';
  end if;
  if not private.admin_e_superadmin()
     and not private.admin_tem_acesso_filial(v_filial_origem_id) then
    raise exception 'Somente o superadministrador pode alterar a filial de origem de outra equipe.';
  end if;
  if not exists (select 1 from public.filiais f where f.id = v_filial_origem_id) then
    raise exception 'Filial de origem não encontrada.';
  end if;
  if not exists (select 1 from public.filiais f where f.id = v_filial_destino_id) then
    raise exception 'Filial de destino não encontrada.';
  end if;
  if not exists (select 1 from public.planos p where p.id = v_plano_id) then
    raise exception 'Plano não encontrado.';
  end if;
  if v_vendedor_id is not null and not exists (
    select 1 from public.vendedores v
    where v.id = v_vendedor_id and v.filial_id = v_filial_origem_id
  ) then
    raise exception 'O vendedor precisa pertencer à filial de origem selecionada.';
  end if;
  if v_numero is not null and exists (
    select 1 from public.vendas v
    where btrim(coalesce(v.numero_venda, '')) = v_numero
      and v.id <> v_venda.id
  ) then
    raise exception 'Esse número de contrato já está cadastrado em outra venda.';
  end if;
  if p_vincular and (v_numero is null or v_numero !~ '^\d+$') then
    raise exception 'Informe um número de contrato IXC válido para vincular.';
  end if;
  if p_adicionais is null or jsonb_typeof(p_adicionais) <> 'array' then
    raise exception 'A lista de adicionais enviada não é válida.';
  end if;

  update public.vendas
  set numero_venda = v_numero,
      cliente = v_cliente,
      vendedor_id = v_vendedor_id,
      filial_origem_id = v_filial_origem_id,
      filial_destino_id = v_filial_destino_id,
      plano_id = v_plano_id,
      data_venda = v_data_venda,
      valor = v_valor,
      observacao = v_observacao,
      fora_filial = v_fora_filial
  where id = v_venda.id;

  delete from public.venda_adicionais where venda_id = v_venda.id;
  for v_item in select value from jsonb_array_elements(p_adicionais)
  loop
    v_produto_id := nullif(v_item->>'produto_adicional_id', '')::bigint;
    v_quantidade := nullif(v_item->>'quantidade', '')::integer;
    v_valor_unitario := nullif(v_item->>'valor_unitario', '')::numeric;
    if v_produto_id is null or v_quantidade is null or v_quantidade < 1 or v_valor_unitario is null or v_valor_unitario < 0 then
      raise exception 'Confira produto, quantidade e valor dos adicionais.';
    end if;
    insert into public.venda_adicionais (venda_id, produto_adicional_id, quantidade, valor_unitario)
    values (v_venda.id, v_produto_id, v_quantidade, v_valor_unitario);
  end loop;

  update public.vendas_conferencia_ixc
  set numero_venda = coalesce(v_numero, ''),
      filial_id = v_filial_destino_id,
      situacao = case when p_vincular then 'vinculada' else 'pendente' end,
      resolvido_em = case when p_vincular then now() else null end,
      resolvido_por = case when p_vincular then auth.uid() else null end
  where id = p_pendencia_id;
end;
$function$;

revoke all on function public.editar_venda_pendente_ixc(bigint, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.editar_venda_pendente_ixc(bigint, jsonb, jsonb, boolean) to authenticated;

-- Atualiza o cache do PostgREST para a função aparecer imediatamente no RPC.
notify pgrst, 'reload schema';

commit;
