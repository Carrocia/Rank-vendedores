import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../xp-comercial-acumulado.sql', import.meta.url), 'utf8');
const rankSql = readFileSync(new URL('../fechamento-progressao-ranks.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../../assets/js/supabase-admin.js', import.meta.url), 'utf8');
const defaults = sql.match(/faixas_ticket jsonb not null default '(\[.*?\])'::jsonb/);
assert.ok(defaults, 'Central ticket tiers exist in the migration');
const tiers = JSON.parse(defaults[1]);

let failures = 0;
function run(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}

function multiplier(ticket) {
  if (ticket == null || !Number.isFinite(ticket) || ticket <= 0) return null;
  return tiers.find(t => ticket >= t.min && (t.max == null || ticket < t.max))?.multiplicador ?? null;
}

function score({ sales = 0, renewals = 0, ticket = null, external = false, salesGoal = 0, renewalGoal = 0, bonusesEnabled = false, salesBonus = 0, renewalBonus = 0 }) {
  const baseSales = sales * 100;
  const rate = multiplier(ticket);
  const salesTotal = rate == null ? baseSales : Math.round(baseSales * rate * 100) / 100;
  const ticketBonus = salesTotal - baseSales;
  const renewalXp = renewals * 60;
  const goalSales = bonusesEnabled && salesGoal > 0 && sales >= salesGoal ? salesBonus : 0;
  const goalRenewals = bonusesEnabled && !external && renewalGoal > 0 && renewals >= renewalGoal ? renewalBonus : 0;
  return { baseSales, rate, salesTotal, ticketBonus, renewalXp, goalSales, goalRenewals, total: salesTotal + renewalXp + goalSales + goalRenewals };
}

run('configured activity bases and all ticket boundaries', () => {
  assert.match(sql, /xp_venda_nova numeric\(10,2\) not null default 100/);
  assert.match(sql, /xp_renovacao numeric\(10,2\) not null default 60/);
  const cases = [[99.99, .8], [100, .9], [100.99, .9], [101, 1.05], [104.99, 1.05], [105, 1.1], [110, 1.2], [115, 1.3], [120, 1.45], [130, 1.7], [400, 1.7]];
  for (const [ticket, expected] of cases) assert.equal(multiplier(ticket), expected, `ticket ${ticket}`);
});

run('ticket brackets are contiguous and reject gaps or overlaps', () => {
  assert.match(sql, /faixas_ticket_xp_validas/);
  assert.match(sql, /v_min <> v_anterior/);
  assert.match(sql, /faixas.*contínuas, sem lacunas ou sobreposições/s);
  assert.equal(tiers[0].min, 0);
  assert.equal(tiers.at(-1).max, null);
  for (let i = 1; i < tiers.length; i++) assert.equal(tiers[i].min, tiers[i - 1].max);
});

run('sale XP uses 100 times the ticket multiplier and central rounding', () => {
  assert.equal(score({ sales: 3, ticket: 99 }).salesTotal, 240);
  assert.equal(score({ sales: 3, ticket: 101 }).salesTotal, 315);
  assert.match(sql, /round\(v_xp_base_vendas \* v_multiplicador, v_config\.escala_arredondamento\)/);
});

run('renewals receive 60 XP each without the sales ticket multiplier', () => {
  const result = score({ sales: 2, renewals: 4, ticket: 130 });
  assert.equal(result.renewalXp, 240);
  assert.match(sql, /v_xp_renovacoes := round\(v_renovacoes \* v_config\.xp_renovacao, v_config\.escala_arredondamento\)/);
  assert.doesNotMatch(sql, /v_xp_renovacoes := round\([^\n]*v_multiplicador/);
});

run('renewal goal bonus is inapplicable to external sellers', () => {
  const result = score({ renewals: 10, external: true, renewalGoal: 5, bonusesEnabled: true, renewalBonus: 50 });
  assert.equal(result.renewalXp, 600);
  assert.equal(result.goalRenewals, 0);
  assert.match(sql, /v_vendedor\.tipo <> 'externo' and v_meta_renovacoes/);
});

run('goal bonuses are prepared but disabled and zero by default', () => {
  assert.match(sql, /bonus_metas_ativo boolean not null default false/);
  assert.match(sql, /bonus_meta_vendas numeric\(10,2\) not null default 0/);
  assert.match(sql, /bonus_meta_renovacoes numeric\(10,2\) not null default 0/);
  assert.equal(score({ sales: 10, renewals: 10, salesGoal: 1, renewalGoal: 1 }).goalSales, 0);
});

run('missing ticket preserves activity base without inventing a multiplier', () => {
  const result = score({ sales: 2, ticket: null });
  assert.equal(result.rate, null);
  assert.equal(result.salesTotal, 200);
  assert.equal(result.ticketBonus, 0);
  assert.match(sql, /Dado de ticket ausente: mantém apenas o XP-base, sem bônus ou redutor/);
});

run('repeat calculation upserts one period per career identity and month', () => {
  assert.match(sql, /unique \(carreira_pessoa_id, ano, mes\)/);
  assert.match(sql, /on conflict \(carreira_pessoa_id, ano, mes\) do update/);
  assert.match(sql, /status = 'provisorio'/);
});

run('historical ticket changes affect only that period and closed XP stays frozen', () => {
  assert.match(sql, /if found and v_periodo\.status = 'fechado' then/);
  assert.match(sql, /set status = 'provisorio'/);
  assert.match(sql, /Somente o superadministrador pode corrigir XP de mês fechado/);
  assert.match(sql, /nullif\(trim\(p_motivo\), ''\) is null/);
  assert.match(sql, /xp_comercial_auditoria/);
});

run('campaigns require advance setup and log changes', () => {
  assert.match(sql, /new\.data_inicio <= v_hoje/);
  assert.match(sql, /Uma campanha iniciada não pode ser alterada retroativamente/);
  assert.match(sql, /campanhas_xp_comercial_auditoria/);
  assert.match(sql, /percentual_referencia/);
});

run('sales use the existing administrative data and renewal aggregate sources', () => {
  assert.match(sql, /join public\.vendas_admin sa on sa\.vendedor_id = v\.id/);
  assert.match(sql, /join public\.renovacoes_mensais rm on rm\.vendedor_id = v\.id/);
  assert.match(sql, /sa\.fora_filial is not true/);
  assert.match(sql, /sa\.filial_origem_id = v\.filial_id/);
});

run('career XP is accumulated independently and monthly rank SQL is preserved', () => {
  assert.match(sql, /sum\(p\.xp_total_periodo\)/);
  assert.match(rankSql, /calcular_rank_mensal_filial_vivo/);
  assert.match(ui, /consolidar_rank_mensal_filial/);
  assert.match(ui, /consolidar_xp_comercial_filial/);
  assert.doesNotMatch(sql, /rank_mensal\s*=/);
});

run('period close waits until after the first week and has a correction path', () => {
  assert.match(sql, /interval '1 month' \+ interval '7 days'/);
  assert.match(sql, /consolidar_xp_comercial_filial/);
  assert.match(sql, /corrigir_xp_comercial_fechado/);
});

if (failures) process.exitCode = 1;
