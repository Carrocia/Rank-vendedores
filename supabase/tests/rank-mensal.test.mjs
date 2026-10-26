import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const currentSql = readFileSync(new URL('../atualizar-regras-rank-mensal.sql', import.meta.url), 'utf8');
const closingSql = readFileSync(new URL('../fechamento-progressao-ranks.sql', import.meta.url), 'utf8');

let failures = 0;
function run(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}

function score({ sales = 0, meta = 0, ticket = 0, reference = 0, activeDays = 0, highVolumeDays = 0, currentWeek = 0, previousWeek = 0, renewals = 0, external = false }) {
  const salesXp = meta > 0 ? Math.min(35, Math.max(0, sales / meta * 35)) : 0;
  const ticketXp = reference > 0 ? Math.min(20, Math.max(0, (ticket / reference - 0.8) * 66.6666667)) : 0;
  const consistencyXp = Math.min(20, activeDays / 10 * 20);
  const volumeXp = Math.min(10, highVolumeDays * 2);
  const weeklyXp = previousWeek > 0
    ? Math.min(10, Math.max(0, (currentWeek - previousWeek) / previousWeek * 20))
    : currentWeek > 0 ? 4 : 0;
  const renewalXp = external ? 0 : Math.min(5, renewals * 0.25);
  const total = Math.min(100, salesXp + ticketXp + consistencyXp + volumeXp + weeklyXp + renewalXp);
  const rank = rankFor(total, meta);
  return { salesXp, ticketXp, consistencyXp, volumeXp, weeklyXp, renewalXp, total, rank };
}

function rankFor(total, meta) {
  return meta <= 0 ? null : total >= 80 ? 'S' : total >= 65 ? 'A' : total >= 50 ? 'B' : total >= 35 ? 'C' : total >= 20 ? 'D' : null;
}

run('current calculation assigns monthly ranks through the existing XP score', () => {
  for (const [points, rank] of [[80, 'S'], [65, 'A'], [50, 'B'], [35, 'C'], [20, 'D']]) {
    assert.ok(currentSql.includes(`when e.xp_total >= ${points} then '${rank}'`), `Missing rank ${rank} at ${points} XP`);
    assert.equal(rankFor(points, 1), rank);
  }
  assert.doesNotMatch(currentSql, /then 'SS'/);
  assert.match(currentSql, /create or replace function public\.calcular_rank_mensal_filial_vivo/);
  assert.match(closingSql, /calcular_rank_mensal_filial_vivo\(p_filial_id, p_mes, p_ano\)/);
});

run('monthly score can progress without hitting M1 and keeps ranks distinct from career XP', () => {
  const profile = score({ sales: 5, meta: 20, ticket: 120, reference: 100, activeDays: 10, highVolumeDays: 3, currentWeek: 3, previousWeek: 2 });
  assert.equal(profile.rank, 'B');
  assert.ok(profile.total < 80);
});

run('rank thresholds are inclusive at exact score boundaries', () => {
  const cases = [
    [{ sales: 20, meta: 20, activeDays: 10, ticket: 110, reference: 100, renewals: 20 }, 'S'],
    [{ sales: 20, meta: 20, activeDays: 10, ticket: 95, reference: 100 }, 'A'],
    [{ sales: 20, meta: 20, activeDays: 7.5 }, 'B'],
    [{ sales: 20, meta: 20 }, 'C'],
    [{ sales: 0, meta: 1, activeDays: 10 }, 'D'],
  ];
  for (const [input, expected] of cases) assert.equal(score(input).rank, expected);
});

run('ticket contributes gradually and is not an eliminatory requirement', () => {
  assert.equal(score({ sales: 1, meta: 1, ticket: 80, reference: 100, activeDays: 10 }).ticketXp, 0);
  assert.ok(Math.abs(score({ sales: 1, meta: 1, ticket: 95, reference: 100, activeDays: 10 }).ticketXp - 10) < 0.00001);
  assert.equal(score({ sales: 1, meta: 1, ticket: 110, reference: 100, activeDays: 10 }).ticketXp, 20);
  assert.equal(score({ sales: 1, meta: 1, ticket: 70, reference: 100 }).rank, 'C');
});

run('activity, constancy, high-volume days, and weekly evolution are capped', () => {
  const result = score({ sales: 100, meta: 20, ticket: 130, reference: 100, activeDays: 20, highVolumeDays: 10, currentWeek: 100, previousWeek: 1, renewals: 100 });
  assert.equal(result.salesXp, 35);
  assert.equal(result.ticketXp, 20);
  assert.equal(result.consistencyXp, 20);
  assert.equal(result.volumeXp, 10);
  assert.equal(result.weeklyXp, 10);
  assert.equal(result.renewalXp, 5);
  assert.equal(result.total, 100);
});

run('external sellers do not receive renewal XP or depend on renewal goals', () => {
  const external = score({ sales: 1, meta: 1, activeDays: 10, renewals: 100, external: true });
  assert.equal(external.renewalXp, 0);
  assert.equal(external.rank, 'B');
  assert.match(currentSql, /when m\.somente_externo then 0::numeric/);
});

run('insufficient sales metadata does not classify and XP alone cannot assign SS', () => {
  assert.equal(score({ sales: 100, meta: 0, ticket: 200, reference: 100, activeDays: 20 }).rank, null);
  assert.match(currentSql, /when not e\.pode_classificar then null/);
  assert.doesNotMatch(currentSql, /then 'SS'/);
});

run('rank closing stores snapshots while monthly XP career migration remains separate', () => {
  assert.match(closingSql, /insert into public\.ranks_carreira_mensais/);
  assert.match(closingSql, /insert into public\.ranks_carreira_periodos_fechados/);
  const xpSql = readFileSync(new URL('../xp-comercial-acumulado.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(xpSql, /rank_mensal\s*=/);
  assert.match(xpSql, /xp_total_periodo/);
});

if (failures) process.exitCode = 1;
