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

do $block$
declare
  maior_id bigint;
  sequencia_id regclass;
  ultimo_id_sequencia bigint;
  sequencia_ja_usada boolean;
begin
  sequencia_id := pg_get_serial_sequence('public.vendedores', 'id')::regclass;
  if sequencia_id is null then
    sequencia_id := to_regclass('public.vendedores_id_seq');
    if sequencia_id is null then
      execute 'create sequence public.vendedores_id_seq';
      sequencia_id := 'public.vendedores_id_seq'::regclass;
    end if;
    execute format(
      'alter table public.vendedores alter column id set default nextval(%L::regclass)',
      sequencia_id::text
    );
  end if;

  select max(id) into maior_id from public.vendedores;
  execute format('select last_value, is_called from %s', sequencia_id)
    into ultimo_id_sequencia, sequencia_ja_usada;
  if maior_id is not null and (maior_id > ultimo_id_sequencia or not sequencia_ja_usada) then
    perform setval(sequencia_id, maior_id, true);
  elsif maior_id is null and not sequencia_ja_usada then
    perform setval(sequencia_id, 1, false);
  end if;
  execute format('grant usage, select on sequence %s to authenticated', sequencia_id);
end;
$block$;
grant insert on table public.vendedores to authenticated;

alter table public.vendedores
  add column if not exists foto_url text;
grant update (foto_url) on table public.vendedores to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vendedor-fotos',
  'vendedor-fotos',
  true,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- As fotos são usadas no ranking público; uploads e substituições seguem RLS por filial.

drop policy if exists vendedor_fotos_insert_allow on storage.objects;
create policy vendedor_fotos_insert_allow on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(
      case
        when split_part(name, '/', 1) ~ '^[0-9]+$'
          then split_part(name, '/', 1)::bigint
        else null
      end
    )
  );
drop policy if exists vendedor_fotos_insert_scope on storage.objects;
create policy vendedor_fotos_insert_scope on storage.objects
  as restrictive for insert to authenticated
  with check (
    bucket_id <> 'vendedor-fotos'
    or (
      name ~ '^[0-9]+/[0-9]+/avatar$'
      and private.admin_tem_acesso_filial(
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

drop policy if exists vendedor_fotos_select_allow on storage.objects;
create policy vendedor_fotos_select_allow on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(
      case
        when split_part(name, '/', 1) ~ '^[0-9]+$'
          then split_part(name, '/', 1)::bigint
        else null
      end
    )
  );
drop policy if exists vendedor_fotos_select_scope on storage.objects;
create policy vendedor_fotos_select_scope on storage.objects
  as restrictive for select to authenticated
  using (
    bucket_id <> 'vendedor-fotos'
    or (
      name ~ '^[0-9]+/[0-9]+/avatar$'
      and private.admin_tem_acesso_filial(
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

drop policy if exists vendedor_fotos_update_allow on storage.objects;
create policy vendedor_fotos_update_allow on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(
      case
        when split_part(name, '/', 1) ~ '^[0-9]+$'
          then split_part(name, '/', 1)::bigint
        else null
      end
    )
  )
  with check (
    bucket_id = 'vendedor-fotos'
    and name ~ '^[0-9]+/[0-9]+/avatar$'
    and private.admin_tem_acesso_filial(
      case
        when split_part(name, '/', 1) ~ '^[0-9]+$'
          then split_part(name, '/', 1)::bigint
        else null
      end
    )
  );
drop policy if exists vendedor_fotos_update_scope on storage.objects;
create policy vendedor_fotos_update_scope on storage.objects
  as restrictive for update to authenticated
  using (
    bucket_id <> 'vendedor-fotos'
    or (
      name ~ '^[0-9]+/[0-9]+/avatar$'
      and private.admin_tem_acesso_filial(
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  )
  with check (
    bucket_id <> 'vendedor-fotos'
    or (
      name ~ '^[0-9]+/[0-9]+/avatar$'
      and private.admin_tem_acesso_filial(
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

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
