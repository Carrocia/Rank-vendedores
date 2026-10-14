-- Permite que administradores regionais registrem vendas dos vendedores
-- da própria filial para qualquer filial ativa escolhida no formulário.
-- A origem pode consultar suas próprias vendas cross-filial; edição e
-- exclusão continuam limitadas à filial de destino.

begin;

-- Mantém escrita de edição/exclusão restrita ao destino, mas permite que
-- origem e destino leiam a venda; a origem só pode inserir para seus vendedores.
drop policy if exists regional_vendas_scope on public.vendas;
drop policy if exists regional_vendas_select_scope on public.vendas;
drop policy if exists regional_vendas_insert_scope on public.vendas;
drop policy if exists regional_vendas_update_scope on public.vendas;
drop policy if exists regional_vendas_delete_scope on public.vendas;

create policy regional_vendas_select_scope on public.vendas
  as restrictive for select to authenticated
  using (
    private.admin_tem_acesso_filial(filial_destino_id)
    or (
      vendedor_id is not null
      and private.admin_tem_acesso_filial(filial_origem_id)
    )
  );

create policy regional_vendas_insert_scope on public.vendas
  as restrictive for insert to authenticated
  with check (
    exists (
      select 1 from public.filiais f
      where f.id = filial_destino_id and f.ativo is true
    )
    and (
      private.admin_tem_acesso_filial(filial_destino_id)
      or (
        vendedor_id is not null
        and private.admin_tem_acesso_filial(filial_origem_id)
      )
    )
  );

create policy regional_vendas_update_scope on public.vendas
  as restrictive for update to authenticated
  using (private.admin_tem_acesso_filial(filial_destino_id))
  with check (private.admin_tem_acesso_filial(filial_destino_id));

create policy regional_vendas_delete_scope on public.vendas
  as restrictive for delete to authenticated
  using (private.admin_tem_acesso_filial(filial_destino_id));

-- Consulta os vínculos da venda sem abrir a tabela de destino para a origem.
create or replace function private.admin_pode_acessar_venda(p_venda_id text)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1
    from public.vendas v
    where v.id::text = p_venda_id
      and (
        private.admin_tem_acesso_filial(v.filial_destino_id)
        or (
          v.vendedor_id is not null
          and private.admin_tem_acesso_filial(v.filial_origem_id)
        )
      )
  );
$function$;

revoke all on function private.admin_pode_acessar_venda(text) from public, anon, authenticated;
grant execute on function private.admin_pode_acessar_venda(text) to authenticated;

drop policy if exists regional_venda_adicionais_scope on public.venda_adicionais;
drop policy if exists regional_venda_adicionais_select_scope on public.venda_adicionais;
drop policy if exists regional_venda_adicionais_insert_scope on public.venda_adicionais;
drop policy if exists regional_venda_adicionais_update_scope on public.venda_adicionais;
drop policy if exists regional_venda_adicionais_delete_scope on public.venda_adicionais;

create policy regional_venda_adicionais_select_scope on public.venda_adicionais
  as restrictive for select to authenticated
  using (private.admin_pode_acessar_venda(venda_id::text));

create policy regional_venda_adicionais_insert_scope on public.venda_adicionais
  as restrictive for insert to authenticated
  with check (private.admin_pode_acessar_venda(venda_id::text));

create policy regional_venda_adicionais_update_scope on public.venda_adicionais
  as restrictive for update to authenticated
  using (exists (
    select 1 from public.vendas v
    where v.id = venda_adicionais.venda_id
      and private.admin_tem_acesso_filial(v.filial_destino_id)
  ))
  with check (exists (
    select 1 from public.vendas v
    where v.id = venda_adicionais.venda_id
      and private.admin_tem_acesso_filial(v.filial_destino_id)
  ));

create policy regional_venda_adicionais_delete_scope on public.venda_adicionais
  as restrictive for delete to authenticated
  using (exists (
    select 1 from public.vendas v
    where v.id = venda_adicionais.venda_id
      and private.admin_tem_acesso_filial(v.filial_destino_id)
  ));

commit;
