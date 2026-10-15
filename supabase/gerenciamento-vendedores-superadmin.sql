-- Vendedores ficam em modo somente leitura para administradores regionais.
-- O superadministrador mantém cadastro, edição e exclusão em qualquer filial.
-- Execute uma vez no SQL Editor do Supabase depois de publicar a atualização.

begin;

drop policy if exists regional_vendedores_superadmin_insert_only on public.vendedores;
create policy regional_vendedores_superadmin_insert_only on public.vendedores
  as restrictive for insert to authenticated
  with check (private.admin_e_superadmin());

drop policy if exists regional_vendedores_superadmin_update_only on public.vendedores;
create policy regional_vendedores_superadmin_update_only on public.vendedores
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());

drop policy if exists regional_vendedores_superadmin_delete_only on public.vendedores;
create policy regional_vendedores_superadmin_delete_only on public.vendedores
  as restrictive for delete to authenticated
  using (private.admin_e_superadmin());

drop policy if exists vendedor_fotos_superadmin_insert_scope on storage.objects;
create policy vendedor_fotos_superadmin_insert_scope on storage.objects
  as restrictive for insert to authenticated
  with check (bucket_id <> 'vendedor-fotos' or private.admin_e_superadmin());

drop policy if exists vendedor_fotos_superadmin_update_scope on storage.objects;
create policy vendedor_fotos_superadmin_update_scope on storage.objects
  as restrictive for update to authenticated
  using (bucket_id <> 'vendedor-fotos' or private.admin_e_superadmin())
  with check (bucket_id <> 'vendedor-fotos' or private.admin_e_superadmin());

commit;
