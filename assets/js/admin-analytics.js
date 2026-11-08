// Analitica individual, fichas de progressao e relatorios associados.
let _analiticaRenderToken = 0;
const RANK_CARREIRA_ORDEM = ['D', 'C', 'B', 'A', 'S', 'SS'];
const RANK_CARREIRA_IMAGENS = {
  D: 'assets/images/ranks/rank-d.png', C: 'assets/images/ranks/rank-c.png',
  B: 'assets/images/ranks/rank-b.png', A: 'assets/images/ranks/rank-a.png',
  S: 'assets/images/ranks/rank-s.png', SS: 'assets/images/ranks/rank-ss.png',
};
const FAIXAS_XP_CARREIRA = [
  { rank: 'D', minimo: 0 }, { rank: 'C', minimo: 3000 },
  { rank: 'B', minimo: 9000 }, { rank: 'A', minimo: 18000 },
  { rank: 'S', minimo: 30000 }, { rank: 'SS', minimo: 45000 },
];
function calcularProgressoFaixa(valor, faixas) {
  const total = Math.max(0, Number(valor) || 0);
  const indiceAtual = faixas.reduce((indice, faixa, i) => total >= faixa.minimo ? i : indice, -1);
  const atual = indiceAtual >= 0 ? faixas[indiceAtual] : null;
  const proxima = faixas[indiceAtual + 1] || null;
  if (!proxima) return {
    valor: total, atual, proxima: null, dentroFaixa: 0, tamanhoFaixa: 0,
    percentual: 100, faltam: 0, maximo: true,
  };
  const inicio = atual?.minimo || 0;
  const tamanhoFaixa = proxima.minimo - inicio;
  const dentroFaixa = Math.max(0, total - inicio);
  return {
    valor: total, atual, proxima, dentroFaixa, tamanhoFaixa,
    percentual: tamanhoFaixa > 0 ? Math.min(100, dentroFaixa / tamanhoFaixa * 100) : 0,
    faltam: Math.max(0, proxima.minimo - total), maximo: false,
  };
}

function formatarPontosRank(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
}

function preencherBarraProgressoFicha(prefixo, progresso, unidade) {
  const rank = document.getElementById(`an-card-${prefixo}-progress-rank`);
  const valor = document.getElementById(`an-card-${prefixo}-progress-value`);
  const barra = document.getElementById(`an-card-${prefixo}-progress-bar`);
  const trilho = barra?.closest('[role="progressbar"]');
  const nota = document.getElementById(`an-card-${prefixo}-progress-note`);
  if (!rank || !valor || !barra || !trilho || !nota) return;
  if (!progresso) {
    rank.textContent = 'Aguardando dados';
    valor.textContent = '—';
    barra.style.width = '0%';
    trilho.setAttribute('aria-valuenow', '0');
    nota.textContent = 'Dados insuficientes para calcular este progresso.';
    return;
  }
  rank.textContent = prefixo === 'career'
    ? (progresso.proxima ? `Próximo ${progresso.proxima.rank}` : `Rank ${progresso.atual?.rank || '—'}`)
    : progresso.atual ? `Rank ${progresso.atual.rank}` : `A caminho do rank ${progresso.proxima?.rank || '—'}`;
  valor.textContent = progresso.maximo
    ? `${formatarPontosRank(progresso.valor)}+ ${unidade}`
    : `${formatarPontosRank(progresso.dentroFaixa)} / ${formatarPontosRank(progresso.tamanhoFaixa)} ${unidade}${prefixo === 'career' || prefixo === 'month' ? ' nesta faixa' : ''}`;
  barra.style.width = `${progresso.percentual}%`;
  trilho.setAttribute('aria-valuenow', String(Math.round(progresso.percentual)));
  nota.textContent = progresso.maximo
    ? `Rank ${progresso.atual?.rank || ''} alcançado · faixa máxima atual.`
    : `Próximo rank ${progresso.proxima.rank} · faltam ${formatarPontosRank(progresso.faltam)} ${unidade}.`;
}

function formatarValorAnalitica(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function classificarRankCarreiraFechado(item, tipoFallback = 'interno') {
  const metaVendas = Number(item.meta_vendas || 0);
  const vendas = Number(item.vendas || 0);
  const renovacoes = Number(item.renovacoes || 0);
  const metaRenovacoes = Number(item.meta_renovacoes || 0);
  const ticket = Number(item.ticket_medio || 0);
  const tipo = item.tipo || tipoFallback;
  if (metaVendas <= 0 || ticket <= 0) return null;
  const pctVendas = vendas / metaVendas;
  const pctRenovacoes = metaRenovacoes > 0 ? renovacoes / metaRenovacoes : 0;
  const externo = tipo === 'externo';
  if (pctVendas >= 1.15 && (externo || pctRenovacoes >= 1.00) && ticket >= 130) return 'S';
  if (pctVendas >= 1.00 && (externo || pctRenovacoes >= 0.85) && ticket >= 120) return 'A';
  if (pctVendas >= 0.85 && (externo || pctRenovacoes >= 0.65) && ticket >= 115) return 'B';
  if (pctVendas >= 0.70 && (externo || pctRenovacoes >= 0.50) && ticket >= 110) return 'C';
  if (pctVendas >= 0.50 && ticket >= 105) return 'D';
  return null;
}

function calcularProgressoCarreira(historico, tipo) {
  const meses = new Map();
  (historico || []).forEach(item => {
    const chave = `${Number(item.ano)}-${String(Number(item.mes)).padStart(2, '0')}`;
    const atual = meses.get(chave);
    const rankCarreiraMes = classificarRankCarreiraFechado(item, tipo);
    // Se houve mais de um cadastro/regional para a mesma identidade no mês,
    // preserva o melhor rank de carreira calculado para esse período.
    if (!atual || RANK_CARREIRA_ORDEM.indexOf(rankCarreiraMes) > RANK_CARREIRA_ORDEM.indexOf(atual.rankCarreiraMes)) {
      meses.set(chave, { ...item, rankCarreiraMes });
    }
  });
  const ordenado = [...meses.values()].sort((a, b) => Number(a.ano) - Number(b.ano) || Number(a.mes) - Number(b.mes));
  let streakAtual = 0;
  for (let i = ordenado.length - 1; i >= 0; i--) {
    const item = ordenado[i];
    if (item.m1_vendas !== true) break;
    if (i < ordenado.length - 1) {
      const anterior = ordenado[i + 1];
      const mesAnterior = Number(item.ano) * 12 + Number(item.mes);
      const mesSeguinte = Number(anterior.ano) * 12 + Number(anterior.mes);
      if (mesSeguinte - mesAnterior !== 1) break;
    }
    streakAtual++;
  }
  let ssConquistado = false;
  for (let i = 0; i <= ordenado.length - 4; i++) {
    const janela = ordenado.slice(i, i + 4);
    const consecutivos = janela.every((item, index) => index === 0 || (Number(item.ano) * 12 + Number(item.mes)) - (Number(janela[index - 1].ano) * 12 + Number(janela[index - 1].mes)) === 1);
    if (consecutivos && janela.every(item => item.m1_vendas === true) && (tipo === 'externo' || janela[3].m1_renovacoes === true)) {
      ssConquistado = true;
      break;
    }
  }
  const melhoresRanks = ordenado.map(item => item.rankCarreiraMes).filter(rank => RANK_CARREIRA_ORDEM.includes(rank));
  const rankCarreira = ssConquistado ? 'SS' : melhoresRanks.reduce((melhor, rank) => RANK_CARREIRA_ORDEM.indexOf(rank) > RANK_CARREIRA_ORDEM.indexOf(melhor) ? rank : melhor, 'D');
  return { rankCarreira, streakAtual: Math.min(4, streakAtual), ssConquistado, mesesFechados: ordenado.length };
}

let _analiticaVendedores = [];
let _analiticaContextoPeriodo = null;
let _celebracaoContextoPeriodo = null;
const _contextosPeriodoHistorico = new Map();

function chaveMesPeriodo(mes) { return `${Number(mes?.ano)}-${String(Number(mes?.mesNum)).padStart(2, '0')}`; }

function periodoMesPorChave(chave) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(chave || ''))) throw new Error('Selecione um mês válido.');
  const [ano, mesNum] = chave.split('-').map(Number);
  const inicio = new Date(ano, mesNum - 1, 1);
  const fim = new Date(ano, mesNum, 0);
  const fmt = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  const mesNome = inicio.toLocaleDateString('pt-BR', { month: 'long' });
  return { de: fmt(inicio), ate: fmt(fim), mesNome, mesNum, ano, diasNoMes: fim.getDate(), diaAtual: fim.getDate(), diasRestantes: 0 };
}

function contextoAnaliticaAtual() {
  return { d: _ultimoProcessado, mes: _cache.mes, cache: _cache, vendedores: _cache.vendedores || [], filialId: String(window.FILIAL_ATUAL_ID || '') };
}

function contextoAnaliticaSelecionado() {
  if (_analiticaContextoPeriodo && _analiticaContextoPeriodo.filialId !== String(window.FILIAL_ATUAL_ID || '')) _analiticaContextoPeriodo = null;
  if (_celebracaoContextoPeriodo && _celebracaoContextoPeriodo.filialId !== String(window.FILIAL_ATUAL_ID || '')) _celebracaoContextoPeriodo = null;
  return _analiticaContextoPeriodo || contextoAnaliticaAtual();
}

function contextoCelebracaoSelecionado() {
  if (_celebracaoContextoPeriodo && _celebracaoContextoPeriodo.filialId !== String(window.FILIAL_ATUAL_ID || '')) _celebracaoContextoPeriodo = null;
  return _celebracaoContextoPeriodo || contextoAnaliticaAtual();
}

async function carregarContextoPeriodoHistorico(chave) {
  const mesAtual = chaveMesPeriodo(_cache.mes || calcularPeriodoMes());
  if (chave === mesAtual) return contextoAnaliticaAtual();
  const cacheKey = `${window.FILIAL_ATUAL_ID}:${chave}`;
  if (_contextosPeriodoHistorico.has(cacheKey)) return _contextosPeriodoHistorico.get(cacheKey);
  const carregar = (async () => {
    const mes = periodoMesPorChave(chave);
    const vendedores = (_cache.vendedores || []).filter(v => v.ativo !== false);
    const ids = vendedores.map(v => v.id);
    const [vendasMes, vendasOrigemMes, vendasFiliais, metasFilial, metasRenovCancel,
      metasRenovacaoFilial, metas, renovacoesMes, ranksMensais] = await Promise.all([
      loadVendas(mes.de, mes.ate),
      loadVendasOrigem(mes.de, mes.ate),
      loadVendasOutrasFiliais(mes.de, mes.ate),
      loadMetasFilial(mes.mesNum, mes.ano),
      loadMetasRenovCancel(mes.mesNum, mes.ano),
      loadMetasRenovacaoFilial(mes.mesNum, mes.ano),
      loadMetas(mes.mesNum, mes.ano, ids),
      loadRenovacoesMensais(mes.mesNum, mes.ano),
      loadRankMensalFilial(mes.mesNum, mes.ano),
    ]);
    if (_rankMensalErro) throw new Error(`Não foi possível consultar o rank de ${mes.mesNome} ${mes.ano}: ${_rankMensalErro}`);
    const encontrarPorId = (lista, id) => (lista || []).find(item => String(item.vendedor_id) === String(id));
    const intMes = [];
    const extMes = [];
    vendedores.filter(v => v.participa_ranking !== false).forEach(cadastro => {
      const rank = encontrarPorId(ranksMensais, cadastro.id) || {};
      const meta = encontrarPorId(metas, cadastro.id) || {};
      const vendasDiretas = (vendasMes || []).filter(item => String(item.vendedor_id) === String(cadastro.id)
        && !(cadastro.tipo === 'externo' && (item.fora_filial === true || isVendaRecebidaDeOutraFilial(item))));
      const vendasOrigem = cadastro.tipo === 'interno'
        ? (vendasOrigemMes || []).filter(item => String(item.vendedor_id) === String(cadastro.id) && item.tipo === 'interno') : [];
      const quantidadeDireta = vendasDiretas.length;
      const quantidadeOrigem = vendasOrigem.reduce((total, item) => total + Number(item.vendas || 0), 0);
      const valorDireto = vendasDiretas.reduce((total, item) => total + Number(item.valor_total ?? item.valor_plano ?? item.valor ?? 0), 0);
      const valorOrigem = vendasOrigem.reduce((total, item) => total + Number(item.valor || 0), 0);
      const vendas = Number(rank.vendas ?? quantidadeDireta + quantidadeOrigem);
      const valor = Number(rank.valor_vendas ?? valorDireto + valorOrigem);
      const registro = {
        ...cadastro, vendas, valor, valor_total: valor,
        meta: Number(rank.meta_vendas ?? (cadastro.tipo === 'interno' ? meta.meta_m3 : meta.meta_vendas) ?? 0),
      };
      (cadastro.tipo === 'externo' ? extMes : intMes).push(registro);
    });
    const d = { mes, intMes, extMes };
    const cache = {
      ..._cache, mes, vendasMes: vendasMes || [], vendasOrigemMes: vendasOrigemMes || [],
      vendasFiliais: vendasFiliais || [], metasFilial, metasRenovCancel, metasRenovacaoFilial,
      metas: metas || [],
      renovacoesMes: renovacoesMes || [], ranksMensais: ranksMensais || [],
    };
    return { d, mes, cache, vendedores, filialId: String(window.FILIAL_ATUAL_ID || '') };
  })();
  _contextosPeriodoHistorico.set(cacheKey, carregar);
  try { return await carregar; }
  catch (error) { _contextosPeriodoHistorico.delete(cacheKey); throw error; }
}

async function alterarPeriodoAnalitica(chave) {
  const input = document.getElementById('an-period-select');
  const resumo = document.getElementById('an-roster-summary');
  if (!chave) return;
  if (input) input.disabled = true;
  if (resumo) resumo.textContent = 'Carregando os resultados do período…';
  try {
    const contexto = await carregarContextoPeriodoHistorico(chave);
    _analiticaContextoPeriodo = chave === chaveMesPeriodo(_cache.mes || calcularPeriodoMes()) ? null : contexto;
    await renderizarAnaliticaPerfis();
  } catch (error) {
    console.error('[alterarPeriodoAnalitica]', error);
    if (input) input.value = chaveMesPeriodo(contextoAnaliticaSelecionado().mes || _cache.mes || calcularPeriodoMes());
    if (resumo) resumo.textContent = error.message || 'Não foi possível carregar este período.';
    showToast(error.message || 'Não foi possível carregar a análise deste mês.', 'error');
  } finally { if (input) input.disabled = false; }
}

async function alterarPeriodoCelebracoes(chave) {
  const input = document.getElementById('cel-periodo');
  if (!chave) return;
  if (input) input.max = chaveMesPeriodo(_cache.mes || calcularPeriodoMes());
  if (input) input.disabled = true;
  configurarBotoesCelebracao(true, 'Carregando resultados do mês…');
  try {
    const contexto = await carregarContextoPeriodoHistorico(chave);
    _celebracaoContextoPeriodo = chave === chaveMesPeriodo(_cache.mes || calcularPeriodoMes()) ? null : contexto;
    atualizarMetasCelebraveis();
    const info = document.getElementById('cel-preview-info');
    if (info && !document.getElementById('cel-vendedor')?.value) info.textContent = `Período selecionado: ${contexto.mes.mesNome} ${contexto.mes.ano}.`;
    configurarBotoesCelebracao(false);
  } catch (error) {
    console.error('[alterarPeriodoCelebracoes]', error);
    if (input) input.value = chaveMesPeriodo(contextoCelebracaoSelecionado().mes || _cache.mes || calcularPeriodoMes());
    configurarBotoesCelebracao(false, error.message || 'Não foi possível carregar este período.');
    showToast(error.message || 'Não foi possível carregar as celebrações deste mês.', 'error');
  } finally { if (input) input.disabled = false; }
}

function obterPerfilAnaliticoSelecionado() {
  const id = document.getElementById('an-vendedor-select')?.value;
  const contexto = contextoAnaliticaSelecionado();
  if (!id || !contexto.d) return null;
  const cadastro = (contexto.vendedores || []).find(item => String(item.id) === String(id));
  const vendedorRegistrado = [...(contexto.d.intMes || []), ...(contexto.d.extMes || [])]
    .find(item => String(item.id) === String(id));
  const vendedor = vendedorRegistrado || (cadastro ? { ...cadastro, vendas: 0, valor: 0, valor_total: 0, meta: Number(cadastro.meta || 0) } : null);
  if (!vendedor) return null;
  const rank = (contexto.cache.ranksMensais || []).find(item => String(item.vendedor_id) === String(id)) || null;
  const renovacao = (contexto.cache.renovacoesMes || [])?.find(item => String(item.vendedor_id) === String(id));
  const metasVendas = (contexto.cache.metas || []).find(item => String(item.vendedor_id) === String(id)) || {};
  const renovacaoLegada = contexto.cache.metasRenovCancel || {};
  const metasRenovacao = contexto.cache.metasRenovacaoFilial || {
    meta_m3: renovacaoLegada.renovacoes_m3,
    meta_m2: renovacaoLegada.renovacoes_m2,
    meta_m1: renovacaoLegada.renovacoes_m1,
  };
  return { vendedor, cadastro, rank, renovacao, metasVendas, metasRenovacao, tipo: vendedor.tipo || cadastro?.tipo || 'interno' };
}

function renderizarProgressoMetasFicha(vendas, metas = {}, tipo = 'interno', metaFallback = 0) {
  const atual = Math.max(0, Number(vendas) || 0);
  const externo = tipo === 'externo';
  const etapas = externo
    ? [{ nome: 'Meta', meta: Number(metas.meta_vendas || metaFallback || 0), descricao: 'Meta individual' }]
    : [
      { nome: 'M3', meta: Number(metas.meta_m3 || 0), descricao: 'Primeira etapa' },
      { nome: 'M2', meta: Number(metas.meta_m2 || 0), descricao: 'Etapa intermediária' },
      { nome: 'M1', meta: Number(metas.meta_m1 || 0), descricao: 'Etapa avançada' },
    ].filter(etapa => etapa.meta > 0);
  const container = document.getElementById('an-card-attributes-list');
  if (!container) return;
  if (!etapas.length) {
    container.innerHTML = '<p class="an-card-goal-empty">As metas deste período ainda não foram configuradas.</p>';
    return;
  }
  const indiceAtual = etapas.findIndex(etapa => atual < etapa.meta);
  const etapaAtual = indiceAtual < 0 ? null : etapas[indiceAtual];
  const percentualAtual = etapaAtual ? Math.min(100, Math.round(atual / etapaAtual.meta * 100)) : 100;
  const resumo = externo
    ? (etapaAtual ? 'Sua meta individual está em andamento.' : 'Meta individual concluída. Parabéns pelo resultado!')
    : (etapaAtual
      ? `${etapaAtual.nome} é sua etapa atual. Conclua esta meta para avançar à próxima.`
      : 'M3, M2 e M1 concluídas. Você alcançou todas as etapas do mês!');
  const linhas = etapas.map((etapa, indice) => {
    const concluida = atual >= etapa.meta;
    const emAndamento = !concluida && indice === indiceAtual;
    const percentual = concluida ? 100 : emAndamento ? Math.min(100, Math.round(atual / etapa.meta * 100)) : 0;
    const status = concluida
      ? 'Concluída'
      : emAndamento
        ? `${atual} de ${etapa.meta} · faltam ${etapa.meta - atual}`
        : `Depois da ${etapas[indice - 1]?.nome || 'etapa anterior'}`;
    return `<div class="an-card-goal-step${concluida ? ' is-complete' : ''}${emAndamento ? ' is-current' : ' is-locked'}"><span class="an-card-goal-badge">${concluida ? '✓' : escapeHtmlText(etapa.nome)}</span><div class="an-card-goal-copy"><div><b>${escapeHtmlText(etapa.nome)} · ${escapeHtmlText(etapa.descricao)}</b><small>${escapeHtmlText(status)}</small></div><i class="an-card-goal-track"><i style="width:${percentual}%"></i></i></div><strong>${escapeHtmlText(String(etapa.meta))} vendas</strong></div>`;
  }).join('');
  container.innerHTML = `<div class="an-card-goal-summary"><div><small>${etapaAtual ? `ETAPA ATUAL · ${escapeHtmlText(etapaAtual.nome)}` : 'JORNADA CONCLUÍDA'}</small><strong>${escapeHtmlText(resumo)}</strong></div>${etapaAtual ? `<b>${percentualAtual}%</b>` : '<b>✓</b>'}</div><div class="an-card-goal-steps">${linhas}</div>`;
}

function renderizarAtributosComerciais(selecionado, dados, contexto) {
  const chart = document.getElementById('an-radar-chart');
  const legend = document.getElementById('an-attributes-legend');
  const note = document.getElementById('an-attributes-note');
  const insights = document.getElementById('an-attributes-insights');
  if (!chart || !legend) return;
  const { vendas, metaVendas, ticket, referencia, renovacoes, metaRenovacoes, diasNoMes, ano, mesNum } = contexto;
  const { vendasDiretas = [], vendasOrigem = [] } = dados || {};
  const externo = selecionado.tipo === 'externo';
  const fim = new Date(ano, mesNum, 0).getDate();
  const hoje = new Date();
  const mesmoMes = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mesNum;
  const diaCorte = mesmoMes ? Math.min(hoje.getDate(), fim) : fim;
  const vendasPorDia = new Map();
  const registrar = (item, quantidade = 1) => {
    const data = String(item.data_venda || item.dia || '').slice(0, 10);
    const dia = Number(data.slice(8, 10));
    if (!data || !dia || dia > diasNoMes) return;
    vendasPorDia.set(data, (vendasPorDia.get(data) || 0) + quantidade);
  };
  vendasDiretas.forEach(item => registrar(item, 1));
  vendasOrigem.forEach(item => registrar(item, Number(item.vendas || 0)));
  const fimAtual = new Date(ano, mesNum - 1, diaCorte);
  const inicioAtual = new Date(fimAtual); inicioAtual.setDate(inicioAtual.getDate() - 6);
  const inicioAnterior = new Date(inicioAtual); inicioAnterior.setDate(inicioAnterior.getDate() - 7);
  const fimAnterior = new Date(inicioAtual); fimAnterior.setDate(fimAnterior.getDate() - 1);
  const dataChave = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  const somarPeriodo = (inicio, fim) => [...vendasPorDia.entries()].reduce((total, [data, qtd]) => total + (data >= dataChave(inicio) && data <= dataChave(fim) ? qtd : 0), 0);
  const semanaAtual = somarPeriodo(inicioAtual, fimAtual);
  const semanaAnterior = somarPeriodo(inicioAnterior, fimAnterior);
  const janelaAnteriorCompleta = inicioAnterior >= new Date(ano, mesNum - 1, 1);
  const evolucao = janelaAnteriorCompleta && semanaAnterior > 0 ? Math.round((semanaAtual - semanaAnterior) / semanaAnterior * 100) : null;
  const detalheSemanal = !janelaAnteriorCompleta
    ? 'Ainda não há uma janela anterior completa de 7 dias dentro do mês.'
    : semanaAnterior > 0
      ? `${semanaAtual} ativações nos últimos 7 dias, contra ${semanaAnterior} nos 7 anteriores (${evolucao > 0 ? '+' : ''}${semanaAtual - semanaAnterior}). Usa a data de ativação.`
      : `${semanaAtual} ativações nos últimos 7 dias; a janela anterior teve 0, então não há base para calcular variação percentual.`;
  const indicadores = [
    { nome: 'Meta de vendas', curto: 'Vendas', valor: metaVendas > 0 ? vendas / metaVendas * 100 : null, detalhe: metaVendas > 0 ? `${Math.round(vendas / metaVendas * 100)}% da meta mensal` : 'Meta não cadastrada' },
    { nome: 'Ticket médio', curto: 'Ticket', valor: referencia > 0 ? ticket / referencia * 100 : null, detalhe: referencia > 0 ? `${Math.round(ticket / referencia * 100)}% da referência regional` : 'Referência indisponível' },
    { nome: 'Variação recente', curto: 'Variação', valor: evolucao == null ? null : (semanaAtual / semanaAnterior) * 100, detalhe: detalheSemanal, exibicao: evolucao == null ? 'Sem base' : `${evolucao > 0 ? '+' : ''}${evolucao}%` },
  ];
  if (!externo) indicadores.push({
    nome: 'Renovações', curto: 'Renovações',
    valor: metaRenovacoes > 0 ? renovacoes / metaRenovacoes * 100 : null,
    detalhe: metaRenovacoes > 0 ? `${Math.round(renovacoes / metaRenovacoes * 100)}% da meta M1` : 'Meta de renovação não cadastrada',
  });
  const cardIndicators = document.getElementById('an-card-attributes-list');
  if (cardIndicators) {
    renderizarProgressoMetasFicha(vendas, contexto.metasVendas, selecionado.tipo, metaVendas);
  }
  const indicadoresRadar = indicadores.filter(item => item.valor != null && Number.isFinite(item.valor));
  const maiorValorRadar = Math.max(100, ...indicadoresRadar.map(item => item.valor));
  const maximo = Math.max(150, Math.ceil(maiorValorRadar / 50) * 50);
  const niveisRadar = [...new Set([100, Math.round(maximo / 2 / 10) * 10, maximo])].filter(nivel => nivel > 0).sort((a, b) => a - b);
  const centroX = 210, centroY = 150, raio = 102;
  const quantidade = indicadoresRadar.length;
  const ponto = (indice, nivel) => {
    const angulo = (-90 + indice * 360 / quantidade) * Math.PI / 180;
    const distancia = raio * nivel / maximo;
    return [centroX + Math.cos(angulo) * distancia, centroY + Math.sin(angulo) * distancia];
  };
  const pontosPoligono = nivel => indicadoresRadar.map((_, i) => ponto(i, nivel).map(n => n.toFixed(1)).join(',')).join(' ');
  const grades = niveisRadar.map(nivel => `<polygon class="an-radar-grid ${nivel === 100 ? 'is-reference' : ''}" points="${pontosPoligono(nivel)}"></polygon>`).join('');
  const escalaRadar = quantidade ? niveisRadar.map(nivel => {
    const [, y] = ponto(0, nivel);
    return `<text class="an-radar-scale-label" x="216" y="${(y - 3).toFixed(1)}">${nivel}%</text>`;
  }).join('') : '';
  const eixos = indicadoresRadar.map((item, i) => {
    const [x, y] = ponto(i, maximo);
    const angulo = (-90 + i * 360 / quantidade) * Math.PI / 180;
    const lx = centroX + Math.cos(angulo) * 126;
    const ly = centroY + Math.sin(angulo) * 126;
    const ancoragem = lx < centroX - 10 ? 'end' : lx > centroX + 10 ? 'start' : 'middle';
    return `<line class="an-radar-axis" x1="${centroX}" y1="${centroY}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text class="an-radar-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${ancoragem}">${escapeHtmlText(item.curto)}</text>`;
  }).join('');
  const preenchimento = indicadoresRadar.map((item, i) => ponto(i, Math.min(maximo, Math.max(0, item.valor))).map(n => n.toFixed(1)).join(',')).join(' ');
  const dots = indicadoresRadar.map((item, i) => { const [x, y] = ponto(i, Math.min(maximo, Math.max(0, item.valor))); return `<circle class="an-radar-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4"></circle>`; }).join('');
  chart.innerHTML = indicadoresRadar.length >= 3
    ? `<svg viewBox="0 0 420 300" role="img" aria-label="Radar dos indicadores comparáveis. Escala dinâmica até ${maximo} por cento; 100 por cento representa a meta ou referência, e para variação recente representa estabilidade frente aos sete dias anteriores.">${grades}${escalaRadar}${eixos}<polygon class="an-radar-area" points="${preenchimento}"></polygon>${dots}</svg>`
    : '<p class="an-radar-empty">Ainda não há três indicadores com meta ou referência para comparar neste gráfico.</p>';
  const legendaEscala = `Escala do radar: 0–${maximo}% · 100% = meta/referência; variação recente usa 100% como estabilidade.`;
  const scaleNote = document.getElementById('an-attributes-scale');
  const cardScaleNote = document.getElementById('an-card-attributes-scale');
  if (scaleNote) scaleNote.textContent = `Escala até ${maximo}% · referência 100%`;
  if (cardScaleNote) cardScaleNote.textContent = `Escala até ${maximo}% · referência 100%`;
  legend.innerHTML = indicadores.map(item => {
    const exibicao = item.exibicao || (item.valor == null ? 'Sem base' : `${Math.round(item.valor)}%`);
    return `<li><span><b>${escapeHtmlText(item.nome)}</b><small>${escapeHtmlText(item.detalhe)}</small></span><strong>${escapeHtmlText(exibicao)}</strong></li>`;
  }).join('');
  if (note) note.textContent = `${legendaEscala} A variação compara duas janelas de 7 dias pela data de ativação — ela não mede o início da negociação nem exige fechamento diário.${externo ? '' : ' Renovações contam apenas para vendedores internos.'}`;
  if (insights) {
    const comparaveis = indicadores.filter(item => item.valor != null && item.nome !== 'Renovações' && item.nome !== 'Variação recente');
    const maisForte = [...comparaveis].filter(item => item.valor >= 100).sort((a, b) => b.valor - a.valor)[0];
    const abaixo = [...comparaveis].filter(item => item.valor < 100).sort((a, b) => a.valor - b.valor)[0];
    const cards = [];
    if (maisForte) cards.push(`<article class="an-attribute-insight is-positive"><span>CONQUISTA DO PERÍODO</span><p>${escapeHtmlText(maisForte.nome)}: ${escapeHtmlText(maisForte.detalhe)}.</p></article>`);
    if (abaixo) {
      let textoAtencao = `${abaixo.nome} está em ${Math.round(abaixo.valor)}% da referência.`;
      if (abaixo.nome === 'Meta de vendas') textoAtencao = `Faltam ${Math.max(0, metaVendas - vendas)} vendas para alcançar a meta mensal.`;
      else if (abaixo.nome === 'Ticket médio') textoAtencao = `Ticket em ${Math.round(abaixo.valor)}% da referência regional; diferença de R$ ${formatarValorAnalitica(Math.max(0, referencia - ticket))}.`;
      else if (abaixo.nome === 'Variação recente') textoAtencao = `${semanaAtual} ativações nos últimos 7 dias vs. ${semanaAnterior} nos 7 anteriores; a variação usa a data de ativação.`;
      else if (abaixo.nome === 'Renovações') textoAtencao = `Foram registradas ${renovacoes} renovações em ${new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long' })}.`;
      cards.push(`<article class="an-attribute-insight is-focus"><span>PRÓXIMO PASSO</span><p>${escapeHtmlText(textoAtencao)}</p></article>`);
    }
    insights.innerHTML = cards.join('');
    insights.hidden = cards.length === 0;
  }
  return { semanaAtual, semanaAnterior };
}

function renderizarGraficosPerfilAnalitico(selecionado) {
  const cache = contextoAnaliticaSelecionado().cache;
  const id = String(selecionado.cadastro?.id ?? selecionado.vendedor?.id ?? '');
  const externo = selecionado.tipo === 'externo';
  const vendasDiretas = (cache.vendasMes || []).filter(v => {
    if (String(v.vendedor_id) !== id) return false;
    return !(externo && (v.fora_filial === true || isVendaRecebidaDeOutraFilial(v)));
  });
  const vendasOrigem = !externo ? (cache.vendasOrigemMes || []).filter(v =>
    String(v.vendedor_id) === id && v.tipo === 'interno'
  ) : [];
  const origemPorDia = new Map();
  vendasOrigem.forEach(v => origemPorDia.set(v.dia, (origemPorDia.get(v.dia) || 0) + Number(v.vendas || 0)));
  const mesRef = cache.mes || {};
  const ano = Number(mesRef.ano || _ultimoProcessado?.mes?.ano || new Date().getFullYear());
  const mesNum = Number(mesRef.mesNum || _ultimoProcessado?.mes?.mesNum || new Date().getMonth() + 1);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const nomeMesRef = mesRef.mesNome || new Date(ano, mesNum - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
  const vendasPorDia = Array.from({ length: diasNoMes }, (_, i) => ({ dia: i + 1, quantidade: 0 }));
  vendasDiretas.forEach(v => {
    const dia = Number(String(v.data_venda || '').slice(8, 10));
    if (dia > 0 && dia <= diasNoMes) vendasPorDia[dia - 1].quantidade++;
  });
  origemPorDia.forEach((quantidade, data) => {
    const dia = Number(String(data || '').slice(8, 10));
    if (dia > 0 && dia <= diasNoMes) vendasPorDia[dia - 1].quantidade += quantidade;
  });
  const totalDiario = vendasPorDia.reduce((total, item) => total + item.quantidade, 0);
  const maxDia = Math.max(1, ...vendasPorDia.map(item => item.quantidade));
  const chartDaily = document.getElementById('an-daily-chart');
  const chartTotal = document.getElementById('an-daily-total');
  const chartNote = document.getElementById('an-daily-note');
  const lastDay = document.getElementById('an-chart-last-day');
  if (chartDaily) {
    chartDaily.innerHTML = vendasPorDia.map(item => {
      const height = item.quantidade ? Math.max(5, Math.round(item.quantidade / maxDia * 100)) : 0;
      return `<span class="an-day-column" title="Dia ${item.dia}: ${item.quantidade} ativação(ões)" aria-label="Dia ${item.dia}: ${item.quantidade} ativação(ões)"><i style="height:${height}%"></i><small>${item.dia % 5 === 0 || item.dia === 1 ? item.dia : ''}</small></span>`;
    }).join('');
  }
  if (chartTotal) chartTotal.textContent = `${totalDiario} ativações`;
  if (chartNote) chartNote.textContent = vendasOrigem.length
    ? `Contagem pela data de ativação. Inclui ${vendasOrigem.reduce((t, v) => t + Number(v.vendas || 0), 0)} ativação(ões) originada(s) em outras filiais.`
    : 'Contagem distribuída pela data de ativação registrada no sistema.';
  if (lastDay) lastDay.textContent = String(diasNoMes);

  const planos = cache.planos || [];
  const categorias = cache.categoriasPlanos || [];
  const cores = ['#22d3ee', '#8b7cff', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#f97316', '#c084fc'];
  const porPlano = new Map();
  const porCategoria = new Map();
  let planosSemDetalhe = 0;
  vendasDiretas.forEach(v => {
    const planoId = String(v.plano_id ?? v.planos?.id ?? '').trim();
    const plano = planos.find(p => String(p.id) === planoId);
    const nomeBase = plano?.nome || v.plano_nome || v.planos?.nome || 'Plano sem identificação';
    const velocidade = Number(plano?.velocidade_mb || v.planos?.velocidade_mb)
      || Number(String(nomeBase).match(/(\d+(?:[.,]\d+)?)\s*(?:mbps|mb)\b/i)?.[1]?.replace(',', '.'))
      || null;
    const ehServico = Boolean(plano?.eh_servico || v.planos?.eh_servico);
    const nome = ehServico
      ? nomeBase
      : `${nomeBase}${velocidade && !new RegExp(`${velocidade}\\s*(?:mbps|mb)`, 'i').test(nomeBase) ? ` ${velocidade} Mbps` : ''}`;
    if (!velocidade && !ehServico && /fibra/i.test(nomeBase)) planosSemDetalhe++;
    const categoria = categorias.find(c => String(c.id) === String(plano?.categoria_id))?.nome || 'Sem categoria';
    const qtd = v.quantidade == null ? 1 : Math.max(1, Number(v.quantidade) || 1);
    // O ID do catálogo é a identidade real do produto. O nome, por si só,
    // pode se repetir para várias velocidades de Uni Fibra.
    const chavePlano = planoId ? `id:${planoId}` : `nome:${nome}`;
    const atual = porPlano.get(chavePlano) || { nome, quantidade: 0, planoId, semVelocidade: !velocidade && !ehServico && /fibra/i.test(nomeBase) };
    atual.quantidade += qtd;
    porPlano.set(chavePlano, atual);
    porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + qtd);
  });
  const totalPlanos = [...porPlano.values()].reduce((total, item) => total + item.quantidade, 0);
  const categoriasOrdenadas = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const totalPlanEl = document.getElementById('an-plan-total');
  const mix = document.getElementById('an-plan-mix');
  const planNote = document.getElementById('an-plan-note');
  if (totalPlanEl) totalPlanEl.textContent = `${totalPlanos} planos`;
  if (planNote) {
    const observacoes = [];
    if (planosSemDetalhe) observacoes.push(`${planosSemDetalhe} registro(s) de Uni Fibra sem velocidade no catálogo`);
    if (vendasOrigem.length) observacoes.push(`${vendasOrigem.reduce((total, item) => total + Number(item.vendas || 0), 0)} venda(s) de outras filiais sem detalhamento do plano`);
    planNote.textContent = observacoes.length
      ? `${observacoes.join(' · ')}. Confira o cadastro do plano para distinguir as velocidades.`
      : 'Produtos separados pelo cadastro e velocidade.';
  }
  if (mix) {
    if (!totalPlanos) {
      mix.innerHTML = `<p class="an-chart-empty">Ainda não há planos identificados para este colaborador em ${escapeHtmlText(nomeMesRef)}.</p>`;
    } else {
      let cursor = 0;
      const stops = categoriasOrdenadas.map(([nome, quantidade], index) => {
        const inicio = cursor;
        cursor += quantidade / totalPlanos * 100;
        return `${cores[index % cores.length]} ${inicio.toFixed(2)}% ${cursor.toFixed(2)}%`;
      }).join(', ');
      const fatias = categoriasOrdenadas.map(([nome, quantidade], index) => `<li><i style="--an-swatch:${cores[index % cores.length]}"></i><span>${escapeHtmlText(nome)}</span><b>${quantidade} <small>${Math.round(quantidade / totalPlanos * 100)}%</small></b></li>`).join('');
      mix.innerHTML = `<div class="an-donut" style="--an-donut:${stops}" role="img" aria-label="Mix de ${totalPlanos} planos por categoria"><span><b>${totalPlanos}</b><small>planos</small></span></div><ul class="an-mix-legend">${fatias}</ul>`;
    }
  }
  const top = document.getElementById('an-top-plans');
  if (top) {
    const todosOrdenados = [...porPlano.values()].sort((a, b) => b.quantidade - a.quantidade);
    const ranking = todosOrdenados.slice(0, 6);
    const demaisProdutos = todosOrdenados.slice(6);
    const quantidadeDemais = demaisProdutos.reduce((total, item) => total + item.quantidade, 0);
    top.innerHTML = ranking.length
      ? ranking.map((item, index) => {
        const nomeExibido = item.semVelocidade && item.planoId ? `${item.nome} · ID ${item.planoId}` : item.nome;
        return `<div class="an-plan-row"><span class="an-plan-index">${index + 1}</span><span class="an-plan-name" title="${escapeHtmlText(nomeExibido)}">${escapeHtmlText(nomeExibido)}</span><span class="an-plan-track"><i style="width:${Math.round(item.quantidade / ranking[0].quantidade * 100)}%"></i></span><b>${item.quantidade}</b></div>`;
      }).join('') + (demaisProdutos.length
        ? `<div class="an-plan-row an-plan-row-other"><span class="an-plan-index">+</span><span class="an-plan-name" title="${demaisProdutos.length} outro(s) produto(s)">Outros produtos · ${demaisProdutos.length} tipo(s)</span><span class="an-plan-track"><i style="width:${Math.min(100, Math.round(quantidadeDemais / ranking[0].quantidade * 100))}%"></i></span><b>${quantidadeDemais}</b></div>`
        : '')
      : '<p class="an-chart-empty">Sem vendas de planos detalhadas neste período.</p>';
    if (planNote && ranking.length && porPlano.size > ranking.length) {
      planNote.textContent += ` Exibindo os ${ranking.length} mais vendidos entre ${porPlano.size} produtos.`;
    } else if (planNote && ranking.length) {
      planNote.textContent += ` ${ranking.length === 1 ? 'Produto identificado' : 'Todos os produtos identificados'} neste período.`;
    }
  }
  return { vendasDiretas, vendasOrigem, totalDiario };
}

function renderizarGradeAnalitica(vendedores = _analiticaVendedores) {
  const contexto = contextoAnaliticaSelecionado();
  const ranks = contexto.cache.ranksMensais || [];
  const mesLabel = `${contexto.mes?.mesNome || ''} ${contexto.mes?.ano || ''}`.trim();
  const grade = document.getElementById('an-roster-grid');
  const resumo = document.getElementById('an-roster-summary');
  if (!grade) return;
  const busca = String(document.getElementById('an-busca')?.value || '').trim().toLocaleLowerCase('pt-BR');
  const filtrados = vendedores.filter(item => !busca || String(item.nome || '').toLocaleLowerCase('pt-BR').includes(busca));
  const ordemRanks = ['SS', 'S', 'A', 'B', 'C', 'D'];
  filtrados.sort((a, b) => {
    const ra = ranks.find(r => String(r.vendedor_id) === String(a.id))?.rank_mensal || '';
    const rb = ranks.find(r => String(r.vendedor_id) === String(b.id))?.rank_mensal || '';
    const ia = ra ? ordemRanks.indexOf(ra) : ordemRanks.length;
    const ib = rb ? ordemRanks.indexOf(rb) : ordemRanks.length;
    return ia - ib || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
  const comRank = vendedores.filter(item => ranks.some(r => String(r.vendedor_id) === String(item.id) && r.elegivel && r.rank_mensal)).length;
  if (resumo) resumo.textContent = `${vendedores.length} colaboradores · ${comRank} com rank em ${mesLabel}`;
  if (!filtrados.length) {
    grade.innerHTML = `<div class="an-roster-empty">${busca ? 'Nenhum colaborador encontrado com esse nome.' : 'Nenhum colaborador participante do ranking foi encontrado nesta filial.'}</div>`;
    return;
  }
  grade.innerHTML = filtrados.map(item => {
    const cadastro = (contexto.vendedores || []).find(v => String(v.id) === String(item.id));
    const rank = ranks.find(r => String(r.vendedor_id) === String(item.id));
    const rankLabel = rank?.elegivel ? rank.rank_mensal : null;
    const vendas = Number(rank?.vendas ?? item.vendas ?? 0);
    const meta = Number(rank?.meta_vendas ?? item.meta ?? 0);
    const pct = meta > 0 ? Math.min(100, Math.round(vendas / meta * 100)) : 0;
    const foto = cadastro?.foto_url || item.foto_url || PHOTOS[item.slug] || '';
    const inicial = escapeHtmlText(String(item.nome || '?').trim().charAt(0).toUpperCase());
    const avatar = foto
      ? `<img src="${escapeHtmlText(foto)}" alt="" loading="lazy" crossorigin="anonymous" data-an-avatar data-fallback="${inicial}">`
      : `<span>${inicial}</span>`;
    const emblema = rankLabel
      ? `<img src="${escapeHtmlText(RANK_CARREIRA_IMAGENS[rankLabel])}" alt="Rank ${escapeHtmlText(rankLabel)}" loading="lazy">`
      : `<span class="an-rank-placeholder" aria-label="Sem rank">—</span>`;
    const tipo = item.tipo === 'externo' ? 'Externo' : 'Interno';
    return `<button type="button" class="an-roster-card" data-an-select="${Number(item.id)}" aria-label="Abrir perfil de ${escapeHtmlText(item.nome)}">
      <span class="an-roster-card-top"><span class="an-roster-avatar">${avatar}</span><span class="an-roster-rank">${emblema}<small>${rankLabel ? `RANK ${escapeHtmlText(rankLabel)}` : 'EM PROGRESSO'}</small></span></span>
      <span class="an-roster-name">${escapeHtmlText(item.nome)}</span><span class="an-roster-role">${tipo} · ${vendas} venda${vendas === 1 ? '' : 's'} em ${escapeHtmlText(mesLabel)}</span>
      <span class="an-roster-progress-label"><span>JORNADA DO MÊS</span><b>${meta > 0 ? `${pct}%` : '—'}</b></span>
      <span class="an-roster-progress" role="progressbar" aria-label="Progresso das vendas na meta mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></span>
      <span class="an-roster-open">Abrir perfil <span aria-hidden="true">↗</span></span>
    </button>`;
  }).join('');
}

async function renderizarAnaliticaPerfis() {
  const select = document.getElementById('an-vendedor-select');
  const periodo = document.getElementById('an-periodo');
  const profile = document.getElementById('an-profile');
  const modal = document.getElementById('an-profile-modal');
  const grade = document.getElementById('an-roster-grid');
  if (!select || !profile || !modal || !grade) return;
  const token = ++_analiticaRenderToken;
  const selecionadoAntes = select.value;
  const perfilAberto = !modal.hidden;
  const contexto = contextoAnaliticaSelecionado();
  const d = contexto.d;
  if (!d) {
    select.replaceChildren(new Option('Aguardando dados da equipe…', ''));
    grade.innerHTML = '<div class="an-roster-empty">Carregando dados da equipe…</div>';
    profile.hidden = true;
    modal.hidden = true;
    document.body.classList.remove('an-modal-open');
    return;
  }
  const vendedoresMes = [...(d.intMes || []), ...(d.extMes || [])];
  const vendedores = (contexto.vendedores || [])
    .filter(cadastro => cadastro.ativo !== false && cadastro.participa_ranking !== false)
    .map(cadastro => {
      const doMes = vendedoresMes.find(item => String(item.id) === String(cadastro.id));
      return {
        ...cadastro,
        ...(doMes || {}),
        id: cadastro.id,
        nome: cadastro.nome || doMes?.nome || 'Colaborador',
        tipo: cadastro.tipo || doMes?.tipo || 'interno',
        vendas: Number(doMes?.vendas || 0),
        valor: Number(doMes?.valor ?? doMes?.valor_total ?? 0),
        meta: Number(doMes?.meta ?? cadastro.meta ?? 0),
      };
    })
    .sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
  _analiticaVendedores = vendedores;
  select.replaceChildren(new Option('Selecione um colaborador', ''));
  vendedores.forEach(item => {
    const cadastro = (contexto.vendedores || []).find(v => String(v.id) === String(item.id));
    const tipo = item.tipo === 'externo' ? 'Externo' : 'Interno';
    select.add(new Option(`${item.nome} · ${tipo}`, String(item.id)));
  });
  if (vendedores.some(item => String(item.id) === selecionadoAntes)) select.value = selecionadoAntes;
  if (periodo) {
    const mesNome = d.mes?.mesNome || CONFIG.mesReferencia || '';
    periodo.textContent = `${String(mesNome).trim()} ${d.mes?.ano || new Date().getFullYear()}`;
  }
  const seletorPeriodo = document.getElementById('an-period-select');
  if (seletorPeriodo) {
    seletorPeriodo.max = chaveMesPeriodo(_cache.mes || calcularPeriodoMes());
    if (!seletorPeriodo.value) seletorPeriodo.value = chaveMesPeriodo(_cache.mes || calcularPeriodoMes());
  }
  renderizarGradeAnalitica(vendedores);
  if (!vendedores.length) {
    profile.hidden = true;
    modal.hidden = true;
    document.body.classList.remove('an-modal-open');
    return;
  }
  if (perfilAberto && vendedores.some(item => String(item.id) === selecionadoAntes)) await renderizarPerfilAnalitico(token);
  else { profile.hidden = true; modal.hidden = true; document.body.classList.remove('an-modal-open'); }
}

async function renderizarPerfilAnalitico(token = ++_analiticaRenderToken) {
  const selecionado = obterPerfilAnaliticoSelecionado();
  const profile = document.getElementById('an-profile');
  const modal = document.getElementById('an-profile-modal');
  if (!selecionado || !profile || !modal) return;
  const botaoRelatorioPDF = document.getElementById('an-relatorio-pdf-btn');
  if (botaoRelatorioPDF) {
    botaoRelatorioPDF.disabled = true;
    botaoRelatorioPDF.textContent = 'Prévia do mês em PDF';
    botaoRelatorioPDF.title = 'Preparando o relatório do período selecionado.';
  }
  const { vendedor, cadastro, rank, renovacao, metasVendas, metasRenovacao, tipo } = selecionado;
  const externo = tipo === 'externo';
  const vendas = Number(rank?.vendas ?? vendedor.vendas ?? 0);
  const metaVendas = Number(rank?.meta_vendas ?? vendedor.meta ?? 0);
  const renovacoes = Number(renovacao?.quantidade ?? rank?.renovacoes ?? 0);
  const metaRenovacoes = Number(rank?.meta_renovacoes || 0);
  const ticket = Number(rank?.ticket_medio ?? (vendedor.vendas ? Number(vendedor.valor || 0) / Number(vendedor.vendas) : 0));
  const referencia = Number(rank?.ticket_referencia || 0);
  const nomeMesAnalitico = contextoAnaliticaSelecionado().mes?.mesNome || 'período';
  const rankMensal = rank?.elegivel ? rank.rank_mensal : null;
  const fileira = document.getElementById('an-avatar');
  const foto = cadastro?.foto_url || vendedor.foto_url || PHOTOS[vendedor.slug] || '';
  fileira.replaceChildren();
  if (foto) {
    const img = new Image(); img.alt = ''; img.crossOrigin = 'anonymous'; img.src = foto;
    img.onerror = () => { fileira.textContent = String(vendedor.nome || '?').trim().charAt(0).toUpperCase(); };
    fileira.appendChild(img);
  } else fileira.textContent = String(vendedor.nome || '?').trim().charAt(0).toUpperCase();
  document.getElementById('an-nome').textContent = vendedor.nome;
  document.getElementById('an-filial-tipo').textContent = `${window.FILIAL_ATUAL?.nome || 'Filial selecionada'} · ${externo ? 'Vendedor externo' : 'Vendedor interno'}`;
  document.getElementById('an-rank-mensal').textContent = rankMensal || 'Sem rank';
  const rankMensalImg = document.getElementById('an-rank-mensal-img');
  rankMensalImg.hidden = !rankMensal;
  if (rankMensal) rankMensalImg.src = RANK_CARREIRA_IMAGENS[rankMensal]; else rankMensalImg.removeAttribute('src');
  document.getElementById('an-rank-mensal-status').textContent = rankMensal
    ? `${rank.vendas} vendas · ticket médio R$ ${ticket.toFixed(2).replace('.', ',')} · XP considera vendas, ticket e evolução semanal${externo ? '' : ' e renovações'}`
    : rank?.elegivel ? 'Ainda não atingiu 20 XP. Vendas, ticket, evolução semanal e renovações internas somam pontos ao longo do mês.' : 'Confira a meta individual de vendas para habilitar o cálculo.';
  const status = document.getElementById('an-status');
  if (status) status.textContent = 'Carregando histórico de carreira…';
  let historico = [];
  if (window._supabase && cadastro?.carreira_pessoa_id) {
    const { data, error } = await window._supabase.rpc('historico_rank_carreira_analitica', {
      p_carreira_pessoa_id: cadastro.carreira_pessoa_id,
      p_filial_id: Number(window.FILIAL_ATUAL_ID),
    });
    if (token !== _analiticaRenderToken) return;
    if (error) {
      console.warn('[renderizarPerfilAnalitico] falha ao carregar histórico de carreira:', error.message);
      if (status) status.textContent = 'Aplique supabase/historico-rank-carreira-analitica.sql para consultar o histórico seguro da carreira.';
    } else historico = data || [];
  }
  const carreira = calcularProgressoCarreira(historico, tipo);
  const rankCarreiraImg = document.getElementById('an-rank-carreira-img');
  document.getElementById('an-rank-carreira').textContent = carreira.rankCarreira;
  rankCarreiraImg.src = RANK_CARREIRA_IMAGENS[carreira.rankCarreira];
  document.getElementById('an-rank-carreira-status').textContent = carreira.mesesFechados
    ? `${carreira.mesesFechados} mês(es) fechado(s) · renovação da carreira: C 50%, B 65%, A 85%, S 100%`
    : 'Base inicial · o ciclo começa em outubro de 2026';
  const pctRenovacoes = metaRenovacoes > 0 ? Math.round(renovacoes / metaRenovacoes * 100) : null;
  const pctTicket = referencia > 0 ? Math.round(ticket / referencia * 100) : null;
  const contextoAnalitico = contextoAnaliticaSelecionado();
  const detalhesVendas = renderizarGraficosPerfilAnalitico(selecionado);
  const mesAnalitico = contextoAnalitico.mes || {};
  const leituraXPmensal = renderizarAtributosComerciais(selecionado, detalhesVendas, {
    vendas, metaVendas, ticket, referencia, renovacoes, metasVendas,
    metaRenovacoes: Number(metasRenovacao.meta_m1 || metasRenovacao.m1 || metaRenovacoes),
    diasNoMes: new Date(Number(mesAnalitico.ano || new Date().getFullYear()), Number(mesAnalitico.mesNum || new Date().getMonth() + 1), 0).getDate(),
    ano: Number(mesAnalitico.ano || new Date().getFullYear()),
    mesNum: Number(mesAnalitico.mesNum || new Date().getMonth() + 1),
  });
  const valorVendasDiretas = detalhesVendas.vendasDiretas.reduce((total, item) => total + Number(item.valor_total ?? item.valor_plano ?? item.valor ?? 0), 0);
  const valorVendasOrigem = detalhesVendas.vendasOrigem.reduce((total, item) => total + Number(item.valor || 0), 0);
  const valorVendido = valorVendasDiretas + valorVendasOrigem;
  const cards = [
    ['Vendas no mês', vendas.toLocaleString('pt-BR'), 'Vendas novas registradas no período selecionado'],
    ['Valor vendido', `R$ ${formatarValorAnalitica(valorVendido)}`, 'Soma dos valores registrados nas vendas'],
    ['Renovações', renovacoes.toLocaleString('pt-BR'), `Renovações registradas em ${nomeMesAnalitico}`],
    ['Ticket médio', `R$ ${formatarValorAnalitica(ticket)}`, referencia > 0 ? `${pctTicket}% da referência regional (R$ ${formatarValorAnalitica(referencia)})` : 'Referência indisponível'],
  ];
  document.getElementById('an-metrics').innerHTML = cards.map(([label, value, sub]) => `<article class="an-metric"><span>${label}</span><strong>${value}</strong><small>${sub}</small></article>`).join('');
  const xpStatus = document.getElementById('an-xp-period-status');
  const xpTotal = document.getElementById('an-xp-total');
  const xpBreakdown = document.getElementById('an-xp-breakdown');
  const xpNote = document.getElementById('an-xp-note');
  if (xpStatus) xpStatus.textContent = 'Calculando período…';
  if (xpTotal) xpTotal.textContent = '—';
  if (xpBreakdown) xpBreakdown.replaceChildren();
  try {
    const periodoXP = contextoAnalitico.mes || calcularPeriodoMes();
    const mesXP = Number(periodoXP.mesNum || periodoXP.mes);
    const anoXP = Number(periodoXP.ano);
    if (!Number.isInteger(mesXP) || mesXP < 1 || mesXP > 12 || !Number.isInteger(anoXP)) {
      throw new Error(`Período inválido para calcular XP (${String(periodoXP.mesNum ?? periodoXP.mes)}/${String(periodoXP.ano)}).`);
    }
    const { data: xpData, error: xpError } = await window._supabase.rpc('calcular_xp_comercial_vendedor', {
      p_vendedor_id: Number(cadastro?.id || vendedor.id),
      p_mes: mesXP,
      p_ano: anoXP,
    });
    if (token !== _analiticaRenderToken) return;
    if (xpError) throw xpError;
    const xp = Array.isArray(xpData) ? xpData[0] : xpData;
    if (!xp) throw new Error('O cálculo não retornou dados para este colaborador.');
    if (botaoRelatorioPDF) {
      const fechado = String(xp.status || '').toLowerCase() === 'fechado';
      botaoRelatorioPDF.disabled = false;
      botaoRelatorioPDF.textContent = fechado ? 'Relatório final em PDF' : 'Prévia do mês em PDF';
      botaoRelatorioPDF.title = fechado
        ? 'Baixar o relatório individual deste mês fechado.'
        : 'Baixar uma prévia individual. Os dados podem mudar até o fechamento do mês.';
    }
    const formatarXP = valor => `${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} XP`;
    const xpPeriodoEl = document.getElementById('an-xp-period-total');
    if (xpTotal) xpTotal.textContent = formatarXP(xp.xp_acumulado_carreira);
    if (xpPeriodoEl) xpPeriodoEl.textContent = formatarXP(xp.xp_total_periodo);
    carreira.progressoXP = calcularProgressoFaixa(xp.xp_acumulado_carreira, FAIXAS_XP_CARREIRA);
    carreira.rankCarreira = carreira.progressoXP.atual?.rank || 'D';
    rankCarreiraImg.hidden = false;
    rankCarreiraImg.src = RANK_CARREIRA_IMAGENS[carreira.rankCarreira];
    document.getElementById('an-rank-carreira').textContent = carreira.rankCarreira;
    document.getElementById('an-rank-carreira-status').textContent = carreira.progressoXP.proxima
      ? `${formatarPontosRank(carreira.progressoXP.valor)} XP acumulados · próximo rank ${carreira.progressoXP.proxima.rank}: faltam ${formatarPontosRank(carreira.progressoXP.faltam)} XP`
      : `Rank ${carreira.rankCarreira} alcançado · faixa máxima de XP.`;
    if (xpStatus) xpStatus.textContent = `${xp.status === 'fechado' ? 'Mês fechado' : 'Estimativa provisória'} · ${formatarXP(xp.xp_total_periodo)} no mês`;
    const ajusteTicket = Number(xp.xp_bonus_ticket || 0);
    const bonusMetas = Number(xp.xp_bonus_meta_vendas || 0) + Number(xp.xp_bonus_meta_renovacoes || 0);
    const linhasXP = [
      ['Vendas novas', Number(xp.xp_base_vendas || 0)],
      ['Ajuste pelo ticket', ajusteTicket],
      ['Renovações', Number(xp.xp_renovacoes || 0)],
      ['Bônus por metas', bonusMetas],
    ].filter(([, valor]) => Number(valor) !== 0);
    if (xpBreakdown) xpBreakdown.innerHTML = linhasXP.map(([nome, valor]) => `<div class="an-xp-line${Number(valor) < 0 ? ' is-negative' : ''}"><span>${nome}</span><strong>${Number(valor) > 0 ? '+' : ''}${formatarXP(valor)}</strong></div>`).join('');
    if (xpNote) {
      const ticketInfo = xp.multiplicador_ticket == null
        ? 'Ticket sem base válida; vendas recebem o XP-base, sem ajuste.'
        : `Ticket médio R$ ${formatarValorAnalitica(xp.ticket_medio)} · multiplicador ${Number(xp.multiplicador_ticket).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×.`;
      const campanhaInfo = xp.campanha_id ? ` Campanha configurada #${xp.campanha_id}.` : '';
      const metasInfo = xp.bonus_metas_ativo
        ? ' Os bônus de vendas e renovações usam as metas oficiais separadamente; o multiplicador de ticket não se aplica a eles.'
        : ' Bônus de metas desativado na configuração central.';
      xpNote.textContent = `${ticketInfo}${campanhaInfo}${metasInfo} O XP acumulado define a faixa de carreira; a pontuação mensal é calculada separadamente e pode variar até o fechamento.`;
    }
  } catch (xpError) {
    const erroXP = xpError?.message || 'Erro desconhecido ao consultar a função de XP.';
    const codigoXP = xpError?.code ? ` (${xpError.code})` : '';
    const dicaXP = xpError?.hint ? ` Dica do Supabase: ${xpError.hint}` : '';
    console.warn('[renderizarPerfilAnalitico] não foi possível carregar XP comercial:', xpError);
    if (xpStatus) xpStatus.textContent = `Falha ao consultar XP${codigoXP}`;
    if (xpTotal) xpTotal.textContent = '—';
    const xpPeriodoEl = document.getElementById('an-xp-period-total');
    if (xpPeriodoEl) xpPeriodoEl.textContent = '—';
    carreira.rankCarreira = null;
    carreira.progressoXP = null;
    rankCarreiraImg.hidden = true;
    document.getElementById('an-rank-carreira').textContent = '—';
    document.getElementById('an-rank-carreira-status').textContent = 'XP de carreira indisponível.';
    if (xpBreakdown) xpBreakdown.replaceChildren();
    if (xpNote) xpNote.textContent = `${erroXP}${dicaXP} O rank mensal continua usando a regra atual.`;
    if (botaoRelatorioPDF) {
      botaoRelatorioPDF.disabled = true;
      botaoRelatorioPDF.title = 'Não foi possível confirmar o fechamento deste mês.';
    }
  }
  if (status && !status.textContent.startsWith('Não foi possível')) status.textContent = '';
  await preencherFichaAnalitica(selecionado, carreira, detalhesVendas, leituraXPmensal, mesAnalitico);
  profile.hidden = false;
  modal.hidden = false;
  document.body.classList.add('an-modal-open');
  modal.querySelector('[data-an-close]:not(.an-modal-backdrop)')?.focus({ preventScroll: true });
}

async function preencherFichaAnalitica(selecionado, carreira, detalhesVendas = {}, leituraXPmensal = null, mesAnalitico = contextoAnaliticaSelecionado().mes) {
  const { vendedor, cadastro, rank, renovacao, tipo } = selecionado;
  const externo = tipo === 'externo';
  const rankMensal = rank?.elegivel ? rank.rank_mensal : null;
  const vendas = Number(rank?.vendas ?? vendedor.vendas ?? 0);
  const metaVendas = Number(rank?.meta_vendas ?? vendedor.meta ?? 0);
  const renovacoes = Number(renovacao?.quantidade ?? rank?.renovacoes ?? 0);
  const metaRenovacoes = Number(rank?.meta_renovacoes || 0);
  const ticket = Number(rank?.ticket_medio ?? (vendedor.vendas ? Number(vendedor.valor || 0) / Number(vendedor.vendas) : 0));
  const referencia = Number(rank?.ticket_referencia || 0);
  const card = document.getElementById('an-card');
  const foto = cadastro?.foto_url || vendedor.foto_url || PHOTOS[vendedor.slug] || '';
  const avatar = document.getElementById('an-card-avatar');
  avatar.replaceChildren();
  if (foto) {
    const img = new Image(); img.alt = ''; img.crossOrigin = 'anonymous'; img.src = foto;
    img.onerror = () => { avatar.textContent = String(vendedor.nome || '?').trim().charAt(0).toUpperCase(); };
    avatar.appendChild(img);
  } else avatar.textContent = String(vendedor.nome || '?').trim().charAt(0).toUpperCase();
  const rankMensalImg = document.getElementById('an-card-month-rank-img');
  rankMensalImg.hidden = !rankMensal;
  if (rankMensal) rankMensalImg.src = RANK_CARREIRA_IMAGENS[rankMensal]; else rankMensalImg.removeAttribute('src');
  document.getElementById('an-card-month-rank').textContent = rankMensal || 'Sem rank';
  document.getElementById('an-card-month-note').textContent = rankMensal
    ? 'Rank mensal combina indicadores; metas de vendas aparecem nas etapas abaixo.'
    : 'A classificação mensal considera o desempenho deste período.';
  const rankCarreiraImg = document.getElementById('an-card-career-rank-img');
  rankCarreiraImg.hidden = !carreira.rankCarreira;
  if (carreira.rankCarreira) rankCarreiraImg.src = RANK_CARREIRA_IMAGENS[carreira.rankCarreira];
  else rankCarreiraImg.removeAttribute('src');
  document.getElementById('an-card-career-rank').textContent = carreira.rankCarreira || '—';
  document.getElementById('an-card-career-note').textContent = carreira.progressoXP
    ? 'Nível permanente da trajetória comercial.'
    : 'Progresso de carreira indisponível.';
  const periodo = mesAnalitico?.mesNome ? `${mesAnalitico.mesNome} ${mesAnalitico.ano || ''}` : CONFIG.mesReferencia || '';
  const nomeMesAnalitico = mesAnalitico?.mesNome || 'período';
  document.getElementById('an-card-period').textContent = periodo;
  document.getElementById('an-card-filial').textContent = window.FILIAL_ATUAL?.nome || 'UNI Internet';
  document.getElementById('an-card-name').textContent = vendedor.nome;
  document.getElementById('an-card-role').textContent = externo ? 'Vendedor externo' : 'Vendedor interno';
  document.getElementById('an-card-sales').textContent = vendas.toLocaleString('pt-BR');
  document.getElementById('an-card-sales-note').textContent = metaVendas > 0
    ? 'Vendas novas registradas no período selecionado'
    : 'Vendas novas no período · meta não cadastrada';
  document.getElementById('an-card-renewals').textContent = renovacoes.toLocaleString('pt-BR');
  document.getElementById('an-card-renewals-note').textContent = externo
    ? `Registros em ${nomeMesAnalitico}`
    : `Renovações registradas em ${nomeMesAnalitico}`;
  document.getElementById('an-card-ticket').textContent = `R$ ${formatarValorAnalitica(ticket)}`;
  document.getElementById('an-card-ticket-note').textContent = referencia > 0 ? `${Math.round(ticket / referencia * 100)}% da referência regional` : 'Referência indisponível';
  const valorVendido = (detalhesVendas.vendasDiretas || []).reduce((total, item) => total + Number(item.valor_total ?? item.valor_plano ?? item.valor ?? 0), 0)
    + (detalhesVendas.vendasOrigem || []).reduce((total, item) => total + Number(item.valor || 0), 0);
  document.getElementById('an-card-value').textContent = `R$ ${formatarValorAnalitica(valorVendido)}`;

  const copiarConteudo = (origemId, destinoId, seletor = null) => {
    const origem = document.getElementById(origemId);
    const destino = document.getElementById(destinoId);
    if (!origem || !destino) return;
    const conteudo = seletor ? origem.querySelector(seletor) : origem;
    destino.replaceChildren(...Array.from(conteudo?.childNodes || []).map(no => no.cloneNode(true)));
  };
  copiarConteudo('an-top-plans', 'an-card-top-plans');
  document.getElementById('an-card-plan-total').textContent = document.getElementById('an-plan-total')?.textContent || '—';
  const xpPeriod = document.getElementById('an-xp-period-total')?.textContent || '—';
  document.getElementById('an-card-xp-total').textContent = xpPeriod === '—' ? '— XP' : `+${xpPeriod}`;
  const statusXP = document.getElementById('an-xp-period-status')?.textContent || 'Estimativa do período';
  document.getElementById('an-card-xp-note').textContent = `${statusXP.split(' · ')[0]}. O XP pode mudar com novas vendas, cancelamentos ou ajustes até o fechamento.`;
  preencherBarraProgressoFicha('career', carreira.progressoXP, 'XP');
  document.getElementById('an-card-plan-note').textContent = document.getElementById('an-plan-note')?.textContent || '';
  document.getElementById('an-card-generated').textContent = new Date().toLocaleDateString('pt-BR');
  if (rankMensal) card.dataset.rank = String(rankMensal).toLowerCase(); else delete card.dataset.rank;
}

async function gerarRelatorioAnaliticoPDF(evt) {
  const selecionado = obterPerfilAnaliticoSelecionado();
  const botao = evt?.currentTarget || document.getElementById('an-relatorio-pdf-btn');
  if (!selecionado || !botao) return;
  let periodoFechado = document.getElementById('an-xp-period-status')?.textContent?.startsWith('Mês fechado') || false;
  botao.disabled = true;
  botao.textContent = 'Preparando relatório…';
  try {
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) await carregarLibsAdmin();
    if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) throw new Error('A biblioteca de PDF não carregou. Tente novamente.');

    const contexto = contextoAnaliticaSelecionado();
    const periodo = contexto.mes || {};
    const mes = Number(periodo.mesNum || periodo.mes);
    const ano = Number(periodo.ano);
    if (!Number.isInteger(mes) || mes < 1 || mes > 12 || !Number.isInteger(ano)) throw new Error('Não consegui identificar o mês do relatório.');

    const { data: xpData, error: xpError } = await window._supabase.rpc('calcular_xp_comercial_vendedor', {
      p_vendedor_id: Number(selecionado.cadastro?.id || selecionado.vendedor.id), p_mes: mes, p_ano: ano,
    });
    if (xpError) throw xpError;
    const xp = Array.isArray(xpData) ? xpData[0] : xpData;
    const fechado = String(xp?.status || '').toLowerCase() === 'fechado';
    periodoFechado = fechado;
    const partesMesAtual = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Manaus', year: 'numeric', month: '2-digit',
    }).formatToParts(new Date());
    const anoAtualManaus = Number(partesMesAtual.find(item => item.type === 'year')?.value);
    const mesAtualManaus = Number(partesMesAtual.find(item => item.type === 'month')?.value);
    const chaveMesSelecionado = ano * 12 + mes;
    const chaveMesAtual = anoAtualManaus * 12 + mesAtualManaus;
    const mesVigente = chaveMesSelecionado === chaveMesAtual;
    const mesEncerrado = chaveMesSelecionado < chaveMesAtual;

    const { vendedor, cadastro, rank, renovacao, metasVendas, metasRenovacao, tipo } = selecionado;
    const externo = tipo === 'externo';
    const vendedorId = String(cadastro?.id || vendedor.id);
    const filialVendedorId = Number(cadastro?.filial_id ?? vendedor.filial_id ?? window.FILIAL_ATUAL_ID);
    const vendasDiretas = (contexto.cache.vendasMes || []).filter(item => String(item.vendedor_id) === vendedorId);
    const vendasFora = await loadVendasEquipeEmOutrasFiliais(periodo.de, periodo.ate);
    const vendasOrigem = vendasFora.filter(item => String(item.vendedor_id) === vendedorId);
    const registros = [...vendasDiretas, ...vendasOrigem].map(item => {
      const origemId = Number(item.filial_origem_id);
      const destinoId = Number(item.filial_destino_id);
      const origemValida = Number.isInteger(origemId) && origemId > 0;
      const destinoValido = Number.isInteger(destinoId) && destinoId > 0;
      let origemTipo = 'origem_indefinida';
      if (item.fora_filial === true) origemTipo = 'fora_filial';
      else if (origemValida && destinoValido && origemId === filialVendedorId && destinoId === filialVendedorId) origemTipo = 'propria_regional';
      else if (origemValida && destinoValido && origemId === filialVendedorId && destinoId !== filialVendedorId) origemTipo = 'outra_regional_destino';
      else if (origemValida && origemId !== filialVendedorId) origemTipo = 'outra_regional_origem';
      const contaMeta = !externo || origemTipo === 'propria_regional';
      const planoId = String(item.plano_id ?? item.planos?.id ?? '').trim();
      const plano = (contexto.cache.planos || []).find(p => String(p.id) === planoId);
      const nomeBase = plano?.nome || item.plano_nome || item.planos?.nome || 'Plano sem identificação';
      const velocidade = Number(plano?.velocidade_mb || item.planos?.velocidade_mb)
        || Number(String(nomeBase).match(/(\d+(?:[.,]\d+)?)\s*(?:mbps|mb)\b/i)?.[1]?.replace(',', '.'))
        || null;
      const nomePlano = plano?.eh_servico || item.planos?.eh_servico
        ? nomeBase
        : `${nomeBase}${velocidade && !new RegExp(`${velocidade}\\s*(?:mbps|mb)`, 'i').test(nomeBase) ? ` ${velocidade} Mbps` : ''}`;
      return {
        data: dataLocalStr(item.data_venda),
        cliente: String(item.cliente || extrairClienteDeObservacao(item.observacao) || '').trim(),
        plano: nomePlano,
        valor: Number(item.valor_total ?? item.valor_plano ?? item.valor ?? 0),
        origemTipo,
        contaMeta,
      };
    }).sort((a, b) => a.data.localeCompare(b.data));
    const totalVendas = registros.length;
    const valorTotal = registros.reduce((total, item) => total + item.valor, 0);
    const registrosMeta = registros.filter(item => item.contaMeta);
    const vendasContabilizadasMeta = registrosMeta.length;
    const valorContabilizadoMeta = registrosMeta.reduce((total, item) => total + item.valor, 0);
    const vendasFechadas = Number(rank?.vendas ?? vendasContabilizadasMeta);
    const valorFechado = Number(rank?.valor_vendas ?? valorContabilizadoMeta);
    if (vendasFechadas !== vendasContabilizadasMeta || Math.abs(valorFechado - valorContabilizadoMeta) > 0.02) {
      throw new Error(`Os registros que contam para a meta somam ${vendasContabilizadasMeta} venda(s), mas o fechamento registra ${vendasFechadas}. Para evitar um PDF divergente, confira os dados deste mês antes de compartilhar.`);
    }
    const ticket = vendasContabilizadasMeta ? valorContabilizadoMeta / vendasContabilizadasMeta : 0;
    const contagemOrigem = Object.fromEntries(['propria_regional', 'outra_regional_destino', 'fora_filial', 'outra_regional_origem', 'origem_indefinida']
      .map(tipoOrigem => [tipoOrigem, registros.filter(item => item.origemTipo === tipoOrigem).length]));
    const renovacoes = Number(renovacao?.quantidade ?? rank?.renovacoes ?? 0);
    const referencia = Number(rank?.ticket_referencia || 0);
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const vendasPorDia = Array.from({ length: diasNoMes }, (_, i) => ({ dia: i + 1, qtd: 0 }));
    registrosMeta.forEach(item => {
      const dia = Number(item.data.slice(8, 10));
      if (dia > 0 && dia <= diasNoMes) vendasPorDia[dia - 1].qtd++;
    });
    const diasComAtivacao = vendasPorDia.filter(item => item.qtd > 0).length;
    const porPlano = new Map();
    registrosMeta.forEach(item => porPlano.set(item.plano, (porPlano.get(item.plano) || 0) + 1));
    const listaPlanos = [...porPlano.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
    const nomeMes = periodo.mesNome || new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long' });
    const formatoReais = valor => `R$ ${Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const formatoInteiro = valor => Number(valor || 0).toLocaleString('pt-BR');
    const metaVendas = externo
      ? Number(metasVendas.meta_vendas ?? rank?.meta_vendas ?? vendedor.meta ?? 0)
      : Number(metasVendas.meta_m1 ?? rank?.meta_vendas ?? 0);
    const metasEtapas = externo
      ? (metaVendas > 0 ? [{ nome: 'Meta individual', meta: metaVendas }] : [])
      : [
        { nome: 'M3 · etapa inicial', meta: Number(metasVendas.meta_m3 || 0) },
        { nome: 'M2 · etapa intermediária', meta: Number(metasVendas.meta_m2 || 0) },
        { nome: 'M1 · etapa avançada', meta: Number(metasVendas.meta_m1 || metaVendas) },
      ].filter(item => item.meta > 0);
    const metaRenovacaoM1 = Number(metasRenovacao.meta_m1 || 0);
    const metasRenovacaoEtapas = [
      { nome: 'M3 · etapa inicial', meta: Number(metasRenovacao.meta_m3 || 0) },
      { nome: 'M2 · etapa intermediária', meta: Number(metasRenovacao.meta_m2 || 0) },
      { nome: 'M1 · etapa avançada', meta: Number(metasRenovacao.meta_m1 || 0) },
    ].filter(etapa => etapa.meta > 0);
    const metasFilial = contexto.cache.metasFilial || {};
    const metasRenovCancel = contexto.cache.metasRenovCancel || {};
    const metasRenovacaoFilial = contexto.cache.metasRenovacaoFilial || {
      meta_m3: metasRenovCancel.renovacoes_m3,
      meta_m2: metasRenovCancel.renovacoes_m2,
      meta_m1: metasRenovCancel.renovacoes_m1,
    };
    const vendasFilial = (contexto.cache.vendasMes || []).filter(item => item.fora_filial !== true).length
      + (contexto.cache.vendasFiliais || []).reduce((total, item) => total + Number(item.quantidade || 1), 0);
    const renovacoesFilial = Array.isArray(contexto.cache.renovacoesMes)
      ? contexto.cache.renovacoesMes.reduce((total, item) => total + Number(item.quantidade || 0), 0)
      : null;
    const cancelamentosFilial = metasRenovCancel.cancelamentos_atual == null
      ? null : Number(metasRenovCancel.cancelamentos_atual);
    const metasFilialRenovacao = [metasRenovacaoFilial.meta_m3, metasRenovacaoFilial.meta_m2, metasRenovacaoFilial.meta_m1];
    const limitesCancelamento = [metasRenovCancel.cancelamentos_m3, metasRenovCancel.cancelamentos_m2, metasRenovCancel.cancelamentos_m1];

    const contagemPeriodo = (inicioDia, fimDia) => vendasPorDia.reduce((total, item) =>
      total + (item.dia >= inicioDia && item.dia <= fimDia ? item.qtd : 0), 0);
    const recente = contagemPeriodo(Math.max(1, diasNoMes - 6), diasNoMes);
    const anterior = contagemPeriodo(Math.max(1, diasNoMes - 13), Math.max(0, diasNoMes - 7));
    const variacaoRecente = anterior > 0 ? Math.round((recente - anterior) / anterior * 100) : null;
    const indicadores = [
      { nome: 'Meta individual de vendas', resultado: `${formatoInteiro(vendasContabilizadasMeta)} de ${formatoInteiro(metaVendas)} vendas`, percentual: metaVendas > 0 ? Math.round(vendasContabilizadasMeta / metaVendas * 100) : null, referencia: 'Somente vendas elegíveis para este perfil' },
      { nome: 'Ticket médio', resultado: formatoReais(ticket), percentual: referencia > 0 ? Math.round(ticket / referencia * 100) : null, referencia: 'Referência regional = 100%' },
      { nome: 'Ativações recentes', resultado: anterior > 0 ? `${recente} nos últimos 7 dias · ${anterior} nos 7 anteriores` : `${recente} nos últimos 7 dias`, percentual: variacaoRecente, referencia: 'Comparação pela data de ativação' },
    ];
    if (!externo) indicadores.push({
      nome: 'Renovações', resultado: metaRenovacaoM1 > 0 ? `${formatoInteiro(renovacoes)} de ${formatoInteiro(metaRenovacaoM1)}` : `${formatoInteiro(renovacoes)} registradas`,
      percentual: metaRenovacaoM1 > 0 ? Math.round(renovacoes / metaRenovacaoM1 * 100) : null,
      referencia: metaRenovacaoM1 > 0 ? 'Meta M1 compartilhada pela equipe interna' : 'Sem meta de renovação cadastrada',
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') throw new Error('A tabela do PDF não carregou. Tente novamente.');
    const azul = [14, 69, 111], ciano = [20, 177, 213], tinta = [24, 43, 63], muted = [94, 113, 132], pale = [237, 246, 251], line = [211, 225, 235];
    const cabecalho = (titulo, subtitulo = '') => {
      doc.setFillColor(...ciano); doc.rect(0, 0, 210, 3, 'F');
      doc.setFillColor(...azul); doc.rect(0, 3, 210, 25, 'F');
      const logoUni = document.querySelector('.header-logo .logo-dark')?.src;
      if (logoUni) {
        try { doc.addImage(logoUni, 'PNG', 16, 5, 27, 19); }
        catch (error) { console.warn('[gerarRelatorioAnaliticoPDF] não foi possível inserir o logo UNI:', error); }
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(220, 238, 248); doc.text('RELATÓRIO INDIVIDUAL DE DESEMPENHO', 50, 11);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(255, 255, 255); doc.text(titulo, 50, 21);
      if (subtitulo) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.text(subtitulo, 16, 37); }
      doc.setDrawColor(...line); doc.line(16, 44, 194, 44);
    };
    const tituloSecao = (texto, y) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...azul); doc.text(texto.toUpperCase(), 16, y);
      return y + 6;
    };
    const textoQuebrado = (texto, x, y, largura, tamanho = 8) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(tamanho); doc.setTextColor(...muted);
      const linhas = doc.splitTextToSize(texto, largura); doc.text(linhas, x, y); return linhas.length;
    };
    const ranksDoTipo = (contexto.cache.ranksMensais || [])
      .filter(item => String(item.tipo || '').toLowerCase() === tipo)
      .sort((a, b) => Number(b.vendas || 0) - Number(a.vendas || 0)
        || Number(b.valor_vendas || 0) - Number(a.valor_vendas || 0)
        || String(a.vendedor_nome || '').localeCompare(String(b.vendedor_nome || ''), 'pt-BR'));
    const posicaoIndex = ranksDoTipo.findIndex(item => String(item.vendedor_id) === vendedorId);
    const vendasNaPosicao = posicaoIndex >= 0 ? Number(ranksDoTipo[posicaoIndex].vendas || 0) : null;
    const valorNaPosicao = posicaoIndex >= 0 ? Number(ranksDoTipo[posicaoIndex].valor_vendas || 0) : null;
    const posicaoMes = posicaoIndex >= 0 ? posicaoIndex + 1 : null;
    const empatadosNaPosicao = posicaoIndex >= 0
      ? ranksDoTipo.filter(item => Number(item.vendas || 0) === vendasNaPosicao
        && Number(item.valor_vendas || 0) === valorNaPosicao).length
      : 0;
    const grupoLabel = externo ? 'vendedores externos' : 'vendedores internos';
    const geradoEm = new Date().toLocaleDateString('pt-BR');
    const filial = window.FILIAL_ATUAL?.nome || 'Filial selecionada';

    doc.setProperties({ title: `Relatório analítico — ${vendedor.nome} — ${nomeMes} ${ano}`, subject: 'Desempenho comercial individual', author: 'UNI Internet' });
    const statusPeriodo = periodoFechado
      ? 'FECHAMENTO CONSOLIDADO'
      : mesVigente ? 'PERÍODO EM ANDAMENTO'
        : mesEncerrado ? 'MÊS ENCERRADO · CONSOLIDAÇÃO PENDENTE' : 'PERÍODO FUTURO';
    cabecalho('Seu mês em análise', `${String(nomeMes).toLocaleUpperCase('pt-BR')} ${ano} · ${statusPeriodo}`);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...tinta); doc.text(String(vendedor.nome || 'Colaborador'), 16, 56);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
    doc.text(`${externo ? 'Vendedor externo' : 'Vendedor interno'} · ${filial}`, 16, 62);
    doc.text(`Gerado em ${geradoEm}`, 194, 62, { align: 'right' });
    if (!periodoFechado) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(164, 91, 30);
      doc.text(mesVigente
        ? 'PRÉVIA: vendas e cancelamentos ainda podem ser atualizados até o fechamento do mês.'
        : 'MÊS ENCERRADO, MAS A CONSOLIDAÇÃO OFICIAL AINDA ESTÁ PENDENTE; dados podem mudar.', 16, 68);
    }

    let y = periodoFechado || mesVigente ? 72 : 77;
    doc.setFillColor(...pale); doc.setDrawColor(...line); doc.roundedRect(16, y, 178, 21, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...muted);
    doc.text(periodoFechado ? 'POSIÇÃO FINAL NO MÊS' : mesVigente ? 'POSIÇÃO ATUAL NO MÊS' : 'POSIÇÃO DO MÊS ENCERRADO', 21, y + 7);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...azul);
    doc.text(posicaoMes ? `${posicaoMes}º lugar${empatadosNaPosicao > 1 ? ' · empatado' : ''}` : 'Sem colocação', 21, y + 16);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
    const descricaoPosicao = posicaoMes
      ? `em vendas entre ${ranksDoTipo.length} ${grupoLabel} da filial ${filial}`
      : `Não foi possível calcular a colocação entre ${grupoLabel}.`;
    doc.text(doc.splitTextToSize(descricaoPosicao, 118).slice(0, 2), 70, y + 10);
    y += 29;
    y = tituloSecao('Resumo do período', y);
    const kpis = [
      { label: 'VENDAS REGISTRADAS', value: formatoInteiro(totalVendas), sub: `${formatoInteiro(vendasContabilizadasMeta)} contam para sua meta` },
      { label: 'VALOR TOTAL REGISTRADO', value: formatoReais(valorTotal), sub: 'Inclui vendas dentro e fora da regional' },
      { label: 'TICKET MÉDIO DA META', value: formatoReais(ticket), sub: referencia > 0 ? `${Math.round(ticket / referencia * 100)}% da referência` : 'Referência indisponível' },
      externo
        ? { label: 'DIAS COM ATIVAÇÕES', value: formatoInteiro(diasComAtivacao), sub: 'Dias do mês com vendas ativadas' }
        : { label: 'RENOVAÇÕES', value: formatoInteiro(renovacoes), sub: metaRenovacaoM1 > 0 ? `${Math.round(renovacoes / metaRenovacaoM1 * 100)}% da meta M1` : 'Registros do mês' },
    ];
    const gap = 3, cardW = (178 - gap * 3) / 4;
    kpis.forEach((item, index) => {
      const x = 16 + index * (cardW + gap);
      doc.setFillColor(248, 251, 253); doc.setDrawColor(...line); doc.roundedRect(x, y, cardW, 25, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.2); doc.setTextColor(...muted); doc.text(item.label, x + 3, y + 6);
      doc.setFontSize(item.value.length > 15 ? 9 : 12); doc.setTextColor(...tinta); doc.text(item.value, x + 3, y + 14);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(...muted); doc.text(doc.splitTextToSize(item.sub, cardW - 6).slice(0, 2), x + 3, y + 20);
    });
    y += 34;
    y = tituloSecao('Origem das vendas e contagem da meta', y);
    const origemRows = [
      ['Da própria regional', contagemOrigem.propria_regional, 'Sim'],
      ['Da própria regional, para outra filial', contagemOrigem.outra_regional_destino, externo ? 'Não' : 'Sim'],
      ['Fora da regional / originada em outra regional', contagemOrigem.fora_filial + contagemOrigem.outra_regional_origem, externo ? 'Não' : 'Sim'],
      ['Origem ou destino sem identificação', contagemOrigem.origem_indefinida, externo ? 'Não' : 'Sim'],
    ].filter(([, quantidade]) => Number(quantidade) > 0);
    origemRows.push(
      ['Total de vendas registradas', totalVendas, '—'],
      ['Total contabilizado na meta individual', vendasContabilizadasMeta, '—'],
    );
    doc.autoTable({ startY: y, theme: 'grid', head: [['Origem', 'Vendas', 'Conta para a meta?']], body: origemRows,
      margin: { left: 16, right: 16 }, styles: { fontSize: 7, cellPadding: 1.8, textColor: tinta },
      headStyles: { fillColor: azul, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 104 }, 1: { cellWidth: 28, halign: 'center' }, 2: { cellWidth: 54, halign: 'center' } },
    });
    y = doc.lastAutoTable.finalY + 3;
    textoQuebrado(externo
      ? 'Para vendedor externo, a meta considera apenas vendas sem marcação de fora da filial, com origem e destino na própria regional. As demais aparecem no total, mas ficam fora da meta individual.'
      : 'Para vendedor interno, todas as vendas atribuídas ao perfil entram na meta, inclusive vendas para outra filial e vendas marcadas fora da filial.',
    16, y + 1, 178, 6.5);
    y += 9;
    y = tituloSecao(mesEncerrado || periodoFechado ? 'Metas de vendas do mês encerrado' : externo ? 'Sua meta do mês' : 'Etapas das metas de vendas', y);
    if (metasEtapas.length) {
      const etapasW = 178 / metasEtapas.length;
      metasEtapas.forEach((etapa, index) => {
        const x = 16 + index * etapasW;
        const pct = etapa.meta > 0 ? Math.min(100, vendasContabilizadasMeta / etapa.meta * 100) : 0;
        const faltam = Math.max(0, etapa.meta - vendasContabilizadasMeta);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...azul); doc.text(etapa.nome, x, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted);
        doc.text(`${formatoInteiro(Math.min(vendasContabilizadasMeta, etapa.meta))} de ${formatoInteiro(etapa.meta)} vendas`, x, y + 6);
        doc.setDrawColor(...line); doc.setFillColor(...line); doc.roundedRect(x, y + 9, etapasW - 6, 3, 1.5, 1.5, 'F');
        if (pct > 0) { doc.setFillColor(...ciano); doc.roundedRect(x, y + 9, Math.max(2, (etapasW - 6) * pct / 100), 3, 1.5, 1.5, 'F'); }
        const nomeEtapaCurto = etapa.nome.split(' · ')[0];
        const textoEtapa = mesEncerrado || periodoFechado
          ? faltam
            ? (externo ? `${formatoInteiro(faltam)} abaixo da meta` : `${formatoInteiro(faltam)} abaixo de ${nomeEtapaCurto}`)
            : `${nomeEtapaCurto} ${vendasContabilizadasMeta > etapa.meta ? 'superada' : 'alcançada'}`
          : faltam ? `Faltam ${formatoInteiro(faltam)}` : 'Meta atingida';
        doc.text(textoEtapa, x, y + 18);
      });
      y += 28;
    } else {
      textoQuebrado('As metas deste período não estão configuradas.', 16, y + 3, 178); y += 13;
    }
    if (y > 226) { doc.addPage(); cabecalho('Suas renovações no mês', `${String(nomeMes).toLocaleUpperCase('pt-BR')} ${ano} · resultado individual`); y = 54; }
    y = tituloSecao('Metas de renovação da equipe interna', y);
    if (externo) {
      doc.setFillColor(...pale); doc.setDrawColor(...line); doc.roundedRect(16, y, 178, 18, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...azul);
      doc.text(`${formatoInteiro(renovacoes)} renovação(ões) registrada(s) no período`, 21, y + 7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted);
      doc.text('As metas compartilhadas de renovação são destinadas à equipe interna.', 21, y + 13);
      y += 24;
    } else if (metasRenovacaoEtapas.length) {
      const etapasW = 178 / metasRenovacaoEtapas.length;
      metasRenovacaoEtapas.forEach((etapa, index) => {
        const x = 16 + index * etapasW;
        const pct = Math.min(100, renovacoes / etapa.meta * 100);
        const faltam = Math.max(0, etapa.meta - renovacoes);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...azul); doc.text(etapa.nome, x, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted);
        doc.text(`${formatoInteiro(Math.min(renovacoes, etapa.meta))} de ${formatoInteiro(etapa.meta)} renovações`, x, y + 6);
        doc.setDrawColor(...line); doc.setFillColor(...line); doc.roundedRect(x, y + 9, etapasW - 6, 3, 1.5, 1.5, 'F');
        if (pct > 0) { doc.setFillColor(...ciano); doc.roundedRect(x, y + 9, Math.max(2, (etapasW - 6) * pct / 100), 3, 1.5, 1.5, 'F'); }
        const curto = etapa.nome.split(' · ')[0];
        const status = faltam ? `${formatoInteiro(faltam)} para ${curto}` : `${curto} ${renovacoes > etapa.meta ? 'superada' : 'atingida'}`;
        doc.text(status, x, y + 18);
      });
      y += 28;
    } else {
      textoQuebrado(`${formatoInteiro(renovacoes)} renovação(ões) registrada(s). As metas M3, M2 e M1 individuais não estão configuradas para este período.`, 16, y + 3, 178);
      y += 13;
    }
    doc.addPage();
    cabecalho('Como seu mês aconteceu', `Ativações, produtos e indicadores comerciais${periodoFechado ? '' : ' · PRÉVIA'}`);
    y = 54;
    y = tituloSecao('Vendas que contam para a meta · por dia', y);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted);
    doc.text(`Total: ${formatoInteiro(vendasContabilizadasMeta)} vendas elegíveis · contagem pela data de ativação.`, 16, y);
    y += 5;
    const chartX = 19, chartW = 174, chartH = 45, chartY = y + chartH;
    const maxDia = Math.max(1, ...vendasPorDia.map(item => item.qtd));
    const slot = chartW / diasNoMes;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...muted);
    const niveisGrade = maxDia <= 3 ? [0, .5, 1] : [0, .25, .5, .75, 1];
    const rotulosGrade = new Set();
    niveisGrade.forEach(nivel => {
      const linhaY = chartY - chartH * nivel;
      doc.setDrawColor(...line); doc.setLineWidth(nivel === 0 ? .35 : .15); doc.line(chartX, linhaY, chartX + chartW, linhaY);
      const rotulo = Math.round(maxDia * nivel);
      if (nivel > 0 && !rotulosGrade.has(rotulo)) {
        doc.text(String(rotulo), 16, linhaY + 1.3, { align: 'right' });
        rotulosGrade.add(rotulo);
      }
    });
    vendasPorDia.forEach(item => {
      const height = item.qtd ? Math.max(1.2, item.qtd / maxDia * chartH) : 0;
      const barW = Math.max(1, slot * .58);
      const centro = chartX + (item.dia - .5) * slot;
      if (height) {
        doc.setFillColor(...ciano); doc.roundedRect(centro - barW / 2, chartY - height, barW, height, .45, .45, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(4.5); doc.setTextColor(...azul);
        doc.text(String(item.qtd), centro, chartY - height - 1.5, { align: 'center' });
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(...muted);
      doc.text(String(item.dia), centro, chartY + 4, { align: 'center' });
    });
    y = chartY + 12;
    y = tituloSecao('Planos que contam para a meta', y);
    if (listaPlanos.length) {
      doc.autoTable({ startY: y, theme: 'striped', head: [['Produto cadastrado', 'Quantidade', 'Participação']],
        body: listaPlanos.map(([produto, quantidade]) => [produto, quantidade, vendasContabilizadasMeta ? `${Math.round(quantidade / vendasContabilizadasMeta * 100)}%` : '0%']),
        margin: { left: 16, right: 16 }, styles: { fontSize: 8, cellPadding: 2.2, textColor: tinta },
        headStyles: { fillColor: azul, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [246, 250, 252] },
        columnStyles: { 0: { cellWidth: 112 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 36, halign: 'right' } },
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted); doc.text('Nenhum plano identificado neste período.', 16, y + 4); y += 12;
    }
    if (y > 223) { doc.addPage(); cabecalho('Seus indicadores comerciais', `Leitura individual do período${periodoFechado ? ' fechado' : ' · prévia'}`); y = 54; }
    y = tituloSecao('Atributos comerciais', y);
    doc.autoTable({ startY: y, theme: 'grid', head: [['Indicador', 'Seu resultado', 'Referência']],
      body: indicadores.map(item => [item.nome, `${item.resultado}${item.percentual == null ? '' : ` · ${item.percentual}%`}`, item.referencia]),
      margin: { left: 16, right: 16 }, styles: { fontSize: 7.5, cellPadding: 2.5, textColor: tinta },
      headStyles: { fillColor: azul, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 83 }, 2: { cellWidth: 53 } },
    });
    y = doc.lastAutoTable.finalY + 7;
    textoQuebrado('Os indicadores mostram seu próprio período. A variação semanal usa ativações registradas e serve como referência de evolução, não como exigência de fechar vendas todos os dias.', 16, y, 178, 7);

    doc.addPage();
    cabecalho('Resultado da filial', `${String(nomeMes).toLocaleUpperCase('pt-BR')} ${ano} · panorama coletivo do mês`);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text('Realizado da regional comparado às metas e aos limites definidos para o período.', 16, 55);
    const metasVendasFilial = [metasFilial.mensal_m3, metasFilial.mensal_m2, metasFilial.mensal_m1];
    const progressoMetaVendasFilial = calcularProgressoEtapasMeta(vendasFilial, [
      { label: 'M3', meta: metasFilial.mensal_m3 },
      { label: 'M2', meta: metasFilial.mensal_m2 },
      { label: 'M1', meta: metasFilial.mensal_m1 },
    ]);
    const metasRenovacaoFilialValores = [metasRenovacaoFilial.meta_m3, metasRenovacaoFilial.meta_m2, metasRenovacaoFilial.meta_m1];
    const cancelamentoFilialValores = limitesCancelamento;
    // Faixa global de progresso: a porcentagem acompanha a próxima etapa
    // ainda não concluída (M3 → M2 → M1), em vez de ficar presa à M1.
    const progressX = 16, progressY = 64, progressW = 178, progressH = 34;
    doc.setFillColor(239, 248, 253); doc.setDrawColor(...line);
    doc.roundedRect(progressX, progressY, progressW, progressH, 2.5, 2.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...muted);
    doc.text('PROGRESSO DA META MENSAL', progressX + 5, progressY + 8);
    if (progressoMetaVendasFilial) {
      const etapaFechada = progressoMetaVendasFilial.concluida;
      const statusEtapa = etapaFechada
        ? (progressoMetaVendasFilial.etapa === 'M1' ? 'M1 concluída' : 'Metas configuradas concluídas')
        : `Etapa ${progressoMetaVendasFilial.etapa}`;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...azul);
      doc.text(`${statusEtapa} · ${formatoInteiro(vendasFilial)} de ${formatoInteiro(progressoMetaVendasFilial.meta)} vendas`, progressX + 5, progressY + 17);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...ciano);
      doc.text(`${progressoMetaVendasFilial.percentual}%`, progressX + progressW - 5, progressY + 12, { align: 'right' });
      const barX = progressX + 5, barY = progressY + 26, barW = progressW - 10;
      doc.setDrawColor(215, 228, 238); doc.setLineWidth(2.2); doc.line(barX, barY, barX + barW, barY);
      if (progressoMetaVendasFilial.percentual > 0) {
        doc.setDrawColor(...ciano); doc.line(barX, barY, barX + barW * progressoMetaVendasFilial.percentual / 100, barY);
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.8); doc.setTextColor(...muted);
      doc.text(etapaFechada ? 'Todas as metas configuradas foram alcançadas.' : `Faltam ${formatoInteiro(progressoMetaVendasFilial.faltam)} vendas para atingir ${progressoMetaVendasFilial.etapa}.`, progressX + 5, progressY + 32);
    } else {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...muted);
      doc.text('Metas M3, M2 e M1 não configuradas para este período.', progressX + 5, progressY + 21);
    }
    const drawFilialMetric = ({ titulo, atual, unidade, metas, modo = 'meta', y: cardY }) => {
      const cardX = 16, cardW = 178, cardH = 45, resumoW = 48;
      const trilha = [222, 230, 238], neutro = [133, 151, 167];
      doc.setFillColor(249, 252, 254); doc.setDrawColor(...line); doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'FD');
      doc.setDrawColor(...line); doc.line(cardX + resumoW, cardY + 5, cardX + resumoW, cardY + cardH - 5);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...muted);
      doc.text(titulo.toLocaleUpperCase('pt-BR'), cardX + 5, cardY + 9);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...azul);
      doc.text(atual == null ? '—' : formatoInteiro(atual), cardX + 5, cardY + 25);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...muted);
      doc.text(unidade, cardX + 5, cardY + 33);
      if (atual == null) {
        doc.setFontSize(5.8); doc.text('Dado não informado para este mês', cardX + 5, cardY + 39);
      }

      const areaX = cardX + resumoW + 2;
      const areaW = cardW - resumoW - 4;
      const colW = areaW / 3;
      ['M3', 'M2', 'M1'].forEach((stage, index) => {
        const x = areaX + index * colW;
        if (index > 0) {
          doc.setDrawColor(229, 236, 242);
          doc.line(x, cardY + 6, x, cardY + cardH - 6);
        }
        const meta = Number(metas[index]);
        const validMeta = Number.isFinite(meta) && meta > 0;
        const innerX = x + 4;
        const innerW = colW - 8;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5); doc.setTextColor(...ciano);
        doc.text(stage, innerX, cardY + 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.4); doc.setTextColor(...tinta);
        doc.text(validMeta ? `${modo === 'limite' ? 'Limite' : 'Meta'} ${formatoInteiro(meta)}` : 'Sem meta', innerX + 10, cardY + 10);

        if (!validMeta || atual == null) {
          doc.setDrawColor(...trilha); doc.setLineWidth(1.8); doc.line(innerX, cardY + 20, innerX + innerW, cardY + 20);
          doc.setFontSize(5.8); doc.setTextColor(...neutro); doc.text(validMeta ? 'Sem realizado' : 'Não configurada', innerX, cardY + 31);
          return;
        }

        const razao = Number(atual) / meta;
        const progresso = Math.max(0, Math.min(1, razao));
        let corBarra = ciano;
        let status = '';
        if (modo === 'limite') {
          corBarra = razao > 1 ? [211, 75, 91] : razao >= .85 ? [211, 145, 51] : [28, 157, 126];
          status = razao > 1
            ? `Excedido em ${formatoInteiro(Number(atual) - meta)}`
            : Number(atual) === meta ? 'No limite' : `Restam ${formatoInteiro(meta - Number(atual))}`;
        } else {
          status = Number(atual) >= meta
            ? Number(atual) > meta ? 'Meta superada' : 'Meta atingida'
            : `Faltam ${formatoInteiro(meta - Number(atual))}`;
        }
        doc.setDrawColor(...trilha); doc.setLineWidth(1.8); doc.line(innerX, cardY + 20, innerX + innerW, cardY + 20);
        if (progresso > 0) {
          doc.setDrawColor(...corBarra); doc.setLineWidth(1.8); doc.line(innerX, cardY + 20, innerX + innerW * progresso, cardY + 20);
        }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(5.6); doc.setTextColor(...(modo === 'limite' ? corBarra : muted));
        const statusLines = doc.splitTextToSize(status, innerW);
        doc.text(statusLines.slice(0, 2), innerX, cardY + 29);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(...neutro);
        doc.text(modo === 'limite' ? `${Math.round(razao * 100)}% do limite usado` : `${Math.round(razao * 100)}% da meta`, innerX, cardY + 39);
      });
      doc.setLineWidth(.2);
    };
    drawFilialMetric({ titulo: 'Vendas novas da filial', atual: vendasFilial, unidade: 'vendas realizadas', metas: metasVendasFilial, y: 104 });
    drawFilialMetric({ titulo: 'Renovações da filial', atual: renovacoesFilial, unidade: 'renovações importadas', metas: metasRenovacaoFilialValores, y: 156 });
    drawFilialMetric({ titulo: 'Cancelamentos informados', atual: cancelamentosFilial, unidade: 'limite menor é melhor', metas: cancelamentoFilialValores, modo: 'limite', y: 208 });
    textoQuebrado('Metas de vendas e renovações: barras mostram o avanço do realizado. Cancelamentos: a barra mostra quanto do limite informado no painel ADM foi usado; ultrapassar o limite aparece em vermelho. Vendas e renovações seguem as importações registradas para esta filial no mês.', 16, 262, 178, 7);

    doc.addPage();
    cabecalho('Suas vendas no período', `${formatoInteiro(totalVendas)} registros · ${formatoInteiro(vendasContabilizadasMeta)} contam para a meta${periodoFechado ? '' : ' · prévia sujeita a atualização'}`);
    const semCliente = registros.filter(item => !item.cliente).length;
    if (semCliente) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(164, 91, 30);
      doc.text(`${semCliente} registro(s) sem nome de cliente cadastrado aparecem identificados na tabela.`, 16, 51);
    }
    doc.autoTable({ startY: semCliente ? 57 : 51, theme: 'grid',
      head: [['Data de ativação', 'Cliente', 'Plano', 'Valor', 'Na meta?']],
      body: registros.length ? registros.map(item => [
        item.data ? item.data.split('-').reverse().join('/') : '—',
        item.cliente || 'Cliente não identificado',
        `${item.plano}${item.origemTipo === 'outra_regional_destino' ? ' · para outra filial' : item.origemTipo === 'fora_filial' ? ' · fora da filial' : item.origemTipo === 'outra_regional_origem' ? ' · origem em outra filial' : ''}`,
        formatoReais(item.valor),
        item.contaMeta ? 'Sim' : 'Não',
      ]) : [['—', 'Nenhuma venda ativa registrada', '—', formatoReais(0), '—']],
      margin: { left: 16, right: 16, top: 23, bottom: 18 },
      styles: { fontSize: 7, cellPadding: 2.1, overflow: 'linebreak', valign: 'middle', textColor: tinta },
      headStyles: { fillColor: azul, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [246, 250, 252] },
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 44 }, 2: { cellWidth: 66 }, 3: { cellWidth: 25, halign: 'right' }, 4: { cellWidth: 21, halign: 'center' } },
      rowPageBreak: 'avoid',
      willDrawPage: data => {
        if (data.pageNumber > 1) {
          doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...azul); doc.text('SUAS VENDAS NO PERÍODO · CONTINUAÇÃO', 16, 12);
          doc.setDrawColor(...line); doc.line(16, 16, 194, 16);
        }
      },
    });
    const totalPaginas = doc.internal.getNumberOfPages();
    for (let pagina = 1; pagina <= totalPaginas; pagina++) {
      doc.setPage(pagina); doc.setDrawColor(...line); doc.line(16, 286, 194, 286);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(...muted);
      doc.text(`UNI INTERNET · ${periodoFechado ? 'FECHAMENTO' : 'PRÉVIA'} · VENDAS ATIVADAS · CANCELAMENTOS NÃO COMPÕEM OS TOTAIS`, 16, 291);
      doc.text(`${pagina} / ${totalPaginas}`, 194, 291, { align: 'right' });
    }
    const seguro = String(vendedor.nome || 'colaborador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    const prefixoArquivo = periodoFechado ? 'Relatorio_Analitico' : 'Previa_Analitica';
    doc.save(`${prefixoArquivo}_${seguro}_${ano}-${String(mes).padStart(2, '0')}.pdf`);
    showToast(periodoFechado ? 'Relatório analítico individual gerado.' : 'Prévia analítica individual gerada. Os dados podem mudar até o fechamento.', 'success');
  } catch (error) {
    console.error('[gerarRelatorioAnaliticoPDF]', error);
    showToast(error.message || 'Não foi possível gerar o relatório analítico.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = periodoFechado ? 'Relatório final em PDF' : 'Prévia do mês em PDF';
    botao.title = periodoFechado
      ? 'Baixar o relatório individual deste mês fechado.'
      : 'Baixar prévia individual; os dados podem mudar até o fechamento do mês.';
  }
}

async function gerarFichaAnalitica(evt) {
  const selecionado = obterPerfilAnaliticoSelecionado();
  if (!selecionado) { showToast('Selecione um colaborador antes de gerar a ficha.', 'warning'); return; }
  const btn = evt?.currentTarget || document.getElementById('an-gerar-btn');
  const original = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando ficha…'; }
  try {
    await renderizarPerfilAnalitico();
    if (typeof html2canvas === 'undefined') await carregarLibsAdmin();
    if (typeof html2canvas === 'undefined') throw new Error('A biblioteca de imagem não carregou.');
    if (document.fonts?.ready) await document.fonts.ready;
    await Promise.all([...document.querySelectorAll('#an-card img')].map(img => img.decode?.().catch(() => {}) || Promise.resolve()));
    const canvas = await html2canvas(document.getElementById('an-card'), { backgroundColor:null, scale:2, useCORS:true, allowTaint:false, imageTimeout:10000 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível converter a ficha em PNG.');
    const link = document.createElement('a');
    const seguro = String(selecionado.vendedor.nome || 'colaborador').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    link.href = URL.createObjectURL(blob);
    const chavePeriodo = chaveMesPeriodo(contextoAnaliticaSelecionado().mes || _cache.mes);
    link.download = `Ficha_Desempenho_${seguro}_${chavePeriodo}.png`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 30000);
    showToast('Ficha analítica gerada.', 'success');
  } catch (error) {
    console.error('[gerarFichaAnalitica]', error);
    showToast(error.message || 'Não foi possível gerar a ficha.', 'error');
  } finally { if (btn) { btn.disabled = false; btn.innerHTML = original; } }
}

// Este script é carregado antes do HTML da área administrativa. Use delegação
// no document para que a troca do colaborador funcione mesmo quando o select
// ainda não existia no momento em que o arquivo foi executado.
document.addEventListener('change', event => {
  if (event.target?.id === 'an-vendedor-select') renderizarPerfilAnalitico();
});
