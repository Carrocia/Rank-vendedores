// ═══════════════════════════════════════════════════════════════
// RENDER-APP.JS — orquestração de renderização + tema + celebração
// renderAll() é chamada sempre que os dados mudam: dispara TODAS
// as funções de render-ranking.js e do dashboard do ADM. Também
// cuida do tema claro/escuro e da tela de celebração de metas.
// ═══════════════════════════════════════════════════════════════


// renderAll SEMPRE recebe um cache real e populado pelo carregarDados().
// Nunca é chamada com null — o estado "sem dados" é tratado à parte
// por renderEstadoSemDados(), que NUNCA usa DATA/CONFIG como números atuais.
// Atualiza os 5 cards da seção "Visão Geral" do Painel Administrativo
// (dash-semana, dash-mes, dash-valor, dash-meta-pct, dash-lider).
// Reaproveita 100% os dados já calculados por processarDadosParaRender()
// (d) — nenhuma consulta nova ao Supabase é feita aqui.
function renderAdmDashboard(d) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setText('dash-semana', d.totalSemana + ' vendas');
  setText('dash-mes', d.totalMes + ' vendas');

  // Valor mensal real (plano + adicionais), somando o ranking do mês
  // já calculado por calcularRanking() — mesmo valor usado no ranking.
  const valorMes = (d.rankingMes || []).reduce((s, r) => s + Number(r.valor || 0), 0);
  setText('dash-valor', 'R$ ' + valorMes.toFixed(2).replace('.', ','));

  // Meta mensal M1 real, vinda de metas_filial (já normalizada por
  // loadMetasFilial()). Se não estiver configurada, mostra "—".
  const metaM1 = d.metasFilial && d.metasFilial.mensal_m1;
  setText('dash-meta-pct', metaM1 ? (d.pctMensal + '%') : '—');
  const cardMeta = document.getElementById('dash-meta-pct');
  const subMeta = cardMeta ? cardMeta.parentElement.querySelector('.sub') : null;
  if (subMeta) subMeta.textContent = metaM1 ? ('M1 = ' + metaM1 + ' vendas') : 'Meta não configurada';

  // Líder do mês real (nome, já resolvido pelo mesmo critério de
  // desempate do ranking: vendas e, em empate, valor vendido).
  setText('dash-lider', d.lider || '—');
}

// Detecta automaticamente quando um vendedor ou a própria filial cruza
// uma meta pela primeira vez, e avisa com um toast comemorativo — sem
// precisar do botão manual "Anunciar Destaque". Usa localStorage só
// pra lembrar "já avisei isso neste mês", nunca pra guardar os dados
// em si (que continuam vindo 100% do Supabase a cada carregamento).
function verificarConquistasDeMetas(d) {
  if (!d || !d.mes) return;
  const chave = 'uni_metas_avisadas_' + d.mes.ano + '-' + d.mes.mesNum;
  let avisadas = {};
  try { avisadas = JSON.parse(localStorage.getItem(chave) || '{}'); } catch (e) { avisadas = {}; }

  const todos = [...(d.extMes || []), ...(d.intMes || [])];
  todos.forEach(v => {
    if (!v.meta || avisadas[v.id]) return;
    if (v.vendas >= v.meta) {
      showToast(`${v.nome} bateu a meta do mês! (${v.vendas}/${v.meta} vendas)`, 'celebration', 8000);
      avisadas[v.id] = true;
    }
  });

  if (d.metasFilial && d.metasFilial.mensal_m1 && !avisadas['__filial_m1']) {
    if (d.totalMes >= d.metasFilial.mensal_m1) {
      showToast(`A filial bateu a Meta Mensal M1! (${d.totalMes}/${d.metasFilial.mensal_m1} vendas)`, 'celebration', 8000);
      avisadas['__filial_m1'] = true;
    }
  }

  try { localStorage.setItem(chave, JSON.stringify(avisadas)); } catch (e) { /* localStorage indisponível — só não avisa de novo nesta sessão */ }
}

function renderAll(cache) {
  document.getElementById('celebrateBtn').style.display = CONFIG.mostrarBotaoDestaque ? 'inline-flex' : 'none';

  renderHistorico();

  const d = processarDadosParaRender(cache);
  verificarConquistasDeMetas(d);

  // KPIs do cabeçalho — 100% derivados dos dados reais carregados do Supabase
  const kpiSemana = document.getElementById('kpiSemana');
  const kpiMensal = document.getElementById('kpiMensal');
  const kpiLider = document.getElementById('kpiLider');
  if (kpiSemana) kpiSemana.textContent = d.totalSemana + ' vendas';
  if (kpiMensal) kpiMensal.textContent = d.pctMensal + '% atingido';
  if (kpiLider) kpiLider.textContent = d.lider;

  renderWeekProgress(d);
  renderDestaquesSemana(d);
  renderMetasFilial('semanal', d);
  renderEvolucaoChart(d.evolucaoSemana);
  renderDonutChart(d.vendasPorPlano);
  detectarConquistasIndividuais(d, cache);
  renderConquistas();

  // Pódios: sempre dados reais do Supabase
  renderPodium('podium-semanal-externo', d.extSem, { mode: 'semanal' });
  renderPodium('podium-semanal-interno', d.intSem, { mode: 'semanal' });
  renderPodium('podium-mensal-externo',  d.extMes,  { mode: 'mensal' });
  renderPodium('podium-mensal-interno',  d.intMes,  { mode: 'mensal' });

  // Totalizador global — sempre dados reais
  atualizarTotalizadorComDados(d.totalGlobal);

  // Ranking ADM
  renderAdmRanking(d.rankingMes, cache.vendedores);
  renderAdmVendedoresTable(d);
  renderAdmMetasConfig(cache);
  renderConfigMetas(cache);
  renderAdmDashboard(d);
}

// toggleTheme continua sendo a ÚNICA função responsável pela troca de
// tema. Só passou a aceitar um lado explícito (force = 'light'|'dark')
// pra funcionar com a pill segmentada (clicar em "Modo Claro" sempre
// vai pra claro, clicar em "Modo Escuro" sempre vai pra escuro).
// Chamada sem argumento, continua alternando como antes.
function toggleTheme(force) {
  const html = document.documentElement;
  const atual = html.getAttribute('data-theme');
  const novo = (force === 'light' || force === 'dark') ? force : (atual === 'dark' ? 'light' : 'dark');
  html.setAttribute('data-theme', novo);

  const wrap = document.getElementById('themeToggle');
  if (wrap) {
    wrap.setAttribute('data-active', novo);
    wrap.querySelectorAll('.theme-toggle-option').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.themeChoice === novo ? 'true' : 'false');
    });
  }
}

document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    const tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    });

    // troca o card de meta e as metas da filial conforme a aba ativa
    document.documentElement.setAttribute('data-active-tab', tab);
    const isMensal = tab === 'mensal';
    if (_dadosCarregados) {
      // reprocessa o cache já carregado (sem nova chamada de rede)
      const d = processarDadosParaRender(_cache);
      if (isMensal) {
        renderMensalProgress(d);
      } else {
        renderWeekProgress(d);
      }
      renderMetasFilial(isMensal ? 'mensal' : 'semanal', d);
    }
    // se não há dados carregados, o estado "sem dados" já está
    // visível (renderEstadoSemDados) e não precisa ser recalculado
  });
});

// ============================================================
// ============================================================
// TELA DE CELEBRAÇÃO — clique no botão "🎉 Anunciar Destaque"
// para mostrar o vendedor externo e interno em 1º lugar
// no ranking mensal real (calculado a partir do Supabase)
// ============================================================
function buildConfetti() {
  const field = document.getElementById('confettiField');
  const colors = ['#21d9ff', '#7c5cff', '#ffc94d', '#ff5fae', '#34d399'];
  let html = '';
  for (let i = 0; i < 70; i++) {
    const left = (Math.random() * 100).toFixed(1);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const duration = (3.5 + Math.random() * 3).toFixed(2);
    const delay = (Math.random() * 3).toFixed(2);
    const size = (6 + Math.random() * 6).toFixed(1);
    const round = Math.random() > 0.5 ? '50%' : '2px';
    html += `<span class="confetti-piece" style="left:${left}%;background:${color};width:${size}px;height:${size * 1.5}px;border-radius:${round};animation-duration:${duration}s;animation-delay:-${delay}s;"></span>`;
  }
  field.innerHTML = html;
}

// showCelebration usa SEMPRE o ranking mensal real (extMes/intMes,
// já calculados a partir das vendas do Supabase). Se os dados ainda
// não foram carregados, avisa em vez de simular um vencedor.
function showCelebration() {
  if (!_dadosCarregados) {
    showToast('Os dados ainda não foram carregados do Supabase. Tente novamente em instantes.', 'warning');
    return;
  }
  const d = processarDadosParaRender(_cache);
  const topExterno = d.extMes.length ? [...d.extMes].sort((a,b) => b.vendas - a.vendas)[0] : null;
  const topInterno = d.intMes.length ? [...d.intMes].sort((a,b) => b.vendas - a.vendas)[0] : null;

  const mesNome = d.mes && d.mes.mesNome ? (d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1)) : CONFIG.mesReferencia;
  document.getElementById('celebrationSubtitle').innerHTML =
    '<span class="signal-bars"><span></span><span></span><span></span><span></span></span> Destaque do mês de ' + mesNome;

  const winners = [
    { entry: topInterno, role: 'Vendedor Interno' },
    { entry: topExterno, role: 'Vendedor Externo' },
  ].filter(w => w.entry);

  if (winners.length === 0) {
    document.getElementById('celebrationWinners').innerHTML = '<div class="sem-dados-msg">Sem vendas registradas neste mês ainda.</div>';
  } else {
    document.getElementById('celebrationWinners').innerHTML = winners.map(w => {
      const pessoa = PESSOAS[w.entry.slug] || {};
      return `
      <div class="celebration-card">
        <div class="celebration-photo-wrap">
          <span class="celebration-crown" aria-hidden="true">👑</span>
          <img class="celebration-photo" src="${pessoa.foto || ''}" alt="${pessoa.nome || w.entry.nome || ''}">
        </div>
        <span class="celebration-role">${w.role}</span>
        <span class="celebration-name">${pessoa.nome || w.entry.nome || ''}</span>
        <span class="celebration-value" data-target="${w.entry.vendas}">0 vendas</span>
      </div>`;
    }).join('');
  }

  buildConfetti();
  document.body.style.overflow = 'hidden';
  document.getElementById('celebrationOverlay').classList.add('active');

  document.querySelectorAll('.celebration-value').forEach(el => {
    animateNumber(el, Number(el.dataset.target), { duration: 1000, suffixFn: formatVendas });
  });
}

function hideCelebration() {
  document.getElementById('celebrationOverlay').classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('confettiField').innerHTML = '';
}
