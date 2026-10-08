-- Pré-requisitos para cadastrar vendedores pelo painel.
-- O schema auditado tinha ID bigint sem default e nome único global.

begin;

do $block$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'vendedores'
      and column_name = 'filial_id'
  ) then
    raise exception 'A coluna vendedores.filial_id não existe. Aplique primeiro a migração de acesso regional.';
  end if;
end;
$block$;

create sequence if not exists public.vendedores_id_seq;
select setval(
  'public.vendedores_id_seq'::regclass,
  coalesce(max(id), 1),
  count(*) > 0
)
from public.vendedores;

alter sequence public.vendedores_id_seq owned by public.vendedores.id;
alter table public.vendedores
  alter column id set default nextval('public.vendedores_id_seq'::regclass);

grant usage, select on sequence public.vendedores_id_seq to authenticated;
grant insert on table public.vendedores to authenticated;

-- Nomes iguais podem existir em regionais distintas; dentro da mesma filial,
-- continuam únicos.
alter table public.vendedores
  drop constraint if exists vendedores_nome_key;
create unique index if not exists vendedores_filial_nome_uidx
  on public.vendedores (filial_id, nome);
create unique index if not exists vendedores_filial_slug_uidx
  on public.vendedores (filial_id, slug)
  where slug is not null;

commit;
