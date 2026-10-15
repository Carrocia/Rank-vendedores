-- A importação IXC identifica contrato duplicado em qualquer filial e não
-- retorna dados do cliente/vendedor. A consulta é restrita a administradores.

begin;

create or replace function public.vendas_ixc_contratos_existentes(p_numeros_venda text[])
returns table (
  numero_venda text,
  filial_destino_id bigint,
  filial_destino_nome text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null or not private.admin_tem_acesso() then
    raise exception 'Apenas administradores podem verificar contratos da importação IXC.'
      using errcode = '42501';
  end if;

  return query
  with contratos_solicitados as (
    select distinct btrim(item.numero_venda) as numero_venda
    from unnest(coalesce(p_numeros_venda, array[]::text[])) as item(numero_venda)
    where btrim(item.numero_venda) <> ''
  )
  select btrim(v.numero_venda), v.filial_destino_id, f.nome
  from public.vendas v
  join contratos_solicitados c on c.numero_venda = btrim(v.numero_venda)
  left join public.filiais f on f.id = v.filial_destino_id
  where v.numero_venda is not null and btrim(v.numero_venda) <> ''
  order by btrim(v.numero_venda), v.filial_destino_id;
end;
$function$;

revoke all on function public.vendas_ixc_contratos_existentes(text[]) from public, anon;
grant execute on function public.vendas_ixc_contratos_existentes(text[]) to authenticated;

-- Impede novas duplicidades globais. Se já houver contratos repetidos entre
-- filiais, mantém o índice antigo e emite aviso para revisão dos registros.
do $block$
declare
  quantidade_duplicados bigint;
begin
  select count(*) into quantidade_duplicados
  from (
    select btrim(numero_venda)
    from public.vendas
    where numero_venda is not null and btrim(numero_venda) <> ''
    group by btrim(numero_venda)
    having count(*) > 1
  ) as contratos_repetidos;

  if quantidade_duplicados > 0 then
    raise warning 'Há % número(s) de contrato repetido(s) entre filiais. A prévia global foi ativada, mas a restrição única global não foi criada. Revise os duplicados e execute novamente este script.', quantidade_duplicados;
  else
    execute $sql$
      create unique index if not exists vendas_numero_global_uidx
      on public.vendas ((btrim(numero_venda)))
      where numero_venda is not null and btrim(numero_venda) <> ''
    $sql$;
    execute 'drop index if exists public.vendas_numero_destino_uidx';
  end if;
end;
$block$;

commit;
