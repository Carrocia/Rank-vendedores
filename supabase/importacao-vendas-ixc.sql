-- Suporte à identificação de vendedores pelo ID do IXC na importação de vendas.
-- O número do contrato do IXC será salvo no campo existente vendas.numero_venda.
-- A unicidade é global: o mesmo contrato não pode ser registrado em duas filiais.

begin;

alter table public.vendedores
  add column if not exists ixc_vendedor_id text;

create index if not exists vendedores_ixc_id_idx
  on public.vendedores (ixc_vendedor_id)
  where ixc_vendedor_id is not null and btrim(ixc_vendedor_id) <> '';

grant update (ixc_vendedor_id) on table public.vendedores to authenticated;

do $block$
begin
  if exists (
    select 1
    from public.vendas
    where numero_venda is not null and btrim(numero_venda) <> ''
    group by btrim(numero_venda)
    having count(*) > 1
  ) then
    raise exception 'Há números de contrato repetidos entre filiais ou com espaços diferentes. Resolva as duplicidades antes de ativar a importação IXC.';
  end if;
end;
$block$;

create unique index if not exists vendas_numero_global_uidx
  on public.vendas ((btrim(numero_venda)))
  where numero_venda is not null and btrim(numero_venda) <> '';

drop index if exists public.vendas_numero_destino_uidx;

commit;
