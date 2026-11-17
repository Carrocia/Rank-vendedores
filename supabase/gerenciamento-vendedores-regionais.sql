-- Libera criação, edição, foto e ativação/inativação para administradores
-- regionais, limitando as operações à filial vinculada em admin_usuarios.
-- O superadministrador continua com gestão global pela política existente.

begin;

do $block$
begin
  if to_regprocedure('private.admin_tem_acesso_filial(bigint)') is null then
    raise exception 'Aplique primeiro supabase/regional-access.sql.';
  end if;
end;
$block$;

-- Remove políticas antigas que restringiam essas operações ao superadmin.
drop policy if exists regional_vendedores_superadmin_insert_only on public.vendedores;
drop policy if exists regional_vendedores_superadmin_update_only on public.vendedores;
drop policy if exists vendedor_fotos_superadmin_insert_scope on storage.objects;
drop policy if exists vendedor_fotos_superadmin_update_scope on storage.objects;

-- Essas políticas são permissivas; as políticas restritivas de regional-access.sql
-- continuam exigindo que filial_id pertença ao administrador autenticado.
drop policy if exists regional_vendedores_manage_insert_scope on public.vendedores;
create policy regional_vendedores_manage_insert_scope on public.vendedores
  for insert to authenticated
  with check (private.admin_tem_acesso_filial(filial_id));

drop policy if exists regional_vendedores_manage_update_scope on public.vendedores;
create policy regional_vendedores_manage_update_scope on public.vendedores
  for update to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));

grant insert on table public.vendedores to authenticated;
grant update (nome, tipo, ativo, foto_url, participa_ranking, ixc_vendedor_id)
  on table public.vendedores to authenticated;

-- Permite incluir e substituir a foto somente dentro da pasta da filial
-- autorizada. O bucket continua público para exibir as fotos no ranking.
drop policy if exists regional_vendedor_fotos_insert_scope on storage.objects;
create policy regional_vendedor_fotos_insert_scope on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end)
    and exists (
      select 1 from public.vendedores v
      where v.id = case when split_part(name, '/', 2) ~ '^[0-9]+$' then split_part(name, '/', 2)::bigint else null end
        and v.filial_id = case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end
    )
  );

drop policy if exists regional_vendedor_fotos_update_scope on storage.objects;
create policy regional_vendedor_fotos_update_scope on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end)
    and exists (
      select 1 from public.vendedores v
      where v.id = case when split_part(name, '/', 2) ~ '^[0-9]+$' then split_part(name, '/', 2)::bigint else null end
        and v.filial_id = case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end
    )
  )
  with check (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end)
    and exists (
      select 1 from public.vendedores v
      where v.id = case when split_part(name, '/', 2) ~ '^[0-9]+$' then split_part(name, '/', 2)::bigint else null end
        and v.filial_id = case when split_part(name, '/', 1) ~ '^[0-9]+$' then split_part(name, '/', 1)::bigint else null end
    )
  );

commit;
notify pgrst, 'reload schema';
