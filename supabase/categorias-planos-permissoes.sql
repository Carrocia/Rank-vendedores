-- Permissões para o catálogo global de categorias de planos.
-- Leitura de categorias ativas é pública para preencher os formulários de venda.
-- Apenas o superadministrador pode criar, renomear ou ativar/desativar categorias.

alter table public.categorias_planos enable row level security;

grant select on public.categorias_planos to anon, authenticated;
grant insert, update on public.categorias_planos to authenticated;

-- Políticas permissivas de leitura: categorias ativas para o catálogo público;
-- todas as categorias para administradores ativos (incluindo inativas no painel).
drop policy if exists categorias_planos_public_select on public.categorias_planos;
create policy categorias_planos_public_select on public.categorias_planos
  as permissive for select to anon, authenticated
  using (ativo is true);

drop policy if exists categorias_planos_admin_select on public.categorias_planos;
create policy categorias_planos_admin_select on public.categorias_planos
  as permissive for select to authenticated
  using (private.admin_tem_acesso());

-- Mantém o padrão regional: administradores podem consultar categorias ativas;
-- somente a conta global pode consultar categorias inativas e fazer alterações.
drop policy if exists regional_categorias_planos_select on public.categorias_planos;
create policy regional_categorias_planos_select on public.categorias_planos
  as restrictive for select to authenticated
  using (ativo is true or private.admin_tem_acesso());

drop policy if exists categorias_planos_insert_authenticated on public.categorias_planos;
create policy categorias_planos_insert_authenticated on public.categorias_planos
  as permissive for insert to authenticated
  with check (true);

drop policy if exists regional_categorias_planos_insert on public.categorias_planos;
create policy regional_categorias_planos_insert on public.categorias_planos
  as restrictive for insert to authenticated
  with check (private.admin_e_superadmin());

drop policy if exists categorias_planos_update_authenticated on public.categorias_planos;
create policy categorias_planos_update_authenticated on public.categorias_planos
  as permissive for update to authenticated
  using (true)
  with check (true);

drop policy if exists regional_categorias_planos_update on public.categorias_planos;
create policy regional_categorias_planos_update on public.categorias_planos
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());

-- O painel usa inativação para preservar referências históricas. Não concedemos DELETE.

do $$
declare
  seq_name text;
begin
  seq_name := pg_get_serial_sequence('public.categorias_planos', 'id');
  if seq_name is not null then
    execute format('grant usage, select on sequence %s to authenticated', seq_name::regclass);
  end if;
end $$;
