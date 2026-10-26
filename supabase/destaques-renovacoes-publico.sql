-- Public, read-only monthly renewal leaderboard scoped to one selected branch.
begin;

create or replace function public.destaques_renovacoes_mensais(
  p_filial_id bigint,
  p_mes integer,
  p_ano integer
)
returns table (
  posicao bigint,
  vendedor_id bigint,
  vendedor_nome text,
  tipo text,
  quantidade bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  select dense_rank() over (order by sum(r.quantidade) desc) as posicao,
         v.id as vendedor_id,
         v.nome as vendedor_nome,
         v.tipo::text as tipo,
         sum(r.quantidade)::bigint as quantidade
  from public.renovacoes_mensais r
  join public.vendedores v on v.id = r.vendedor_id and v.filial_id = r.filial_id
  where r.filial_id = p_filial_id
    and r.mes = p_mes
    and r.ano = p_ano
    and r.quantidade > 0
  group by v.id, v.nome, v.tipo
  order by sum(r.quantidade) desc, v.nome asc
  limit 5;
$function$;

revoke all on function public.destaques_renovacoes_mensais(bigint, integer, integer) from public;
grant execute on function public.destaques_renovacoes_mensais(bigint, integer, integer) to anon, authenticated;

commit;
notify pgrst, 'reload schema';
