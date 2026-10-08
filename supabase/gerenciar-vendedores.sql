-- Permite que o painel edite os dados básicos e ative/desative vendedores.
-- A RLS já limita cada alteração à filial autorizada para o administrador.
-- O painel mantém filial_id e slug estáveis para preservar o histórico e
-- referências existentes; remoção física não é concedida.

begin;

grant update (nome, tipo, ativo, foto_url)
  on table public.vendedores to authenticated;

commit;
