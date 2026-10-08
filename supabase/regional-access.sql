-- Isolamento regional para administradores do Rank de Vendedores.
-- Revise a auditoria de views (auditoria-acesso-regional.sql) antes de executar.
-- A conta administrativa atual fica global; novos administradores devem
-- receber filial_id e is_superadmin = false.
-- Planos, adicionais de catálogo e configurações globais permanecem globais.

begin;

alter table public.admin_usuarios
  add column if not exists filial_id bigint
    references public.filiais(id) on delete restrict;
alter table public.admin_usuarios
  add column if not exists is_superadmin boolean not null default false;

-- Só promove a conta atual se ela ainda existir e estiver ativa.
do $block$
begin
  if not exists (
    select 1 from public.admin_usuarios
    where user_id = 'ab664aec-d0a6-4bd5-a1eb-87928ec3342e'::uuid
      and ativo is true
  ) then
    raise exception 'A conta administrativa atual não existe ou está inativa; revise o vínculo antes de executar.';
  end if;
end;
$block$;

update public.admin_usuarios
set filial_id = null,
    is_superadmin = true
where user_id = 'ab664aec-d0a6-4bd5-a1eb-87928ec3342e'::uuid
  and ativo is true;

create schema if not exists private;

create or replace function private.admin_tem_acesso()
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.admin_usuarios a
    where a.user_id = auth.uid()
      and a.ativo is true
      and (a.is_superadmin is true or a.filial_id is not null)
  );
$function$;

create or replace function private.admin_tem_acesso_filial(p_filial_id bigint)
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.admin_usuarios a
    where a.user_id = auth.uid()
      and a.ativo is true
      and (
        a.is_superadmin is true
        or (p_filial_id is not null and a.filial_id = p_filial_id)
      )
  );
$function$;

create or replace function private.admin_e_superadmin()
returns boolean
language sql stable security definer set search_path = ''
as $function$
  select exists (
    select 1 from public.admin_usuarios a
    where a.user_id = auth.uid()
      and a.ativo is true
      and a.is_superadmin is true
  );
$function$;

revoke all on function private.admin_tem_acesso() from public, anon, authenticated;
revoke all on function private.admin_tem_acesso_filial(bigint) from public, anon, authenticated;
revoke all on function private.admin_e_superadmin() from public, anon, authenticated;
grant execute on function private.admin_tem_acesso() to authenticated;
grant execute on function private.admin_tem_acesso_filial(bigint) to authenticated;
grant execute on function private.admin_e_superadmin() to authenticated;

-- Administradores só leem o próprio vínculo (ou todos se globais).
-- Nenhum usuário autenticado pode criar, alterar ou remover vínculos pelo cliente.
alter table public.admin_usuarios enable row level security;
-- A Edge Function usa a chave secreta do servidor (role service_role) para
-- autorizar o superadmin e criar/listar vínculos regionais. RLS é ignorada por
-- essa role, mas os privilégios SQL da tabela ainda precisam estar concedidos.
grant select, insert, delete on table public.admin_usuarios to service_role;
grant select on table public.filiais to service_role;
drop policy if exists regional_admin_usuarios_select on public.admin_usuarios;
create policy regional_admin_usuarios_select on public.admin_usuarios
  as restrictive for select to authenticated
  using (user_id = auth.uid() or private.admin_e_superadmin());
drop policy if exists regional_admin_usuarios_insert_block on public.admin_usuarios;
create policy regional_admin_usuarios_insert_block on public.admin_usuarios
  as restrictive for insert to authenticated with check (false);
drop policy if exists regional_admin_usuarios_update_block on public.admin_usuarios;
create policy regional_admin_usuarios_update_block on public.admin_usuarios
  as restrictive for update to authenticated using (false) with check (false);
drop policy if exists regional_admin_usuarios_delete_block on public.admin_usuarios;
create policy regional_admin_usuarios_delete_block on public.admin_usuarios
  as restrictive for delete to authenticated using (false);

-- Filiais são listáveis por administradores para o formulário de vendas
-- recebidas; somente o superadministrador pode cadastrar ou alterar filiais.
alter table public.filiais enable row level security;
drop policy if exists regional_filiais_select on public.filiais;
create policy regional_filiais_select on public.filiais
  as restrictive for select to authenticated
  using (private.admin_tem_acesso() or ativo is true);
drop policy if exists regional_filiais_insert on public.filiais;
create policy regional_filiais_insert on public.filiais
  as restrictive for insert to authenticated with check (private.admin_e_superadmin());
drop policy if exists regional_filiais_update on public.filiais;
create policy regional_filiais_update on public.filiais
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());
drop policy if exists regional_filiais_delete on public.filiais;
create policy regional_filiais_delete on public.filiais
  as restrictive for delete to authenticated using (private.admin_e_superadmin());

-- Catálogos e configuração são globais: todos os administradores ativos
-- podem consultá-los, mas somente a conta global pode alterar seu conteúdo.
alter table public.planos enable row level security;
drop policy if exists regional_planos_select on public.planos;
create policy regional_planos_select on public.planos
  as restrictive for select to authenticated using (private.admin_tem_acesso());
drop policy if exists regional_planos_insert on public.planos;
create policy regional_planos_insert on public.planos
  as restrictive for insert to authenticated with check (private.admin_e_superadmin());
drop policy if exists regional_planos_update on public.planos;
create policy regional_planos_update on public.planos
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());
drop policy if exists regional_planos_delete on public.planos;
create policy regional_planos_delete on public.planos
  as restrictive for delete to authenticated using (private.admin_e_superadmin());

alter table public.produtos_adicionais enable row level security;
drop policy if exists regional_produtos_adicionais_select on public.produtos_adicionais;
create policy regional_produtos_adicionais_select on public.produtos_adicionais
  as restrictive for select to authenticated using (private.admin_tem_acesso());
drop policy if exists regional_produtos_adicionais_insert on public.produtos_adicionais;
create policy regional_produtos_adicionais_insert on public.produtos_adicionais
  as restrictive for insert to authenticated with check (private.admin_e_superadmin());
drop policy if exists regional_produtos_adicionais_update on public.produtos_adicionais;
create policy regional_produtos_adicionais_update on public.produtos_adicionais
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());
drop policy if exists regional_produtos_adicionais_delete on public.produtos_adicionais;
create policy regional_produtos_adicionais_delete on public.produtos_adicionais
  as restrictive for delete to authenticated using (private.admin_e_superadmin());

alter table public.site_config enable row level security;
drop policy if exists regional_site_config_select on public.site_config;
create policy regional_site_config_select on public.site_config
  as restrictive for select to authenticated using (private.admin_tem_acesso());
drop policy if exists regional_site_config_insert on public.site_config;
create policy regional_site_config_insert on public.site_config
  as restrictive for insert to authenticated with check (private.admin_e_superadmin());
drop policy if exists regional_site_config_update on public.site_config;
create policy regional_site_config_update on public.site_config
  as restrictive for update to authenticated
  using (private.admin_e_superadmin())
  with check (private.admin_e_superadmin());
drop policy if exists regional_site_config_delete on public.site_config;
create policy regional_site_config_delete on public.site_config
  as restrictive for delete to authenticated using (private.admin_e_superadmin());

-- Os administradores leem todas as equipes porque o formulário de venda
-- recebida precisa listar vendedores da filial de origem. A interface local
-- continua mostrando apenas os vendedores da filial selecionada. Gravações
-- de vendedores ficam restritas à filial vinculada à conta.
alter table public.vendedores enable row level security;
drop policy if exists regional_vendedores_select on public.vendedores;
create policy regional_vendedores_select on public.vendedores
  as restrictive for select to authenticated using (private.admin_tem_acesso());
drop policy if exists regional_vendedores_insert on public.vendedores;
create policy regional_vendedores_insert on public.vendedores
  as restrictive for insert to authenticated with check (private.admin_tem_acesso_filial(filial_id));
drop policy if exists regional_vendedores_update on public.vendedores;
create policy regional_vendedores_update on public.vendedores
  as restrictive for update to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));
drop policy if exists regional_vendedores_delete on public.vendedores;
create policy regional_vendedores_delete on public.vendedores
  as restrictive for delete to authenticated using (private.admin_tem_acesso_filial(filial_id));

-- Metas individuais seguem a filial atual do vendedor.
alter table public.metas enable row level security;
drop policy if exists regional_metas_scope on public.metas;
create policy regional_metas_scope on public.metas
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.vendedores v
    where v.id = metas.vendedor_id and private.admin_tem_acesso_filial(v.filial_id)
  ))
  with check (exists (
    select 1 from public.vendedores v
    where v.id = metas.vendedor_id and private.admin_tem_acesso_filial(v.filial_id)
  ));

-- Metas mensais e destaques por filial.
alter table public.metas_filial enable row level security;
drop policy if exists regional_metas_filial_scope on public.metas_filial;
create policy regional_metas_filial_scope on public.metas_filial
  as restrictive for all to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));

alter table public.metas_renovacao_cancelamento enable row level security;
drop policy if exists regional_metas_renovacao_scope on public.metas_renovacao_cancelamento;
create policy regional_metas_renovacao_scope on public.metas_renovacao_cancelamento
  as restrictive for all to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));

alter table public.destaques_renovacao enable row level security;
drop policy if exists regional_destaques_renovacao_scope on public.destaques_renovacao;
create policy regional_destaques_renovacao_scope on public.destaques_renovacao
  as restrictive for all to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (private.admin_tem_acesso_filial(filial_id));

-- Vendas são isoladas pela filial de destino; vendedor de outra origem pode
-- ser associado à venda recebida, desde que a origem corresponda à sua filial.
alter table public.vendas enable row level security;
drop policy if exists regional_vendas_scope on public.vendas;
create policy regional_vendas_scope on public.vendas
  as restrictive for all to authenticated
  using (private.admin_tem_acesso_filial(filial_destino_id))
  with check (private.admin_tem_acesso_filial(filial_destino_id));

alter table public.venda_adicionais enable row level security;
drop policy if exists regional_venda_adicionais_scope on public.venda_adicionais;
create policy regional_venda_adicionais_scope on public.venda_adicionais
  as restrictive for all to authenticated
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

alter table public.vendas_outras_filiais enable row level security;
drop policy if exists regional_vendas_outras_filiais_scope on public.vendas_outras_filiais;
create policy regional_vendas_outras_filiais_scope on public.vendas_outras_filiais
  as restrictive for all to authenticated
  using (private.admin_tem_acesso_filial(filial_destino_id))
  with check (private.admin_tem_acesso_filial(filial_destino_id));

alter table public.venda_outra_filial_adicionais enable row level security;
drop policy if exists regional_venda_outra_filial_adicionais_scope on public.venda_outra_filial_adicionais;
create policy regional_venda_outra_filial_adicionais_scope on public.venda_outra_filial_adicionais
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.vendas_outras_filiais v
    where v.id = venda_outra_filial_adicionais.venda_outra_filial_id
      and private.admin_tem_acesso_filial(v.filial_destino_id)
  ))
  with check (exists (
    select 1 from public.vendas_outras_filiais v
    where v.id = venda_outra_filial_adicionais.venda_outra_filial_id
      and private.admin_tem_acesso_filial(v.filial_destino_id)
  ));

-- Adicionais avulsos pertencem à filial do vendedor associado.
alter table public.adicionais_avulsos enable row level security;
drop policy if exists regional_adicionais_avulsos_scope on public.adicionais_avulsos;
create policy regional_adicionais_avulsos_scope on public.adicionais_avulsos
  as restrictive for all to authenticated
  using (exists (
    select 1 from public.vendedores v
    where v.id = adicionais_avulsos.vendedor_id
      and private.admin_tem_acesso_filial(v.filial_id)
  ))
  with check (exists (
    select 1 from public.vendedores v
    where v.id = adicionais_avulsos.vendedor_id
      and private.admin_tem_acesso_filial(v.filial_id)
  ));

-- Impede associar uma venda a vendedor que não pertença à filial de origem.
create or replace function private.validar_filial_origem_venda()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  vendedor_filial_id bigint;
begin
  if new.vendedor_id is null then return new; end if;
  select v.filial_id into vendedor_filial_id
  from public.vendedores v where v.id = new.vendedor_id;
  if vendedor_filial_id is distinct from new.filial_origem_id then
    raise exception 'A filial de origem precisa corresponder à filial do vendedor.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists validar_filial_origem_venda on public.vendas;
create trigger validar_filial_origem_venda
  before insert or update of vendedor_id, filial_origem_id on public.vendas
  for each row execute function private.validar_filial_origem_venda();

-- Views administrativas executam sob o RLS da sessão. As views públicas
-- permanecem disponíveis ao site anônimo, mas não podem ser usadas por uma
-- sessão autenticada para contornar as regras regionais.
alter view public.vendas_admin set (security_invoker = true);

create or replace view public.vendas_outras_filiais_admin
with (security_invoker = true)
as
select v.id,
       v.filial_id,
       v.plano_id,
       v.quantidade,
       v.valor_unitario,
       v.valor_total,
       v.data_venda,
       v.observacao,
       f.nome as filial_nome,
       p.nome as plano_nome,
       v.filial_destino_id
from public.vendas_outras_filiais v
join public.filiais f on f.id = v.filial_id
join public.planos p on p.id = v.plano_id;

revoke all on public.vendas_admin from public, anon, authenticated;
grant select on public.vendas_admin to authenticated;
revoke all on public.vendas_outras_filiais_admin from public, anon, authenticated;
grant select on public.vendas_outras_filiais_admin to authenticated;

revoke all on public.vendas_ranking_publicas from public, authenticated;
grant select on public.vendas_ranking_publicas to anon;
revoke all on public.vendas_outras_filiais_publicas from public, authenticated;
grant select on public.vendas_outras_filiais_publicas to anon;

commit;

-- Cadastro de novas contas regionais (execute como proprietário do banco):
-- update public.admin_usuarios
-- set filial_id = (select id from public.filiais where slug = 'ji-parana'),
--     is_superadmin = false
-- where user_id = '<UUID_DO_NOVO_ADMIN>' and ativo is true;
