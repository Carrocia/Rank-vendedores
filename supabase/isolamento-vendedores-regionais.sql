-- Contas regionais consultam e atribuem vendas somente aos vendedores
-- da própria filial. Vendas recebidas sem vendedor continuam permitidas.
-- O superadministrador mantém acesso e associação global.

begin;

alter table public.vendedores enable row level security;
drop policy if exists regional_vendedores_select_scope_only on public.vendedores;
create policy regional_vendedores_select_scope_only on public.vendedores
  as restrictive for select to authenticated
  using (private.admin_tem_acesso_filial(filial_id));

drop policy if exists regional_vendas_vendedor_origem_insert on public.vendas;
create policy regional_vendas_vendedor_origem_insert on public.vendas
  as restrictive for insert to authenticated
  with check (
    private.admin_e_superadmin()
    or vendedor_id is null
    or private.admin_tem_acesso_filial(filial_origem_id)
  );

drop policy if exists regional_vendas_vendedor_origem_update on public.vendas;
create policy regional_vendas_vendedor_origem_update on public.vendas
  as restrictive for update to authenticated
  using (
    private.admin_e_superadmin()
    or vendedor_id is null
    or private.admin_tem_acesso_filial(filial_origem_id)
  )
  with check (
    private.admin_e_superadmin()
    or vendedor_id is null
    or private.admin_tem_acesso_filial(filial_origem_id)
  );

commit;
