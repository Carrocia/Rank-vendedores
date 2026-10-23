import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let failures = 0;
function runTest(name, fn) {
  try { fn(); process.stdout.write(`PASS ${name}\n`); }
  catch (error) { failures++; process.stderr.write(`FAIL ${name}: ${error.message}\n`); }
}

const sqlFiles = [
  'supabase/progressao-ranks-carreira.sql',
  'supabase/fechamento-progressao-ranks.sql',
  'supabase/atualizar-regras-rank-mensal.sql',
].map(path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'));

const rules = [
  { rank: 'S', sales: 1.15, ticket: 130, renewals: 1.00 },
  { rank: 'A', sales: 1.00, ticket: 120, renewals: 0.85 },
  { rank: 'B', sales: 0.85, ticket: 115, renewals: 0.65 },
  { rank: 'C', sales: 0.70, ticket: 110, renewals: 0.50 },
  { rank: 'D', sales: 0.50, ticket: 105, renewals: 0 },
];

function classify({ salesPct, ticket, renewalPct = null, external = false, metaValid = true, renewalMetaValid = true }) {
  if (!metaValid || ticket == null || !Number.isFinite(ticket) || ticket <= 0) return null;
  if (!external && !renewalMetaValid) return null;
  return rules.find(rule => salesPct >= rule.sales && ticket >= rule.ticket
    && (external || rule.renewals === 0 || renewalPct >= rule.renewals))?.rank ?? null;
}

runTest('database SQL contains the agreed thresholds and never auto-assigns SS', () => {
  for (const sql of sqlFiles) {
    for (const rule of rules) {
      const expected = rule.renewals
        ? `when e.pct_vendas >= ${rule.sales.toFixed(2)} and (e.somente_externo or e.pct_renovacoes >= ${rule.renewals.toFixed(2)}) and e.ticket_medio_valido >= ${rule.ticket} then '${rule.rank}'`
        : `when e.pct_vendas >= ${rule.sales.toFixed(2)} and e.ticket_medio_valido >= ${rule.ticket} then '${rule.rank}'`;
      assert.ok(sql.includes(expected), `Missing SQL rule: ${expected}`);
    }
    assert.match(sql, /else null\s+end::text as rank_mensal/);
    assert.doesNotMatch(sql, /then 'SS'/);
  }
});

runTest('each rank is awarded at its exact inclusive boundary', () => {
  for (const rule of rules) {
    assert.equal(classify({ salesPct: rule.sales, ticket: rule.ticket, renewalPct: rule.renewals, external: true }), rule.rank);
  }
});

runTest('exceeding one threshold cannot compensate for missing the other', () => {
  assert.equal(classify({ salesPct: 1.50, ticket: 104.99, external: true }), null);
  assert.equal(classify({ salesPct: 0.4999, ticket: 200, external: true }), null);
  assert.equal(classify({ salesPct: 0.90, ticket: 114.99, external: true }), 'C');
  assert.equal(classify({ salesPct: 0.9999, ticket: 125, external: true }), 'B');
  assert.equal(classify({ salesPct: 1.15, ticket: 129.99, external: true }), 'A');
});

runTest('the highest qualifying rank wins while SS stays unavailable', () => {
  assert.equal(classify({ salesPct: 1.50, ticket: 200, external: true }), 'S');
});

runTest('internal renewal criteria remain additional while external roles bypass them', () => {
  assert.equal(classify({ salesPct: 0.50, ticket: 105, renewalPct: 0 }), 'D');
  assert.equal(classify({ salesPct: 0.70, ticket: 110, renewalPct: 0.4999 }), 'D');
  assert.equal(classify({ salesPct: 0.70, ticket: 110, renewalPct: 0.50 }), 'C');
  assert.equal(classify({ salesPct: 0.85, ticket: 115, renewalPct: 0.6499 }), 'C');
  assert.equal(classify({ salesPct: 0.85, ticket: 115, renewalPct: 0.65 }), 'B');
  assert.equal(classify({ salesPct: 1.00, ticket: 120, renewalPct: 0.8499 }), 'B');
  assert.equal(classify({ salesPct: 1.00, ticket: 120, renewalPct: 0.85 }), 'A');
  assert.equal(classify({ salesPct: 1.15, ticket: 130, renewalPct: 0.9999 }), 'A');
  assert.equal(classify({ salesPct: 1.15, ticket: 130, renewalPct: 1.00 }), 'S');
  assert.equal(classify({ salesPct: 1.15, ticket: 130, renewalPct: 0, external: true }), 'S');
  assert.equal(classify({ salesPct: 1.15, ticket: 130, external: true, renewalMetaValid: false }), 'S');
});

runTest('missing official goal, required renewal meta, or usable data produces no rank', () => {
  assert.equal(classify({ salesPct: 1.2, ticket: 150, metaValid: false, external: true }), null);
  assert.equal(classify({ salesPct: 1.2, ticket: 150, renewalMetaValid: false }), null);
  assert.equal(classify({ salesPct: 1.2, ticket: null, external: true }), null);
  assert.equal(classify({ salesPct: 0.49, ticket: 104.99, external: true }), null);
});

if (failures) process.exitCode = 1;

