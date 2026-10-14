-- Retorna somente o externo com mais vendas da rede na semana e no mês atuais.
-- As vendas são atribuídas à filial de origem do vendedor, inclusive quando
-- destinadas a outra regional, seguindo o ranking semanal existente.
create or replace function public.destaques_externos_globais()
returns table (
  periodo text,
  filial_id bigint,
  filial_nome text,
  vendedor_id bigint,
  vendedor_nome text,
  vendas bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with relogio as (
    select now() at time zone 'America/Manaus' as agora_local
  ),
  periodos as (
    select
      'semana'::text as periodo,
      date_trunc('week', agora_local) at time zone 'America/Manaus' as inicio,
      (date_trunc('week', agora_local) + interval '1 week') at time zone 'America/Manaus' as fim
    from relogio
    union all
    select
      'mes'::text,
      date_trunc('month', agora_local) at time zone 'America/Manaus',
      (date_trunc('month', agora_local) + interval '1 month') at time zone 'America/Manaus'
    from relogio
  ),
  totais as (
    select
      p.periodo,
      f.id as filial_id,
      f.nome::text as filial_nome,
      vd.id as vendedor_id,
      vd.nome::text as vendedor_nome,
      count(*)::bigint as vendas
    from periodos p
    join public.vendas v on v.data_venda >= p.inicio and v.data_venda < p.fim
    join public.vendedores vd on vd.id = v.vendedor_id
      and vd.tipo::text = 'externo'
      and vd.ativo is true
      and v.filial_origem_id = vd.filial_id
    join public.filiais f on f.id = vd.filial_id and f.ativo is true
    where v.fora_filial is not true
    group by p.periodo, f.id, f.nome, vd.id, vd.nome
  ),
  classificados as (
    select
      totais.*,
      row_number() over (
        partition by periodo
        order by vendas desc, vendedor_nome asc, filial_nome asc
      ) as posicao
    from totais
  )
  select periodo, filial_id, filial_nome, vendedor_id, vendedor_nome, vendas
  from classificados
  where posicao = 1
  order by case periodo when 'semana' then 1 else 2 end;
$function$;

revoke all on function public.destaques_externos_globais() from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.destaques_externos_globais() to anon, authenticated;

notify pgrst, 'reload schema';
