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
