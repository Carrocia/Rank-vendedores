-- Permite que cada administrador gerencie os vendedores da própria filial.
-- O superadministrador mantém acesso a todas as filiais. A exclusão física
-- continua exclusiva do superadministrador para preservar o histórico.
-- Reexecute este arquivo no SQL Editor para substituir a política antiga
-- que deixava os cadastros regionais somente para leitura.

begin;

-- Remove as restrições instaladas pela versão anterior deste arquivo.
drop policy if exists regional_vendedores_superadmin_insert_only on public.vendedores;
drop policy if exists regional_vendedores_superadmin_update_only on public.vendedores;
drop policy if exists regional_vendedores_superadmin_delete_only on public.vendedores;
drop policy if exists vendedor_fotos_superadmin_insert_scope on storage.objects;
drop policy if exists vendedor_fotos_superadmin_update_scope on storage.objects;

-- Cria políticas permissivas limitadas à filial do administrador. As políticas
-- regionais restritivas de regional-access.sql continuam aplicando a mesma
-- validação também no WITH CHECK das alterações.
drop policy if exists regional_vendedores_manage_insert_scope on public.vendedores;
create policy regional_vendedores_manage_insert_scope on public.vendedores
  for insert to authenticated
  with check (private.admin_tem_acesso_filial(filial_id));

drop policy if exists regional_vendedores_manage_update_scope on public.vendedores;
create policy regional_vendedores_manage_update_scope on public.vendedores
  for update to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));

create policy regional_vendedores_superadmin_delete_only on public.vendedores
  as restrictive for delete to authenticated
  using (private.admin_e_superadmin());

grant insert on table public.vendedores to authenticated;
grant update (nome, tipo, ativo, foto_url, participa_ranking, ixc_vendedor_id)
  on table public.vendedores to authenticated;

commit;
