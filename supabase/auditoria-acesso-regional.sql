-- Auditoria somente de leitura antes de aplicar RLS por regional.
-- Execute no Supabase SQL Editor e compartilhe os resultados (remova UUIDs
-- se preferir). Este arquivo não altera tabelas, políticas nem dados.

-- 1. Colunas das tabelas que o painel usa para filiais, vendedores e vendas.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'filiais', 'admin_usuarios', 'vendedores', 'metas', 'metas_filial',
    'metas_renovacao_cancelamento', 'destaques_renovacao', 'vendas',
    'venda_adicionais', 'vendas_outras_filiais',
    'venda_outra_filial_adicionais', 'adicionais_avulsos'
  )
order by table_name, ordinal_position;

-- 2. RLS habilitado e políticas já existentes nas mesmas tabelas.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in (
    'filiais', 'admin_usuarios', 'vendedores', 'metas', 'metas_filial',
    'metas_renovacao_cancelamento', 'destaques_renovacao', 'vendas',
    'venda_adicionais', 'vendas_outras_filiais',
    'venda_outra_filial_adicionais', 'adicionais_avulsos'
  )
order by c.relname;

select schemaname, tablename, policyname, permissive, roles,
       cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'filiais', 'admin_usuarios', 'vendedores', 'metas', 'metas_filial',
    'metas_renovacao_cancelamento', 'destaques_renovacao', 'vendas',
    'venda_adicionais', 'vendas_outras_filiais',
    'venda_outra_filial_adicionais', 'adicionais_avulsos'
  )
order by tablename, policyname;

-- 3. Vínculos atuais dos administradores sem outros dados de perfil.
--    filial_id/is_superadmin são lidos do JSON para a consulta funcionar
--    mesmo antes de essas colunas serem criadas.
select a.user_id,
       to_jsonb(a)->>'ativo' as ativo,
       to_jsonb(a)->>'filial_id' as filial_id,
       to_jsonb(a)->>'is_superadmin' as is_superadmin
from public.admin_usuarios a
order by a.user_id;

-- 4. Filiais cadastradas para confirmar os IDs/identificadores usados.
select id, nome, slug, ativo
from public.filiais
order by id;

-- 5. Views e RPCs acessadas pelo painel. Verifique se as views de vendas
--    respeitam RLS (security_invoker) e se a RPC de limpeza confere filial.
select n.nspname as schema_name,
       c.relname as view_name,
       coalesce(array_to_string(c.reloptions, ', '), '') as view_options,
       pg_get_viewdef(c.oid, true) as definition
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('v', 'm')
  and c.relname in (
    'vendas_admin', 'vendas_ranking_publicas',
    'vendas_outras_filiais_publicas'
  )
order by c.relname;

select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('apagar_vendas_mes', 'is_admin', 'admin_tem_acesso', 'admin_tem_acesso_filial')
order by n.nspname, p.proname;

-- 6. Esquema e RLS dos recursos globais compartilhados entre filiais.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('planos', 'produtos_adicionais', 'site_config')
order by table_name, ordinal_position;

select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       p.policyname,
       p.permissive,
       p.roles,
       p.cmd,
       p.qual,
       p.with_check
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and c.relname in ('planos', 'produtos_adicionais', 'site_config')
order by c.relname, p.policyname;
