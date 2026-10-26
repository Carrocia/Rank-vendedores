-- Atualiza instalações que já executaram renovacoes-mensais.sql.
-- Ativa a fila de conferência e permite registrar renovações feitas por
-- vendedores cadastrados em outra filial, mantendo os dados sob a filial
-- selecionada e seu escopo administrativo.
begin;

alter table public.renovacoes_registros
  add column if not exists plano_id bigint references public.planos(id) on delete set null,
  add column if not exists conferencia_pendente boolean not null default false;

drop policy if exists renovacoes_mensais_admin_write on public.renovacoes_mensais;
create policy renovacoes_mensais_admin_write on public.renovacoes_mensais
  for all to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (
    private.admin_tem_acesso_filial(filial_id)
    and exists (select 1 from public.vendedores v where v.id = vendedor_id)
  );

drop policy if exists renovacoes_registros_admin_access on public.renovacoes_registros;
create policy renovacoes_registros_admin_access on public.renovacoes_registros
  for all to authenticated
  using (private.admin_tem_acesso_filial(filial_id))
  with check (
    private.admin_tem_acesso_filial(filial_id)
    and exists (select 1 from public.vendedores v where v.id = vendedor_id)
  );

create or replace function public.substituir_registros_renovacao(
  p_filial_id bigint, p_mes integer, p_ano integer, p_arquivo text, p_linhas jsonb
)
returns integer
language plpgsql security definer set search_path = ''
as $function$
declare
  linhas_inseridas integer;
begin
  if auth.uid() is null or not private.admin_tem_acesso_filial(p_filial_id) then
    raise exception 'Sem permissão para atualizar renovações desta filial.' using errcode = '42501';
  end if;
  if p_mes < 1 or p_mes > 12 or p_ano < 2000 or p_ano > 2200 or p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Mês, ano ou linhas do relatório inválidos.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(p_filial_id::integer, p_ano * 12 + p_mes);
  if exists (
    select 1
    from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
    left join public.vendedores v on v.id = r.vendedor_id
    where v.id is null or nullif(trim(r.contrato), '') is null
      or nullif(trim(r.cliente), '') is null or nullif(trim(r.plano), '') is null
      or r.valor is null or r.valor < 0 or r.data is null or r.conferencia_pendente is null
      or (r.plano_id is not null and not exists (select 1 from public.planos p where p.id = r.plano_id))
      or extract(month from r.data)::integer <> p_mes or extract(year from r.data)::integer <> p_ano
  ) then
    raise exception 'O relatório contém dados inválidos ou data fora do mês.' using errcode = '22023';
  end if;

  insert into public.renovacoes_registros (
    filial_id, vendedor_id, mes, ano, contrato, cliente, plano, plano_id,
    valor, data_renovacao, conferencia_pendente, arquivo_origem
  )
  select p_filial_id, r.vendedor_id, p_mes, p_ano, regexp_replace(trim(r.contrato), '\s+', '', 'g'), trim(r.cliente), trim(r.plano),
    r.plano_id, r.valor, r.data, r.conferencia_pendente, left(p_arquivo, 255)
  from jsonb_to_recordset(p_linhas) as r(vendedor_id bigint, contrato text, cliente text, plano text, plano_id bigint, valor numeric, data date, conferencia_pendente boolean)
  on conflict (filial_id, mes, ano, contrato) do nothing;
  get diagnostics linhas_inseridas = row_count;

  delete from public.renovacoes_mensais where filial_id = p_filial_id and mes = p_mes and ano = p_ano;
  insert into public.renovacoes_mensais (filial_id, vendedor_id, mes, ano, quantidade, arquivo_origem)
  select p_filial_id, vendedor_id, p_mes, p_ano, count(*)::integer, left(p_arquivo, 255)
  from public.renovacoes_registros
  where filial_id = p_filial_id and mes = p_mes and ano = p_ano
  group by vendedor_id;
  return linhas_inseridas;
end;
$function$;
revoke all on function public.substituir_registros_renovacao(bigint, integer, integer, text, jsonb) from public, anon;
grant execute on function public.substituir_registros_renovacao(bigint, integer, integer, text, jsonb) to authenticated;

create or replace function public.resolver_conferencia_renovacao(
  p_registro_id bigint, p_plano_id bigint, p_plano text, p_valor numeric
)
returns void
language plpgsql security definer set search_path = ''
as $function$
declare
  v_filial_id bigint;
  v_nome_plano text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação administrativa necessária.' using errcode = '42501';
  end if;
  if p_valor is null or p_valor < 0 or nullif(trim(p_plano), '') is null then
    raise exception 'Plano e valor da renovação inválidos.' using errcode = '22023';
  end if;
  select p.nome into v_nome_plano from public.planos p where p.id = p_plano_id;
  if v_nome_plano is null then
    raise exception 'O plano selecionado não existe no catálogo.' using errcode = '22023';
  end if;
  select filial_id into v_filial_id from public.renovacoes_registros
  where id = p_registro_id and conferencia_pendente = true;
  if v_filial_id is null or not private.admin_tem_acesso_filial(v_filial_id) then
    raise exception 'Renovação pendente não encontrada ou sem acesso à filial.' using errcode = '42501';
  end if;
  update public.renovacoes_registros
  set plano_id = p_plano_id, plano = v_nome_plano, valor = p_valor, conferencia_pendente = false
  where id = p_registro_id and conferencia_pendente = true;
end;
$function$;
revoke all on function public.resolver_conferencia_renovacao(bigint, bigint, text, numeric) from public, anon;
grant execute on function public.resolver_conferencia_renovacao(bigint, bigint, text, numeric) to authenticated;

commit;
notify pgrst, 'reload schema';
