-- Exclusão administrativa de todas as vendas de um vendedor em um mês,
-- sem limitar pela filial de destino. Executar no SQL Editor do Supabase.

begin;

create or replace function public.apagar_vendas_vendedor_mes(
  p_vendedor_id bigint,
  p_mes date
)
returns table (
  vendas_apagadas bigint,
  adicionais_vinculados_apagados bigint,
  adicionais_avulsos_apagados bigint,
  pendencias_apagadas bigint
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if auth.uid() is null or not private.admin_e_superadmin() then
    raise exception 'Somente o superadministrador pode excluir vendas em lote.';
  end if;

  if p_vendedor_id is null or p_mes is null or date_trunc('month', p_mes)::date <> p_mes then
    raise exception 'Informe um vendedor e o primeiro dia de um mês válido.';
  end if;

  if not exists (select 1 from public.vendedores v where v.id = p_vendedor_id) then
    raise exception 'Vendedor não encontrado.';
  end if;

  v_inicio := p_mes::timestamp at time zone 'America/Manaus';
  v_fim := (p_mes + interval '1 month')::timestamp at time zone 'America/Manaus';

  delete from public.vendas_conferencia_ixc c
  using public.vendas v
  where c.venda_id = v.id
    and v.vendedor_id = p_vendedor_id
    and v.data_venda >= v_inicio
    and v.data_venda < v_fim;
  get diagnostics pendencias_apagadas = row_count;

  delete from public.venda_adicionais a
  using public.vendas v
  where a.venda_id = v.id
    and v.vendedor_id = p_vendedor_id
    and v.data_venda >= v_inicio
    and v.data_venda < v_fim;
  get diagnostics adicionais_vinculados_apagados = row_count;

  delete from public.adicionais_avulsos a
  where a.vendedor_id = p_vendedor_id
    and a.data_venda >= v_inicio
    and a.data_venda < v_fim;
  get diagnostics adicionais_avulsos_apagados = row_count;

  delete from public.vendas v
  where v.vendedor_id = p_vendedor_id
    and v.data_venda >= v_inicio
    and v.data_venda < v_fim;
  get diagnostics vendas_apagadas = row_count;

  return next;
end;
$function$;

revoke all on function public.apagar_vendas_vendedor_mes(bigint, date) from public, anon;
grant execute on function public.apagar_vendas_vendedor_mes(bigint, date) to authenticated;

commit;
