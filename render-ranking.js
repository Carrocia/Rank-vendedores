// ═══════════════════════════════════════════════════════════════
// RENDER-RANKING.JS — página pública do ranking
// Tudo que desenha a página pública: pódios, cards de meta,
// gráficos (evolução/donut), conquistas recentes, mural de
// destaques. Inclui showToast() (usado no app inteiro, mora
// aqui por ser a notificação usada nessas telas).
// ═══════════════════════════════════════════════════════════════

function formatVendas(v) {
  return `${v} ${v === 1 ? 'venda' : 'vendas'}`;
}

function animateNumber(el, target, { duration = 900, suffixFn = null } = {}) {
  if (reduceMotion) { el.textContent = suffixFn ? suffixFn(target) : target; return; }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const value = Math.round(target * eased);
    el.textContent = suffixFn ? suffixFn(value) : value;
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ritmo do mes: compara a % da meta de cada vendedor com o % de
// dias do mes que ja passaram (CONFIG.mesRitmo)
function computeRitmo(pct) {
  const { diaAtual, diasNoMes } = calcularPeriodoMes();
  const esperado = (diaAtual / diasNoMes) * 100;
  if (pct >= esperado + 5) return { classe: 'verde',    label: 'Acima do ritmo',  icon: '🟢' };
  if (pct >= esperado - 5) return { classe: 'amarelo',  label: 'No ritmo',        icon: '🟡' };
  return { classe: 'vermelho', label: 'Abaixo do ritmo', icon: '🔴' };
}

// mode: 'semanal' mostra vendas + meta + %  |  'mensal' mostra so % + barra + ritmo
function renderPodium(containerId, entries, options = {}) {
  const mode = options.mode || 'semanal';
  const sorted = [...entries].sort((a, b) => b.vendas - a.vendas);
  const container = document.getElementById(containerId);
  container.innerHTML = sorted.map((e, idx) => {
    const rank = idx + 1;
    const style = RANK_STYLE[rank] || RANK_STYLE[3];
    const pessoa = PESSOAS[e.slug] || PESSOAS[e.id] || {};
    const photo = pessoa.foto || '';
    const nome = e.nome || pessoa.nome || e.id;
    const pct = e.meta ? Math.min(100, Math.round((e.vendas / e.meta) * 100)) : 0;
    const crownHTML = style.crown
      ? '<span class="crown" aria-hidden="true">👑</span><span class="sparkle s1" aria-hidden="true">✨</span><span class="sparkle s2" aria-hidden="true">✨</span>'
      : '';

    let subHTML;
    if (mode === 'semanal') {
      subHTML = `<span class="podium-value" data-target="${e.vendas}" style="margin-bottom:10px;">0 vendas</span>`;
    } else {
      const ritmo = computeRitmo(pct);
      subHTML = `
        <div class="podium-sub podium-sub-mensal">
          <span class="podium-sub-pct-big" data-target="${pct}">0% da meta</span>
          <div class="podium-mini-bar"><div class="podium-mini-bar-fill" data-width="${pct}"></div></div>
          <span class="ritmo-badge ritmo-${ritmo.classe}">${ritmo.icon} ${ritmo.label}</span>
        </div>`;
    }

    const shimmerDelay = rank === 1 ? '0s' : rank === 2 ? '0.4s' : '0.8s';
    const tooltipVendas = mode === 'semanal' ? formatVendas(e.vendas) : '';
    const tooltipMeta = e.meta ? `${Math.min(100,Math.round((e.vendas/e.meta)*100))}% da meta mensal` : '';
    const tooltipContent = mode === 'semanal'
      ? `<strong>${nome}</strong>${tooltipVendas}`
      : `<strong>${nome}</strong>${tooltipMeta}`;
    return `<div class="podium-stand" data-rank="${rank}" style="--rank-color:${style.color};--rank-color-dark:${style.dark};--rank-glow:${style.glow};--gold-c:#ffc94d;">
      <div class="podium-tooltip">${tooltipContent}</div>
      <div class="podium-photo-wrap">
        ${crownHTML}
        <img class="podium-photo" src="${photo}" alt="${nome}">
      </div>
      <span class="podium-name" style="margin-bottom:6px;">${nome}</span>
      ${subHTML}
      <div class="podium-base" data-final-height="${style.height}" style="--shimmer-delay:${shimmerDelay}">
        <span class="rank-number">${rank}º</span>
      </div>
    </div>`;
  }).join('');

  const delayByRank = { 1: 260, 2: 0, 3: 520 }; // 2º sobe primeiro, depois 1º (com fanfarra), depois 3º
  container.querySelectorAll('.podium-stand').forEach(stand => {
    const rank = Number(stand.dataset.rank);
    const base = stand.querySelector('.podium-base');
    const valueEl = stand.querySelector('.podium-value');
    const pctBigEl = stand.querySelector('.podium-sub-pct-big');
    const barFillEl = stand.querySelector('.podium-mini-bar-fill');
    setTimeout(() => {
      base.style.height = base.dataset.finalHeight + 'px';
      if (valueEl) animateNumber(valueEl, Number(valueEl.dataset.target), { suffixFn: formatVendas });
      if (pctBigEl) animateNumber(pctBigEl, Number(pctBigEl.dataset.target), { suffixFn: v => v + '% da meta' });
      if (barFillEl) barFillEl.style.width = barFillEl.dataset.width + '%';
    }, reduceMotion ? 0 : delayByRank[rank] || 0);
  });
}

function renderGoal(containerId, goal) {
  const pct = Math.min(100, Math.round((goal.atual / goal.meta) * 100));
  const el = document.getElementById(containerId);
  const liquid = el.querySelector('.goal-liquid');
  const ringPct = el.querySelector('.goal-ring-pct');
  const currentEl = el.querySelector('.goal-current');
  const targetEl = el.querySelector('.goal-target');

  targetEl.textContent = goal.meta;
  animateNumber(currentEl, goal.atual, { duration: 1300 });

  if (reduceMotion) {
    liquid.style.height = pct + '%';
    ringPct.textContent = pct + '%';
    return;
  }
  const start = performance.now();
  const duration = 1300;
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(pct * eased);
    liquid.style.height = val + '%';
    ringPct.textContent = val + '%';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderMuralPerson(person, role) {
  if (!person) {
    return `
      <div class="mural-winner mural-winner-pending">
        <div class="mural-photo-wrap">
          <div class="mural-photo-pending"><span class="mural-question">?</span></div>
        </div>
        <span class="mural-role">${role}</span>
        <span class="mural-name">A definir</span>
      </div>`;
  }
  const pessoa = PESSOAS[person.id] || {};
  return `
    <div class="mural-winner">
      <div class="mural-photo-wrap">
        <span class="mural-crown" aria-hidden="true">👑</span>
        <img class="mural-photo" src="${pessoa.foto || ''}" alt="${pessoa.nome || ''}">
      </div>
      <span class="mural-role">${role}</span>
      <span class="mural-name">${pessoa.nome || ''}</span>
      <span class="mural-value">${formatVendas(person.vendas)}</span>
    </div>`;
}

function renderHistorico() {
  const container = document.getElementById('muralGrid');
  if (!HISTORICO_DESTAQUES.length) {
    container.innerHTML = '<p class="mural-empty">Nenhum destaque registrado ainda.</p>';
    return;
  }
  container.innerHTML = HISTORICO_DESTAQUES.map(h => `
    <div class="mural-card">
      <span class="mural-month">${h.mes}</span>
      <div class="mural-pair">
        ${renderMuralPerson(h.interno, 'Interno')}
        ${renderMuralPerson(h.externo, 'Externo')}
      </div>
    </div>
  `).join('');
}

// ---------- Card "Meta da Semana" ----------
function animateCard(pct, atual, barFillEl, ringEl, barPctEl, duration = 1300) {
  const ringWrap = document.getElementById('metaRingWrap');
  if (reduceMotion) {
    ringEl.textContent = pct + '%';
    if (ringWrap) ringWrap.style.setProperty('--ring-pct', pct + '%');
    barFillEl.style.width = pct + '%';
    barPctEl.textContent = pct + '% concluído';
    return;
  }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(pct * eased);
    ringEl.textContent = val + '%';
    if (ringWrap) ringWrap.style.setProperty('--ring-pct', val + '%');
    barFillEl.style.width = val + '%';
    barPctEl.textContent = val + '% concluído';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// renderWeekProgress SEMPRE recebe d real (processado a partir do
// Supabase). Se a meta semanal não estiver cadastrada em metas_filial,
// mostra "—" em vez de simular um número.
function renderWeekProgress(d) {
  const semana = d.semana;
  const metaSemanal = (d.metasFilial && d.metasFilial.semanal_m1) || null;
  const vendas = d.totalSemana;
  const diasCorridos = Math.max(1, diasCalendario(semana.inicio, new Date()));
  const pct = metaSemanal ? Math.min(100, Math.round((vendas / metaSemanal) * 100)) : 0;
  const faltam = metaSemanal ? Math.max(0, metaSemanal - vendas) : '—';
  const media = (vendas / diasCorridos).toFixed(1).replace('.', ',');

  document.getElementById('metaCardTitle').textContent = 'Meta da Semana';
  document.getElementById('metaColTitle').textContent = 'Progresso da semana';
  document.getElementById('metaSubLabel').textContent = 'vendas realizadas / meta da semana';
  document.getElementById('metaPctLabel').textContent = 'Seu desempenho semanal';
  document.getElementById('metaFaltamSuffix').textContent = 'vendas para a meta';
  document.getElementById('metaSideBlock3').style.display = '';
  document.getElementById('weekDataLabel').textContent = semana.label;
  document.getElementById('weekMeta').textContent = metaSemanal || '—';
  document.getElementById('weekFaltam').textContent = faltam;
  document.getElementById('weekMedia').textContent = media;
  document.getElementById('weekBarMetaCaption').textContent = metaSemanal ? ('Meta: ' + metaSemanal + ' vendas') : 'Meta não configurada';
  animateNumber(document.getElementById('weekAtual'), vendas, { duration: 1000 });
  animateCard(pct, vendas,
    document.getElementById('weekBarFill'),
    document.getElementById('weekRingPct'),
    document.getElementById('weekBarPct')
  );
}

// renderMensalProgress SEMPRE recebe d real. Se a meta mensal não
// estiver cadastrada em metas_filial, mostra "—" em vez de simular.
function renderMensalProgress(d) {
  const mes = d.mes;
  const metaMensal = (d.metasFilial && d.metasFilial.mensal_m1) || null;
  const vendas = d.totalMes;
  const faltam = metaMensal ? Math.max(0, metaMensal - vendas) : '—';
  const pct = metaMensal ? Math.min(100, Math.round((vendas / metaMensal) * 100)) : 0;
  const mesNome = mes.mesNome ? (mes.mesNome.charAt(0).toUpperCase() + mes.mesNome.slice(1)) : '—';

  document.getElementById('metaCardTitle').textContent = 'Meta do Mês de ' + mesNome;
  document.getElementById('metaColTitle').textContent = 'Progresso do mês';
  document.getElementById('metaSubLabel').textContent = 'vendas realizadas / meta do mês';
  document.getElementById('metaPctLabel').textContent = 'Desempenho mensal da filial';
  document.getElementById('metaFaltamSuffix').textContent = 'vendas para fechar o mês';
  document.getElementById('metaSideBlock3').style.display = 'none';
  document.getElementById('weekDataLabel').textContent = mesNome + ' de ' + mes.ano;
  document.getElementById('weekBarMetaCaption').textContent = metaMensal ? ('Meta: ' + metaMensal + ' vendas') : 'Meta não configurada';
  document.getElementById('weekMeta').textContent = metaMensal || '—';
  document.getElementById('weekFaltam').textContent = faltam;
  animateNumber(document.getElementById('weekAtual'), vendas, { duration: 1000 });
  animateCard(pct, vendas,
    document.getElementById('weekBarFill'),
    document.getElementById('weekRingPct'),
    document.getElementById('weekBarPct')
  );
}
// renderDestaquesSemana SEMPRE recebe d real (processado a partir do
// Supabase). Líder Externo/Interno, Maior Evolução e Maior % da Meta
// são derivados de d.*; Venda Mais Recente vem de d.vendaRecenteLabel,
// que por sua vez vem de loadVendaMaisRecente() — nada é hard-coded.
function renderDestaquesSemana(d) {
  const nomeDe = id => (PESSOAS[id] || {}).nome || id || '—';
  const fotoDe = id => (PESSOAS[id] || {}).foto || '';

  const liderExterno = d.liderExternoSem || {};
  const liderInterno = d.liderInternoSem || {};
  const maiorEvolucao = d.maiorEvolucao || {};
  const maiorPctMeta = d.maiorPct || {};
  const evoValor = maiorEvolucao.evolucao || 0;
  const evoTexto = (evoValor >= 0 ? '+' : '') + evoValor + ' vendas';
  const pctMeta = maiorPctMeta.meta ? Math.round((maiorPctMeta.vendas / maiorPctMeta.meta) * 100) : null;

  const cards = [
    { icon: '👑', cor: 'gold',   label: 'Líder Externo', nome: liderExterno.nome || nomeDe(liderExterno.id), foto: fotoDe(liderExterno.id), valor: formatVendas(liderExterno.vendas || 0) },
    { icon: '👑', cor: 'gold',   label: 'Líder Interno', nome: liderInterno.nome || nomeDe(liderInterno.id), foto: fotoDe(liderInterno.id), valor: formatVendas(liderInterno.vendas || 0) },
    { icon: '⚡', cor: 'purple', label: 'Maior Evolução', nome: maiorEvolucao.nome || nomeDe(maiorEvolucao.id), foto: fotoDe(maiorEvolucao.id), valor: evoTexto },
    { icon: '🎯', cor: 'red',    label: 'Maior % da Meta', nome: maiorPctMeta.nome || nomeDe(maiorPctMeta.id), foto: fotoDe(maiorPctMeta.id), valor: pctMeta !== null ? (pctMeta + '% da meta') : 'Sem meta cadastrada' },
    { icon: '⏱️', cor: 'blue',   label: 'Venda Mais Recente', nome: '', foto: '', valor: d.vendaRecenteLabel || '—' },
  ];

  document.getElementById('destaquesGrid').innerHTML = cards.map(c => `
    <div class="destaque-card">
      <div class="destaque-icon-badge ${c.cor}">${c.icon}</div>
      <span class="destaque-label">${c.label}</span>
      <div class="destaque-pessoa">
        ${c.foto ? `<img class="destaque-foto" src="${c.foto}" alt="${c.nome}">` : ''}
        ${c.nome ? `<span class="destaque-nome">${c.nome}</span>` : ''}
      </div>
      <span class="destaque-valor">${c.valor}</span>
    </div>
  `).join('');
}

// ---------- Metas da Filial (M1 / M2 / M3) ----------
function renderMetasFilial(periodo = 'semanal', d) {
  if (!d || !d.metasFilial) {
    document.getElementById('metasFilialTitle').textContent = periodo === 'semanal'
      ? '🎯 Metas da Filial — Semana' : '🎯 Metas da Filial';
    document.getElementById('metasFilialGrid').innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';
    return;
  }
  const mf = d.metasFilial;
  const atual = periodo === 'semanal' ? d.totalSemana : d.totalMes;
  const prefixo = periodo === 'semanal' ? 'semanal' : 'mensal';
  const metas = [
    { key: 'm1', label: 'M1', dados: { atual, meta: mf[prefixo + '_m1'] || 0 } },
    { key: 'm2', label: 'M2', dados: { atual, meta: mf[prefixo + '_m2'] || 0 } },
    { key: 'm3', label: 'M3', dados: { atual, meta: mf[prefixo + '_m3'] || 0 } },
  ];
  const titulo = periodo === 'semanal'
    ? '🎯 Metas da Filial — Semana'
    : '🎯 Metas da Filial — ' + (d.mes && d.mes.mesNome ? d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1) : CONFIG.mesReferencia);
  document.getElementById('metasFilialTitle').textContent = titulo;

  document.getElementById('metasFilialGrid').innerHTML = metas.map(m => {
    const pct = m.dados.meta ? Math.min(100, Math.round((m.dados.atual / m.dados.meta) * 100)) : 0;
    return `
    <div class="meta-filial-card">
      <span class="meta-filial-label">${m.label}</span>
      <div class="meta-filial-numbers">
        <span class="meta-filial-atual" data-target="${m.dados.atual}">0</span>
        <span class="meta-filial-sep">/ ${m.dados.meta} vendas</span>
      </div>
      <div class="meta-filial-bar-track"><div class="meta-filial-bar-fill" data-width="${pct}" id="metaFilialBar-${m.key}"></div></div>
      <span class="meta-filial-pct" id="metaFilialPct-${m.key}">0% concluído</span>
    </div>`;
  }).join('');

  metas.forEach(m => {
    const pct = m.dados.meta ? Math.min(100, Math.round((m.dados.atual / m.dados.meta) * 100)) : 0;
    const atualEl = document.querySelector(`#metasFilialGrid .meta-filial-card:nth-child(${metas.indexOf(m) + 1}) .meta-filial-atual`);
    if (atualEl) animateNumber(atualEl, m.dados.atual, { duration: 1100 });
    const barEl = document.getElementById('metaFilialBar-' + m.key);
    const pctEl = document.getElementById('metaFilialPct-' + m.key);
    setTimeout(() => {
      if (barEl) barEl.style.width = pct + '%';
      if (pctEl) pctEl.textContent = pct + '% concluído';
    }, 50);
  });
}

// ---------- Evolução da Semana (barras) ----------
function renderEvolucaoChart(vendasPorDia) {
  const diasLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const diasData = vendasPorDia || diasLabels.map(dia => ({ dia, vendas: 0 }));
  const max = Math.max(1, ...diasData.map(d => d.vendas));
  const W = 100, H = 100;
  const padTop = 14, padBottom = 4;
  const plotH = H - padTop - padBottom;
  const stepX = W / (diasData.length - 1);
  const points = diasData.map((d, i) => ({
    xPct: i * stepX,
    yPct: padTop + plotH - (max ? (d.vendas / max) * plotH : 0),
    d
  }));
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.xPct.toFixed(2) + ',' + p.yPct.toFixed(2)).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].xPct.toFixed(2)},${H} L${points[0].xPct.toFixed(2)},${H} Z`;
  const pointsHTML = points.map(p => `
    <div class="evo-point-value" style="left:${p.xPct}%; top:${p.yPct}%;">${p.d.vendas}</div>
    <div class="evo-point" style="left:${p.xPct}%; top:${p.yPct}%;"></div>
  `).join('');
  const labelsHTML = points.map(p => `
    <div class="evo-point-label" style="left:${p.xPct}%;">${p.d.dia}</div>
  `).join('');
  document.getElementById('evolucaoChart').innerHTML = `
    <div class="evo-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="evoAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.35"/>
            <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#evoAreaGrad)" stroke="none"></path>
        <path class="evo-line-path" d="${linePath}" fill="none" vector-effect="non-scaling-stroke" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      ${pointsHTML}
    </div>
    ${labelsHTML}`;
}

// ---------- Vendas por Tipo de Plano (donut com dados reais) ----------
function renderDonutChart(vendasPorPlano) {
  const CORES = ['#21d9ff','#7c5cff','#ffc94d','#ff5f6e','#34d399','#f97316','#a78bfa','#fb7185'];
  const planos = vendasPorPlano || [];
  const total = planos.reduce((s, p) => s + p.vendas, 0);
  const divisor = total || 1; // evita divisão por zero no cálculo de %, nunca é exibido
  let acc = 0;
  const stops = planos.length
    ? planos.map((p, i) => {
        const cor = p.cor || CORES[i % CORES.length];
        const pct = (p.vendas / divisor) * 100;
        const from = acc; acc += pct;
        return `${cor} ${from.toFixed(1)}% ${acc.toFixed(1)}%`;
      }).join(', ')
    : 'var(--surface-hover) 0% 100%';
  document.getElementById('donutChart').style.background = `conic-gradient(${stops})`;
  document.getElementById('donutTotal').textContent = total;
  document.getElementById('donutLegend').innerHTML = planos.map((p, i) => {
    const cor = p.cor || CORES[i % CORES.length];
    const pct = Math.round((p.vendas / divisor) * 100);
    return `
    <div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${cor}"></span>
      <span class="donut-legend-nome">${p.nome}</span>
      <span class="donut-legend-valor">${formatVendas(p.vendas)} · ${pct}%</span>
    </div>`;
  }).join('') || '<div style="font-size:0.78rem;color:var(--text-muted);">Sem dados.</div>';
}

// ---------- Conquistas Recentes ----------
// ── Data relativa pra "Conquistas Recentes" ──────────────────────
// Calculada de novo a cada renderização (não é texto fixo salvo) —
// por isso "Hoje" vira "Ontem" sozinho no dia seguinte, sem que a
// conquista suma da lista.
function formatarDataRelativa(dataISO) {
  const hoje = new Date();
  const data = new Date(dataISO + 'T12:00:00');
  const diffDias = Math.round((new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - new Date(data.getFullYear(), data.getMonth(), data.getDate())) / 86400000);
  if (diffDias <= 0) return 'Hoje';
  if (diffDias === 1) return 'Ontem';
  if (diffDias <= 6) return 'Há ' + diffDias + ' dias';
  if (diffDias <= 13) return 'Semana passada';
  if (diffDias <= 30) return 'Há ' + Math.floor(diffDias / 7) + ' semanas';
  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

// Guarda o histórico real de conquistas (persistido no navegador, só
// pra lembrar "isso já aconteceu e quando" — os dados de origem
// continuam vindo 100% do Supabase a cada carregamento).
function lerHistoricoConquistas() {
  try { return JSON.parse(localStorage.getItem('uni_conquistas_historico') || '[]'); }
  catch (e) { return []; }
}
function salvarHistoricoConquistas(lista) {
  try { localStorage.setItem('uni_conquistas_historico', JSON.stringify(lista.slice(0, 30))); }
  catch (e) { /* localStorage indisponível — conquistas desta sessão não persistem, mas nada quebra */ }
}
function registrarConquista(historico, chaveUnica, texto) {
  if (historico.some(c => c.chave === chaveUnica)) return false;
  const hoje = new Date();
  const dataISO = hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
  historico.unshift({ chave: chaveUnica, texto, data: dataISO });
  return true;
}

// Detecta, a cada carregamento de dados, se algum vendedor bateu uma
// meta individual (M3/M2/M1 pra interno, meta de vendas pra externo)
// pela primeira vez neste mês — e registra como conquista real.
function detectarConquistasIndividuais(d, cache) {
  if (!d || !cache) return;
  const historico = lerHistoricoConquistas();
  const mesAno = cache.mes ? `${cache.mes.ano}-${cache.mes.mesNum}` : '';
  let mudou = false;

  const todos = [...(d.extMes || []), ...(d.intMes || [])];
  todos.forEach(v => {
    if (v.tipo === 'interno') {
      const linhaMeta = (cache.metas || []).find(m => m.vendedor_id === v.id);
      if (!linhaMeta) return;
      const tiers = [
        { campo: 'meta_m3', label: 'M3', medalha: '🥉' },
        { campo: 'meta_m2', label: 'M2', medalha: '🥈' },
        { campo: 'meta_m1', label: 'M1', medalha: '🥇' },
      ];
      tiers.forEach(t => {
        const meta = linhaMeta[t.campo];
        if (!meta) return;
        if (v.vendas >= meta) {
          const chave = `${v.id}_${t.campo}_${mesAno}`;
          const texto = `${t.medalha} ${v.nome} bateu a ${t.label} do mês!`;
          if (registrarConquista(historico, chave, texto)) mudou = true;
        }
      });
    } else if (v.tipo === 'externo' && v.meta) {
      if (v.vendas >= v.meta) {
        const chave = `${v.id}_meta_vendas_${mesAno}`;
        const texto = `🏆 ${v.nome} bateu a meta de vendas do mês!`;
        if (registrarConquista(historico, chave, texto)) mudou = true;
      }
    }
  });

  if (mudou) salvarHistoricoConquistas(historico);
}

// ---------- Conquistas Recentes ----------
function renderConquistas() {
  const historico = lerHistoricoConquistas();
  const lista = historico.slice(0, 8).map(c => ({ texto: c.texto, quando: formatarDataRelativa(c.data) }));
  document.getElementById('conquistasGrid').innerHTML = lista.map(c => `
    <div class="conquista-card">
      <span class="conquista-texto">${c.texto}</span>
      ${c.quando ? `<span class="conquista-quando">${c.quando}</span>` : ''}
    </div>
  `).join('') || '<div style="color:var(--text-muted);font-size:0.82rem;padding:16px;">Nenhuma conquista registrada ainda.</div>';
}

// ================================================================
// TOAST — substitui alert() do navegador por uma notificação com a
// mesma identidade visual do resto do sistema. Só apresentação;
// nenhuma função de negócio muda de comportamento por causa disso.
// ================================================================
function showToast(message, type = 'success', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) { alert(message); return; } // fallback de segurança, nunca deve ser usado
  const icons = { success: '✅', error: '⛔', warning: '⚠️', celebration: '🏆' };
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.success}</span>
    <span class="toast-msg"></span>
    <button type="button" class="toast-close" aria-label="Fechar">✕</button>
  `;
  toast.querySelector('.toast-msg').textContent = message; // texto via textContent, nunca HTML solto
  container.appendChild(toast);
  const remove = () => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 200);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  if (duration > 0) setTimeout(remove, duration);
}

