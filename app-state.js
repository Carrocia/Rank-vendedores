// ═══════════════════════════════════════════════════════════════
// APP-STATE.JS — estado em memória + carregamento central
// _cache guarda tudo que foi lido do Supabase na sessão atual.
// carregarDados() é a função chamada ao abrir a página e após
// qualquer venda nova: busca tudo em paralelo e populates _cache.
// ═══════════════════════════════════════════════════════════════

// ================================================================
// DADOS EM MEMÓRIA (cache da sessão, populados por carregarDados)
// ================================================================
let _cache = {
  vendedores: [], planos: [], adicionais: [], filiais: [],
  metasFilial: null, metas: [],
  vendasSemana: [], vendasMes: [], vendasFiliais: [], vendasSemanaAnterior: [],
  vendaMaisRecente: null,
  semana: null, mes: null,
};
// true somente após um carregamento bem-sucedido de dados reais do Supabase
let _dadosCarregados = false;

// ================================================================
// FUNÇÃO CENTRAL: carregarDados()
// Chamada ao iniciar e após cada venda registrada
// ================================================================
function showErrorBanner(msg) {
  const banner = document.getElementById('dadosErrorBanner');
  const msgEl = document.getElementById('dadosErrorMsg');
  if (msgEl) msgEl.textContent = msg;
  if (banner) banner.classList.remove('hidden');
}

function hideErrorBanner() {
  const banner = document.getElementById('dadosErrorBanner');
  if (banner) banner.classList.add('hidden');
}

// Estado exibido quando não há dados reais disponíveis (Supabase não
// configurado ou erro de comunicação). NUNCA usa DATA/CONFIG como
// fonte de números atuais — apenas mostra "—" e um aviso claro.
function renderEstadoSemDados() {
  document.getElementById('celebrateBtn').style.display = 'none'; // nunca celebrar com dados que não existem
  renderHistorico();

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('kpiSemana', '—');
  setText('kpiMensal', '—');
  setText('kpiLider', '—');

  // Card de meta (semanal/mensal) em estado vazio
  document.getElementById('metaCardTitle').textContent = 'Meta da Semana';
  setText('metaColTitle', 'Progresso da semana');
  setText('metaSubLabel', 'vendas realizadas / meta da semana');
  setText('weekDataLabel', '—');
  setText('weekAtual', '—');
  setText('weekMeta', '—');
  setText('weekFaltam', '—');
  setText('weekBarMetaCaption', 'Sem dados disponíveis');
  const ringEl = document.getElementById('weekRingPct');
  if (ringEl) ringEl.textContent = '—';
  const barFillEl = document.getElementById('weekBarFill');
  if (barFillEl) barFillEl.style.width = '0%';
  const barPctEl = document.getElementById('weekBarPct');
  if (barPctEl) barPctEl.textContent = '—';
  const ringWrap = document.getElementById('metaRingWrap');
  if (ringWrap) ringWrap.style.setProperty('--ring-pct', '0%');

  // Destaques da semana
  const destaquesGrid = document.getElementById('destaquesGrid');
  if (destaquesGrid) destaquesGrid.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';

  // Metas da filial
  const metasGrid = document.getElementById('metasFilialGrid');
  if (metasGrid) metasGrid.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';

  // Gráficos
  renderEvolucaoChart(null);
  renderDonutChart(null);
  renderConquistas();

  // Pódios
  ['podium-semanal-externo', 'podium-semanal-interno', 'podium-mensal-externo', 'podium-mensal-interno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';
  });

  // Totalizador global
  atualizarTotalizadorComDados({ equipe: '—', filiais: '—', total: '—', pct: 0, metaGlobal: '—' });

  // Ranking ADM
  const rankingList = document.getElementById('adm-ranking-list');
  if (rankingList) rankingList.innerHTML = '<div class="adm-form-card" style="opacity:0.65;text-align:center;padding:40px;"><div>Sem dados disponíveis. Verifique a conexão com o Supabase.</div></div>';
}

async function carregarDados() {
  const configurado = initSupabase();
  hideErrorBanner();

  if (!configurado) {
    console.error('[carregarDados] Supabase não configurado — preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
    showErrorBanner('O Supabase ainda não foi configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY no código.');
    _dadosCarregados = false;
    renderEstadoSemDados();
    return;
  }

  try {
    // Calcular períodos
    _cache.semana = calcularPeriodoSemana();
    _cache.mes = calcularPeriodoMes();
    const semanaAnterior = calcularPeriodoSemanaAnterior();

    // Carregar em paralelo
    const [vendedores, planos, adicionais, filiais, metasFilial, metas,
           vendasSemana, vendasMes, vendasFiliais, vendaMaisRecente, vendasSemanaAnterior] = await Promise.all([
      loadVendedores(),
      loadPlanos(),
      loadAdicionais(),
      loadFiliais(),
      loadMetasFilial(_cache.mes.mesNum, _cache.mes.ano),
      loadMetas(_cache.mes.mesNum, _cache.mes.ano),
      loadVendas(_cache.semana.de, _cache.semana.ate),
      loadVendas(_cache.mes.de, _cache.mes.ate),
      loadVendasOutrasFiliais(_cache.mes.de, _cache.mes.ate),
      loadVendaMaisRecente(),
      loadVendas(semanaAnterior.de, semanaAnterior.ate),
    ]);

    _cache.vendedores = vendedores;
    _cache.planos = planos;
    _cache.adicionais = adicionais;
    _cache.filiais = filiais;
    _cache.metasFilial = metasFilial;
    _cache.metas = metas;
    _cache.vendasSemana = vendasSemana;
    _cache.vendasMes = vendasMes;
    _cache.vendasFiliais = vendasFiliais;
    _cache.vendaMaisRecente = vendaMaisRecente;
    _cache.vendasSemanaAnterior = vendasSemanaAnterior;

    // Atualizar formulários ADM com dados reais
    popularSelectVendedores(vendedores);
    popularSelectPlanos(planos);
    popularAdicionaisFormulario(adicionais);
    popularSelectFiliais(filiais);

    renderAll(_cache);
    _dadosCarregados = true;
  } catch (err) {
    console.error('[carregarDados] Erro ao carregar dados do Supabase:', err);
    showErrorBanner('Não foi possível carregar os dados. Verifique a conexão com o Supabase.');
    _dadosCarregados = false;
    renderEstadoSemDados();
  }
}

