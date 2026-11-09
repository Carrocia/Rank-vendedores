// Relatorios de vendas, filtros e exportacoes PDF/Excel.
let _relatorioState = {
  linhas: [],
  paginaAtual: 1,
  porPagina: 20,
  selecionadas: new Set(),
  excluindoSelecionadas: false,
};

function chaveVendaRelatorio(linha) {
  return `${linha.tipoLinha}:${linha.id}`;
}

function atualizarAcoesSelecaoRelatorio() {
  const botao = document.getElementById('rel-excluir-selecionadas');
  if (!botao) return;
  const quantidade = _relatorioState.selecionadas.size;
  botao.textContent = `Excluir selecionadas (${quantidade})`;
  botao.disabled = quantidade === 0 || _relatorioState.excluindoSelecionadas;
}

function selecionarTodasVendasRelatorio() {
  _relatorioState.linhas.filter(linha => !linha.somenteLeitura).forEach(linha => _relatorioState.selecionadas.add(chaveVendaRelatorio(linha)));
  renderRelatorioTabela();
}

function limparSelecaoVendasRelatorio() {
  _relatorioState.selecionadas.clear();
  renderRelatorioTabela();
}

async function excluirVendasSelecionadasRelatorio() {
  if (_relatorioState.excluindoSelecionadas) return;
  const selecionadas = _relatorioState.linhas.filter(linha => _relatorioState.selecionadas.has(chaveVendaRelatorio(linha)));
  if (!selecionadas.length) { atualizarAcoesSelecaoRelatorio(); return; }
  const confirmado = window.confirm(`Confirma a exclusão permanente de ${selecionadas.length} venda(s) selecionada(s)? Os adicionais vinculados também serão removidos. Essa ação não pode ser desfeita.`);
  if (!confirmado) return;

  _relatorioState.excluindoSelecionadas = true;
  atualizarAcoesSelecaoRelatorio();
  let excluidas = 0;
  const falhas = [];
  for (const linha of selecionadas) {
    try {
      if (linha.tipoLinha === 'outra_filial') await deleteVendaOutraFilial(linha.id);
      else if (linha.tipoLinha === 'origem_outra_filial' && !ehSuperAdminAtual()) throw new Error('A exclusão deve ser feita pela filial de destino.');
      else await deleteVenda(linha.id);
      _relatorioState.selecionadas.delete(chaveVendaRelatorio(linha));
      excluidas++;
    } catch (error) {
      falhas.push(linha.cliente || linha.id);
      console.error('[excluirVendasSelecionadasRelatorio]', linha.id, error);
    }
  }
  _relatorioState.excluindoSelecionadas = false;
  if (excluidas) {
    showToast(`${excluidas} venda(s) excluída(s).${falhas.length ? ` ${falhas.length} falha(s); confira o relatório.` : ''}`, falhas.length ? 'warning' : 'success');
    await carregarDados();
    await aplicarFiltrosRelatorio();
  } else {
    atualizarAcoesSelecaoRelatorio();
    showToast('Não foi possível excluir as vendas selecionadas.', 'error');
  }
}

let _mesExclusaoConferido = null;

function invalidarConferenciaExclusaoMes() {
  _mesExclusaoConferido = null;
  const botao = document.getElementById('rel-limpeza-excluir');
  const resumo = document.getElementById('rel-limpeza-resumo');
  if (botao) botao.disabled = true;
  if (resumo) resumo.textContent = 'Confira novamente os registros para o mês selecionado.';
}

function limitesMesSelecionado(mes) {
  const [ano, numeroMes] = String(mes || '').split('-').map(Number);
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) return null;
  const proximoMes = numeroMes === 12 ? `${ano + 1}-01` : `${ano}-${String(numeroMes + 1).padStart(2, '0')}`;
  return {
    inicio: new Date(`${mes}-01T00:00:00-04:00`).toISOString(),
    fim: new Date(`${proximoMes}-01T00:00:00-04:00`).toISOString(),
  };
}

async function contarVendasDoMesParaLimpeza(mes) {
  const limites = limitesMesSelecionado(mes);
  if (!limites) throw new Error('Selecione um mês válido.');
  const [vendas, historico] = await Promise.all([
    window._supabase.from('vendas').select('id', { count: 'exact', head: true })
      .eq('filial_destino_id', window.FILIAL_ATUAL_ID).gte('data_venda', limites.inicio).lt('data_venda', limites.fim),
    window._supabase.from('vendas_outras_filiais').select('id', { count: 'exact', head: true })
      .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
      .gte('data_venda', limites.inicio).lt('data_venda', limites.fim),
  ]);
  if (vendas.error) throw vendas.error;
  if (historico.error) throw historico.error;
  return { vendas: vendas.count || 0, historico: historico.count || 0 };
}

async function conferirExclusaoMes() {
  const campo = document.getElementById('rel-limpeza-mes');
  const resumo = document.getElementById('rel-limpeza-resumo');
  const botao = document.getElementById('rel-limpeza-excluir');
  const mes = campo?.value;
  invalidarConferenciaExclusaoMes();
  if (!mes) { showToast('Escolha o mês que deseja conferir.', 'warning'); return; }

  const [ano, numeroMes] = mes.split('-').map(Number);
  const selecionado = new Date(ano, numeroMes - 1, 1);
  const hoje = new Date();
  const mesAtual = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  if (selecionado >= mesAtual) {
    showToast('A limpeza manual está disponível apenas para meses já encerrados.', 'warning');
    return;
  }

  if (resumo) resumo.textContent = 'Conferindo os registros do mês…';
  try {
    const contagens = await contarVendasDoMesParaLimpeza(mes);
    _mesExclusaoConferido = { mes, ...contagens };
    const filialNome = window.FILIAL_ATUAL?.nome || 'filial selecionada';
    if (resumo) resumo.textContent = `${mes}: ${contagens.vendas} vendas destinadas a ${filialNome} e ${contagens.historico} lançamentos históricos agregados. A limpeza remove os dois grupos.`;
    if (botao) botao.disabled = false;
  } catch (err) {
    console.error('[conferirExclusaoMes]', err);
    if (resumo) resumo.textContent = 'Não foi possível consultar os registros. Verifique a conexão e as permissões do Supabase.';
    showToast(err.message || 'Não foi possível conferir o mês.', 'error');
  }
}

async function excluirVendasDoMesConferido() {
  const conferencia = _mesExclusaoConferido;
  if (!conferencia) { showToast('Confira o mês novamente antes de excluir.', 'warning'); return; }
  const quantidade = conferencia.vendas + conferencia.historico;
  if (quantidade === 0) { showToast('Não há registros para excluir nesse mês.', 'warning'); return; }
  const confirmado = window.confirm(
    `Confirma a exclusão permanente de ${conferencia.vendas} vendas e ${conferencia.historico} lançamentos históricos de ${window.FILIAL_ATUAL?.nome || 'esta filial'} em ${conferencia.mes}? Essa ação não pode ser desfeita.`
  );
  if (!confirmado) return;

  try {
    const { data, error } = await window._supabase.rpc('apagar_vendas_mes', {
      p_mes: `${conferencia.mes}-01`,
      p_filial_id: window.FILIAL_ATUAL_ID,
    });
    if (error) throw error;
    const resultado = Array.isArray(data) ? data[0] : data;
    _mesExclusaoConferido = null;
    const botao = document.getElementById('rel-limpeza-excluir');
    if (botao) botao.disabled = true;
    const resumo = document.getElementById('rel-limpeza-resumo');
    if (resumo) resumo.textContent = `Exclusão concluída: ${resultado?.vendas_apagadas ?? conferencia.vendas} vendas e ${resultado?.registros_historicos_apagados ?? conferencia.historico} lançamentos históricos removidos de ${conferencia.mes}.`;
    showToast('Registros do mês excluídos.', 'success');
    await carregarDados();
    if (typeof aplicarFiltrosRelatorio === 'function') await aplicarFiltrosRelatorio();
  } catch (err) {
    console.error('[excluirVendasDoMesConferido]', err);
    showToast(err.message || 'Não foi possível excluir os registros. Confira se a função SQL foi criada no Supabase.', 'error');
  }
}

// Busca os nomes dos adicionais de cada venda (a view vendas_publicas
// só traz o valor agregado, não os nomes) — única consulta nova deste
// módulo, e só busca o que realmente falta.
async function loadAdicionaisPorVendas(vendaIds) {
  if (!vendaIds || vendaIds.length === 0) return {};
  // Divide os IDs para manter o tamanho das URLs sob controle quando um
  // relatório contém milhares de vendas; cada lote também percorre páginas.
  const data = [];
  for (let inicio = 0; inicio < vendaIds.length; inicio += 500) {
    const loteIds = vendaIds.slice(inicio, inicio + 500);
    const lote = await carregarTodasPaginas(() => window._supabase
      .from('venda_adicionais')
      .select('id, venda_id, quantidade, valor_unitario, produtos_adicionais(nome)')
      .in('venda_id', loteIds)
      .order('venda_id', { ascending: true })
      .order('id', { ascending: true }), 'adicionais do relatório');
    data.push(...lote);
  }
  const mapa = {};
  data.forEach(a => {
    if (!mapa[a.venda_id]) mapa[a.venda_id] = [];
    mapa[a.venda_id].push({
      nome: a.produtos_adicionais?.nome || '—',
      quantidade: a.quantidade,
      valor_unitario: Number(a.valor_unitario || 0),
    });
  });
  return mapa;
}

// Extrai HH:MM de um data_venda que pode vir como data pura ou
// timestamp completo (mesmo cuidado já usado em outros pontos do sistema).
function extrairHoraRelatorio(dataVendaRaw) {
  const str = String(dataVendaRaw || '');
  if (str.length >= 16 && str[10] === 'T') {
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return null;
}

// Preenche os selects de Vendedor/Plano com os dados já carregados em
// cache, e define o período padrão (mês atual) se ainda não escolhido.
function popularFiltrosRelatorio() {
  const selV = document.getElementById('rel-vendedor');
  if (selV) {
    const atual = selV.value;
    selV.innerHTML = '<option value="">Todos</option>' +
      (_cache.vendedores || []).map(v => `<option value="${v.id}" data-slug="${v.slug || ''}">${v.nome}</option>`).join('');
    selV.value = atual;
  }
  const selP = document.getElementById('rel-plano');
  if (selP) {
    const atual = selP.value;
    selP.innerHTML = '<option value="">Todos</option>' +
      (_cache.planos || []).map(p => `<option value="${p.id}">${escapeHtmlText(rotuloPlanoComVelocidade(p))}</option>`).join('');
    selP.value = atual;
  }
  const dataIni = document.getElementById('rel-data-ini');
  const dataFim = document.getElementById('rel-data-fim');
  if (dataIni && !dataIni.value && _cache.mes) dataIni.value = _cache.mes.de;
  if (dataFim && !dataFim.value && _cache.mes) dataFim.value = _cache.mes.ate;
}

function limparFiltrosRelatorio() {
  document.getElementById('rel-vendedor').value = '';
  document.getElementById('rel-tipo-vendedor').value = '';
  document.getElementById('rel-plano').value = '';
  document.getElementById('rel-tipo-venda').value = '';
  document.getElementById('rel-vendas-equipe-outras-filiais').value = 'incluir';
  if (_cache.mes) {
    document.getElementById('rel-data-ini').value = _cache.mes.de;
    document.getElementById('rel-data-fim').value = _cache.mes.ate;
  }
  aplicarFiltrosRelatorio();
}

// Chamada ao abrir a seção "Relatórios" (mesmo padrão de outras seções
// do ADM que recarregam sua área ao navegar até ela).
function abrirRelatorioVendas() {
  popularFiltrosRelatorio();
  aplicarFiltrosRelatorio();
}

async function aplicarFiltrosRelatorio() {
  if (!_dadosCarregados) { showToast('Os dados ainda não foram carregados do Supabase.', 'warning'); return; }

  const dataIni = document.getElementById('rel-data-ini').value;
  const dataFim = document.getElementById('rel-data-fim').value;
  const vendedorSelEl = document.getElementById('rel-vendedor');
  const vendedorId = vendedorSelEl.value;
  const vendedorSlug = vendedorSelEl.selectedOptions[0]?.dataset.slug || '';
  const tipoVendedor = document.getElementById('rel-tipo-vendedor').value;
  const planoId = document.getElementById('rel-plano').value;
  const tipoVenda = document.getElementById('rel-tipo-venda').value;
  const incluirVendasEquipeOutrasFiliais = document.getElementById('rel-vendas-equipe-outras-filiais').value !== 'excluir';

  if (!dataIni || !dataFim) { showToast('Selecione o período (data inicial e final).', 'warning'); return; }
  _relatorioState.selecionadas.clear();
  atualizarAcoesSelecaoRelatorio();

  // O cache público não contém cliente nem observação. O relatório
  // administrativo consulta sua view própria, protegida por RLS.
  let vendasBase, filiaisBase, vendasEquipeOutrasFiliais;
  try {
    [vendasBase, filiaisBase, vendasEquipeOutrasFiliais] = await Promise.all([
      loadVendasAdmin(dataIni, dataFim),
      loadVendasOutrasFiliais(dataIni, dataFim),
      loadVendasEquipeEmOutrasFiliais(dataIni, dataFim),
    ]);

    const vendaIds = [...vendasBase, ...vendasEquipeOutrasFiliais].map(v => v.id).filter(Boolean);
    const adicionaisPorVenda = await loadAdicionaisPorVendas(vendaIds);

    let linhas = [];
    vendasBase.forEach(v => {
      const dataStr = dataLocalStr(v.data_venda);
      if (!dataNoPeriodo(v.data_venda, dataIni, dataFim)) return;
      const vend = (_cache.vendedores || []).find(x => x.id === v.vendedor_id);
      const plano = (_cache.planos || []).find(p => p.id === v.plano_id);
      const adicionais = adicionaisPorVenda[v.id] || [];
      linhas.push({
        tipoLinha: v.fora_filial === true ? 'fora_filial' : 'normal',
        id: v.id,
        data: dataStr,
        hora: extrairHoraRelatorio(v.data_venda),
        vendedorId: v.vendedor_id,
        vendedorSlug: vend?.slug || v.vendedores?.slug || null,
        vendedorNome: vend?.nome || v.vendedores?.nome || '—',
        vendedorTipo: vend?.tipo || null,
        cliente: v.cliente || extrairClienteDeObservacao(v.observacao) || null,
        planoId: v.plano_id,
        planoNome: plano?.nome || v.planos?.nome || '—',
        velocidade: plano?.velocidade_mb || null,
        valorPlano: Number(v.valor_plano || 0),
        adicionaisNomes: adicionais.map(a => a.nome),
        valorAdicionais: Number(v.valor_adicionais || 0),
        valorTotal: Number(v.valor_total || (Number(v.valor_plano || 0) + Number(v.valor_adicionais || 0))),
        foraFilial: v.fora_filial === true,
        filialOrigem: null,
        observacao: v.observacao || null,
      });
    });
    (vendasEquipeOutrasFiliais || []).forEach(v => {
      if (!dataNoPeriodo(v.data_venda, dataIni, dataFim)) return;
      const vend = (_cache.vendedores || []).find(x => x.id === v.vendedor_id);
      const plano = (_cache.planos || []).find(p => p.id === v.plano_id);
      const adicionais = adicionaisPorVenda[v.id] || [];
      linhas.push({
        tipoLinha: 'origem_outra_filial',
        id: v.id,
        data: dataLocalStr(v.data_venda),
        hora: extrairHoraRelatorio(v.data_venda),
        vendedorId: v.vendedor_id,
        vendedorSlug: vend?.slug || v.vendedores?.slug || null,
        vendedorNome: vend?.nome || v.vendedores?.nome || '—',
        vendedorTipo: vend?.tipo || null,
        cliente: v.cliente || extrairClienteDeObservacao(v.observacao) || null,
        planoId: v.plano_id,
        planoNome: plano?.nome || v.planos?.nome || '—',
        velocidade: plano?.velocidade_mb || null,
        valorPlano: Number(v.valor_plano || 0),
        adicionaisNomes: adicionais.map(a => a.nome),
        valorAdicionais: Number(v.valor_adicionais || 0),
        valorTotal: Number(v.valor_total || (Number(v.valor_plano || 0) + Number(v.valor_adicionais || 0))),
        foraFilial: false,
        filialOrigem: window.FILIAL_ATUAL?.nome || 'Nossa filial',
        filialDestinoId: v.filial_destino_id,
        filialDestino: (_cache.filiais || []).find(f => Number(f.id) === Number(v.filial_destino_id))?.nome || 'outra filial',
        observacao: v.observacao || null,
        // Conta regional só consulta vendas da própria equipe destinadas a
        // outra filial; o superadministrador pode excluí-las pela RLS global.
        somenteLeitura: !ehSuperAdminAtual(),
      });
    });
    (filiaisBase || []).forEach(v => {
      const dataStr = dataLocalStr(v.data_venda);
      if (!dataNoPeriodo(v.data_venda, dataIni, dataFim)) return;
      const planoFilial = (_cache.planos || []).find(p => p.id === v.plano_id);
      linhas.push({
        tipoLinha: 'outra_filial',
        id: v.id,
        data: dataStr,
        hora: extrairHoraRelatorio(v.data_venda),
        vendedorId: null,
        vendedorNome: null,
        vendedorTipo: null,
        cliente: null,
        planoId: v.plano_id,
        planoNome: v.plano_nome || planoFilial?.nome || '—',
        velocidade: planoFilial?.velocidade_mb || null,
        valorPlano: Number(v.valor_unitario || 0) * Number(v.quantidade || 1),
        adicionaisNomes: [],
        valorAdicionais: 0,
        valorTotal: Number(v.valor_total || 0),
        foraFilial: false,
        filialOrigem: v.filial_nome || '—',
        observacao: null,
      });
    });

    linhas = linhas.filter(l => {
      if (!incluirVendasEquipeOutrasFiliais && l.tipoLinha === 'origem_outra_filial') return false;
      if (vendedorId && String(l.vendedorId) !== vendedorId && l.vendedorSlug !== vendedorSlug) return false;
      if (tipoVendedor && l.vendedorTipo !== tipoVendedor) return false;
      if (planoId && String(l.planoId) !== planoId) return false;
      if (tipoVenda === 'outra_filial' && l.tipoLinha !== 'outra_filial' && l.tipoLinha !== 'origem_outra_filial') return false;
      if (tipoVenda && tipoVenda !== 'outra_filial' && l.tipoLinha !== tipoVenda) return false;
      return true;
    });

    linhas.sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));

    _relatorioState.linhas = linhas;
    _relatorioState.paginaAtual = 1;
    renderRelatorioIndicadores(linhas);
    renderRelatorioTabela();
  } catch (err) {
    console.error('[aplicarFiltrosRelatorio]', err);
    showToast('Não foi possível carregar o relatório.', 'error');
  }
}

function renderRelatorioIndicadores(linhas) {
  const totalVendas = linhas.length; // adicionais nunca contam como venda principal
  const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const ticketMedio = totalVendas ? valorTotal / totalVendas : 0;
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal' || l.tipoLinha === 'origem_outra_filial').length;
  const vendasForaFilial = linhas.filter(l => l.tipoLinha === 'fora_filial').length;
  const vendasOutrasFiliais = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const vendasEquipeOutrasFiliais = linhas.filter(l => l.tipoLinha === 'origem_outra_filial').length;
  const fmt = n => 'R$ ' + Number(n).toFixed(2).replace('.', ',');

  const cards = [
    { label: 'Total de Vendas', valor: totalVendas },
    { label: 'Valor Total', valor: fmt(valorTotal) },
    { label: 'Ticket Médio', valor: fmt(ticketMedio) },
    { label: 'Vendas da Equipe', valor: vendasEquipe },
    { label: 'Fora da Filial', valor: vendasForaFilial },
    { label: 'Outras Filiais', valor: vendasOutrasFiliais },
    { label: 'Equipe em outras filiais', valor: vendasEquipeOutrasFiliais },
  ];
  const wrap = document.getElementById('rel-indicadores');
  if (wrap) wrap.innerHTML = cards.map(c => `
    <div class="adm-stat-card"><div class="label">${c.label}</div><div class="value" style="font-size:1.25rem;">${c.valor}</div></div>
  `).join('');
}

function renderRelatorioTabela() {
  const { linhas, paginaAtual, porPagina } = _relatorioState;
  const totalPaginas = Math.max(1, Math.ceil(linhas.length / porPagina));
  const pagina = Math.min(Math.max(1, paginaAtual), totalPaginas);
  _relatorioState.paginaAtual = pagina;
  const inicio = (pagina - 1) * porPagina;
  const pageItems = linhas.slice(inicio, inicio + porPagina);

  const tbody = document.getElementById('rel-tabela-body');
  if (tbody) {
    tbody.innerHTML = pageItems.length ? pageItems.map(l => {
      const dataFmt = l.data ? l.data.split('-').reverse().join('/') : '—';
      const veloc = l.velocidade ? (l.velocidade + ' Mbps') : '—';
      const adicionaisTxt = l.adicionaisNomes.length ? l.adicionaisNomes.join(', ') : '—';
      const valorFmt = 'R$ ' + l.valorTotal.toFixed(2).replace('.', ',');
      let origemTxt, vendedorTxt, tipoTxt;
      if (l.tipoLinha === 'outra_filial') {
        origemTxt = `<span class="adm-inline-icon"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-building"></use></svg>${l.filialOrigem}</span>`;
        vendedorTxt = 'Outra filial';
        tipoTxt = '—';
      } else if (l.tipoLinha === 'origem_outra_filial') {
        origemTxt = `<span class="adm-inline-icon"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-building"></use></svg>Destino: ${escapeHtmlText(l.filialDestino)}</span>`;
        vendedorTxt = l.vendedorNome;
        tipoTxt = l.vendedorTipo === 'interno' ? 'Interno' : (l.vendedorTipo === 'externo' ? 'Externo' : '—');
      } else {
        origemTxt = l.foraFilial
          ? '<span class="adm-inline-icon"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-map-pin"></use></svg>Fora da filial</span>'
          : '<span class="adm-inline-icon"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-building"></use></svg>Nossa filial</span>';
        vendedorTxt = l.vendedorNome;
        tipoTxt = l.vendedorTipo === 'interno' ? 'Interno' : (l.vendedorTipo === 'externo' ? 'Externo' : '—');
      }
      const acoesTxt = l.somenteLeitura ? '<span class="adm-inline-status" title="A exclusão é feita pela filial de destino.">Somente leitura</span>' : `<button type="button" class="adm-btn-excluir" onclick="handleExcluirVenda('${l.id}', '${l.tipoLinha}')" title="Excluir esta venda" aria-label="Excluir esta venda"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-trash"></use></svg></button>`;
      const selecionada = _relatorioState.selecionadas.has(chaveVendaRelatorio(l));
      return `<tr>
        <td><input type="checkbox" class="rel-venda-selecao" data-venda-id="${escapeHtmlText(String(l.id))}" data-venda-tipo="${escapeHtmlText(l.tipoLinha)}" aria-label="Selecionar venda de ${escapeHtmlText(l.cliente || l.vendedorNome || 'cliente')}" ${selecionada ? 'checked' : ''} ${l.somenteLeitura ? 'disabled title="A exclusão é feita pela filial de destino."' : ''}></td>
        <td>${dataFmt}</td><td>${l.hora || '—'}</td><td>${vendedorTxt}</td><td>${tipoTxt}</td>
        <td>${l.cliente || '—'}</td><td>${l.planoNome}</td><td>${veloc}</td>
        <td>${adicionaisTxt}</td><td><strong>${valorFmt}</strong></td><td>${origemTxt}</td>
        <td>${acoesTxt}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);">Nenhuma venda encontrada para os filtros selecionados.</td></tr>';
    tbody.querySelectorAll('.rel-venda-selecao').forEach(input => input.addEventListener('change', () => {
      const linha = _relatorioState.linhas.find(item => item.id === input.dataset.vendaId && item.tipoLinha === input.dataset.vendaTipo);
      if (!linha) return;
      const chave = chaveVendaRelatorio(linha);
      if (input.checked) _relatorioState.selecionadas.add(chave);
      else _relatorioState.selecionadas.delete(chave);
      atualizarAcoesSelecaoRelatorio();
    }));
  }
  atualizarAcoesSelecaoRelatorio();

  const contagem = document.getElementById('rel-contagem');
  if (contagem) contagem.textContent = `${linhas.length} venda${linhas.length === 1 ? '' : 's'} encontrada${linhas.length === 1 ? '' : 's'}`;

  const pagWrap = document.getElementById('rel-paginacao');
  if (pagWrap) {
    if (linhas.length <= porPagina) {
      pagWrap.innerHTML = '';
    } else {
      pagWrap.innerHTML = `
        <button type="button" class="adm-btn adm-btn-secondary" style="width:auto;padding:8px 16px;" onclick="mudarPaginaRelatorio(-1)" ${pagina <= 1 ? 'disabled' : ''}>← Anterior</button>
        <span style="font-size:0.82rem;color:var(--text-muted);">Página ${pagina} de ${totalPaginas}</span>
        <button type="button" class="adm-btn adm-btn-secondary" style="width:auto;padding:8px 16px;" onclick="mudarPaginaRelatorio(1)" ${pagina >= totalPaginas ? 'disabled' : ''}>Próxima →</button>
      `;
    }
  }
}

function mudarPaginaRelatorio(direcao) {
  _relatorioState.paginaAtual += direcao;
  renderRelatorioTabela();
}

function calcularResumosRelatorio(linhas) {
  const porVendedor = {};
  linhas.filter(l => l.tipoLinha !== 'outra_filial').forEach(l => {
    const k = l.vendedorNome;
    if (!porVendedor[k]) porVendedor[k] = { vendedor: k, tipo: l.vendedorTipo === 'interno' ? 'Interno' : 'Externo', vendas: 0, valor: 0 };
    porVendedor[k].vendas++;
    porVendedor[k].valor += l.valorTotal;
  });
  const porPlano = {};
  linhas.forEach(l => {
    const k = l.planoNome + '|' + (l.velocidade || '');
    if (!porPlano[k]) porPlano[k] = { plano: l.planoNome, velocidade: l.velocidade ? l.velocidade + ' Mbps' : '—', vendas: 0, valor: 0 };
    porPlano[k].vendas++;
    porPlano[k].valor += l.valorTotal;
  });
  const porAdicional = {};
  linhas.forEach(l => l.adicionaisNomes.forEach(nome => {
    if (!porAdicional[nome]) porAdicional[nome] = { adicional: nome, quantidade: 0 };
    porAdicional[nome].quantidade++;
  }));
  return { porVendedor: Object.values(porVendedor), porPlano: Object.values(porPlano), porAdicional: Object.values(porAdicional) };
}

function obterFiltrosAplicadosTexto() {
  const vendedorSel = document.getElementById('rel-vendedor');
  const planoSel = document.getElementById('rel-plano');
  return [
    vendedorSel.value ? 'Vendedor: ' + vendedorSel.options[vendedorSel.selectedIndex].text : null,
    document.getElementById('rel-tipo-vendedor').value ? 'Tipo: ' + document.getElementById('rel-tipo-vendedor').options[document.getElementById('rel-tipo-vendedor').selectedIndex].text : null,
    planoSel.value ? 'Plano: ' + planoSel.options[planoSel.selectedIndex].text : null,
    document.getElementById('rel-tipo-venda').value ? 'Tipo de venda: ' + document.getElementById('rel-tipo-venda').options[document.getElementById('rel-tipo-venda').selectedIndex].text : null,
    'Vendas da equipe para outras filiais: ' + (document.getElementById('rel-vendas-equipe-outras-filiais').value === 'excluir' ? 'excluídas' : 'incluídas'),
  ].filter(Boolean).join(' · ') || 'Nenhum filtro adicional';
}

// Logo colorido da Uni Internet (o mesmo do cabeçalho do site), em base64,
// usado nos relatórios exportados em Excel para ficar com a cara da empresa.
const RELATORIO_EXCEL_LOGO = document.querySelector('.header-logo .logo-light').src; // mesma imagem do cabeçalho (1 cópia só)
// logos dos cards de imagem (status, destaque, celebração): usam a imagem do cabeçalho
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('img[data-logo]').forEach(img => {
    const fonte = document.querySelector('.header-logo .logo-' + img.dataset.logo);
    if (fonte) img.src = fonte.src;
  });
});

// ── Helpers de estilo do Excel (cores da marca, bordas, preenchimentos) ──
// v2: visual mais sóbrio — sem emoji nos títulos, degradê de verdade na
// barra do topo (em vez de cor sólida) e o "Resumo" em blocos de destaque
// com uma tarja lateral colorida, em vez de lista simples.
const EXCEL_COR_TEAL = 'FF21D9BF';
const EXCEL_COR_AZUL = 'FF2D5FFF';
const EXCEL_COR_TEAL_ESCURO = 'FF14A896';
const EXCEL_COR_AZUL_ESCURO = 'FF1D3FB8';
const EXCEL_COR_TEXTO = 'FF1A1D27';
const EXCEL_COR_TEXTO_MUTED = 'FF6B7280';
const EXCEL_COR_FAIXA_CLARA = 'FFF7F8FC';
const EXCEL_COR_BORDA = 'FFE3E7EF';
const EXCEL_COR_TEAL_TINT = 'FFEAFBF8';
const EXCEL_COR_AZUL_TINT = 'FFECF1FF';
// degradê teal → azul (4 tons), usado na barrinha do topo e nas laterais dos cards
const EXCEL_GRADIENTE = ['FF21D9BF', 'FF3BC9D6', 'FF2E86F0', 'FF2D5FFF'];

function excelFill(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb } }; }
function excelBorda(cor) {
  const b = { style: 'thin', color: { argb: cor || EXCEL_COR_BORDA } };
  return { top: b, left: b, bottom: b, right: b };
}
// Título de seção: faixa colorida mesclada de A até D, com uma borda inferior
// um tom mais escuro (dá profundidade — evita o efeito "bloco chapado").
function excelTituloSecao(ws, linha, texto, corFundo, corEscura) {
  ws.mergeCells(linha, 1, linha, 4);
  const cel = ws.getCell(linha, 1);
  cel.value = texto.toUpperCase();
  cel.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  cel.fill = excelFill(corFundo);
  cel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  cel.border = { bottom: { style: 'medium', color: { argb: corEscura || corFundo } } };
  ws.getRow(linha).height = 24;
}
// Igual à anterior, mas mesclando a faixa por N colunas (usado na aba "Vendas",
// que tem mais de 4 colunas) — título fixo "DETALHAMENTO DAS VENDAS".
function excelTituloFaixaCompleta(ws, numColunas) {
  ws.mergeCells(1, 1, 1, numColunas);
  const cel = ws.getCell(1, 1);
  cel.value = 'DETALHAMENTO DAS VENDAS';
  cel.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
  cel.fill = excelFill(EXCEL_COR_TEXTO);
  cel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 26;
}
// Cabeçalho de tabela: uma linha com cada coluna preenchida com a mesma cor.
function excelCabecalhoTabela(ws, linha, colunas, corFundo) {
  colunas.forEach((texto, i) => {
    const cel = ws.getCell(linha, i + 1);
    cel.value = texto;
    cel.font = { bold: true, size: 10.5, color: { argb: 'FFFFFFFF' }, name: 'Arial' };
    cel.fill = excelFill(corFundo);
    cel.border = excelBorda();
    cel.alignment = { vertical: 'middle', horizontal: 'left' };
  });
  ws.getRow(linha).height = 20;
}
// Uma linha de dados da tabela — zebra (faixa clara nas linhas pares) + bordas finas.
function excelLinhaDados(ws, linha, valores, zebra) {
  valores.forEach((v, i) => {
    const cel = ws.getCell(linha, i + 1);
    cel.value = v;
    cel.font = { size: 10.5, color: { argb: EXCEL_COR_TEXTO }, name: 'Arial' };
    cel.border = excelBorda();
    if (zebra) cel.fill = excelFill(EXCEL_COR_FAIXA_CLARA);
  });
  ws.getRow(linha).height = 19;
}
// Card de KPI do "Resumo": rótulo em maiúsculas discreto + valor grande em
// destaque, com uma tarja colorida na borda esquerda (o "acento" do card) e
// um tom de fundo bem clarinho — em vez da lista simples de antes.
function excelKpiCard(ws, linha, label, valor, formato, corAccent, corTint) {
  const celLabel = ws.getCell(linha, 1);
  celLabel.value = label.toUpperCase();
  celLabel.font = { bold: true, size: 9, color: { argb: EXCEL_COR_TEXTO_MUTED }, name: 'Arial' };
  celLabel.fill = excelFill(corTint);
  celLabel.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  celLabel.border = { ...excelBorda(), left: { style: 'medium', color: { argb: corAccent } } };

  const celValor = ws.getCell(linha, 2);
  celValor.value = valor;
  celValor.numFmt = formato;
  celValor.font = { bold: true, size: 13, color: { argb: EXCEL_COR_TEXTO }, name: 'Arial' };
  celValor.fill = excelFill(corTint);
  celValor.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 };
  celValor.border = excelBorda();

  ws.getRow(linha).height = 26;
}
// Moldura externa: desenha uma borda ao redor de todo o bloco (rowStart..rowEnd,
// colStart..colEnd) SEM apagar as bordas internas já existentes em cada célula
// — só acrescenta o lado que fica na borda externa do retângulo.
function excelBordaExterna(ws, r1, r2, c1, c2, cor) {
  const lado = { style: 'medium', color: { argb: cor } };
  for (let c = c1; c <= c2; c++) {
    const topCell = ws.getCell(r1, c);
    topCell.border = { ...(topCell.border || {}), top: lado };
    const botCell = ws.getCell(r2, c);
    botCell.border = { ...(botCell.border || {}), bottom: lado };
  }
  for (let r = r1; r <= r2; r++) {
    const leftCell = ws.getCell(r, c1);
    leftCell.border = { ...(leftCell.border || {}), left: lado };
    const rightCell = ws.getCell(r, c2);
    rightCell.border = { ...(rightCell.border || {}), right: lado };
  }
}

async function exportarRelatorioExcel() {
  if (typeof ExcelJS === 'undefined') { carregarLibsAdmin(); showToast('Biblioteca de Excel ainda carregando — aguarde alguns segundos e tente de novo.', 'error'); return; }
  const linhas = _relatorioState.linhas;
  if (!linhas.length) { showToast('Nenhuma venda para exportar.', 'warning'); return; }

  // Opção "🙈 Ocultar valores financeiros": quando marcada, o relatório
  // exportado (Excel/PDF) some com R$ Valor Total, Ticket Médio e as
  // colunas de valor das tabelas — útil pra compartilhar só os números
  // de quantidade/desempenho sem expor os valores em dinheiro.
  const ocultarFinanceiro = !!document.getElementById('rel-ocultar-financeiro')?.checked;

  const totalVendas = linhas.length;
  const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const ticketMedio = totalVendas ? valorTotal / totalVendas : 0;
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal' || l.tipoLinha === 'origem_outra_filial').length;
  const vendasForaFilial = linhas.filter(l => l.tipoLinha === 'fora_filial').length;
  const vendasOutrasFiliais = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const vendasEquipeOutrasFiliais = linhas.filter(l => l.tipoLinha === 'origem_outra_filial').length;
  const { porVendedor, porPlano, porAdicional } = calcularResumosRelatorio(linhas);
  const periodoTxt = document.getElementById('rel-data-ini').value.split('-').reverse().join('/') + ' a ' + document.getElementById('rel-data-fim').value.split('-').reverse().join('/');
  const geradoEm = new Date().toLocaleString('pt-BR');
  const fmtMoeda = '"R$" #,##0.00';

  const wb = new ExcelJS.Workbook();
  wb.creator = 'UNI Internet';
  wb.created = new Date();

  // ============================================================
  // ABA "Resumo" — cabeçalho com logo, KPIs e tabelas resumidas
  // ============================================================
  const ws = wb.addWorksheet('Resumo', {
    views: [{ showGridLines: false }],
  });
  ws.columns = [{ width: 30 }, { width: 20 }, { width: 14 }, { width: 16 }];

  // Logo + título + metadados do período (linhas 1-4)
  const logoId = wb.addImage({ base64: RELATORIO_EXCEL_LOGO, extension: 'png' });
  ws.addImage(logoId, { tl: { col: 0, row: 0.1 }, ext: { width: 108, height: 72 } });
  ws.mergeCells('B1:D1');
  ws.getCell('B1').value = 'RELATÓRIO DE VENDAS';
  ws.getCell('B1').font = { bold: true, size: 18, color: { argb: EXCEL_COR_TEXTO }, name: 'Arial' };
  ws.mergeCells('B2:D2');
  ws.getCell('B2').value = `Período: ${periodoTxt}`;
  ws.getCell('B2').font = { size: 10, color: { argb: EXCEL_COR_TEXTO_MUTED }, name: 'Arial' };
  ws.mergeCells('B3:D3');
  ws.getCell('B3').value = `Filtros: ${obterFiltrosAplicadosTexto()}`;
  ws.getCell('B3').font = { size: 10, color: { argb: EXCEL_COR_TEXTO_MUTED }, name: 'Arial' };
  ws.mergeCells('B4:D4');
  ws.getCell('B4').value = `Gerado em: ${geradoEm}`;
  ws.getCell('B4').font = { size: 9, italic: true, color: { argb: EXCEL_COR_TEXTO_MUTED }, name: 'Arial' };
  [1, 2, 3, 4].forEach(r => ws.getRow(r).height = 18);
  // barrinha degradê DE VERDADE (teal → azul), 4 tons em 4 células — igual
  // ao gradiente usado no logo e no modelo do PDF, em vez de uma cor sólida.
  EXCEL_GRADIENTE.forEach((cor, i) => {
    ws.getCell(5, i + 1).fill = excelFill(cor);
  });
  ws.getRow(5).height = 5;

  let linha = 7;
  excelTituloSecao(ws, linha, 'Resumo', EXCEL_COR_AZUL, EXCEL_COR_AZUL_ESCURO);
  linha += 1;
  const kpis = [
    ['Total de Vendas', totalVendas, '0', EXCEL_COR_TEAL, EXCEL_COR_TEAL_TINT],
    ...(ocultarFinanceiro ? [] : [
      ['Valor Total', valorTotal, fmtMoeda, EXCEL_COR_AZUL, EXCEL_COR_AZUL_TINT],
      ['Ticket Médio', ticketMedio, fmtMoeda, EXCEL_COR_AZUL, EXCEL_COR_AZUL_TINT],
    ]),
    ['Vendas da Equipe', vendasEquipe, '0', EXCEL_COR_TEAL, EXCEL_COR_TEAL_TINT],
    ['Equipe em outras filiais', vendasEquipeOutrasFiliais, '0', EXCEL_COR_TEAL, EXCEL_COR_TEAL_TINT],
    ['Vendas Fora da Filial', vendasForaFilial, '0', EXCEL_COR_TEAL, EXCEL_COR_TEAL_TINT],
    ['Vendas de Outras Filiais', vendasOutrasFiliais, '0', EXCEL_COR_TEAL, EXCEL_COR_TEAL_TINT],
  ];
  kpis.forEach(([label, valor, formato, corAccent, corTint]) => {
    excelKpiCard(ws, linha, label, valor, formato, corAccent, corTint);
    linha++;
  });
  linha += 1;

  excelTituloSecao(ws, linha, 'Vendas por Vendedor', EXCEL_COR_TEAL, EXCEL_COR_TEAL_ESCURO);
  linha += 1;
  excelCabecalhoTabela(ws, linha, ocultarFinanceiro ? ['Vendedor', 'Tipo', 'Vendas'] : ['Vendedor', 'Tipo', 'Vendas', 'Valor'], EXCEL_COR_TEAL);
  linha += 1;
  porVendedor.forEach((v, i) => {
    const dados = ocultarFinanceiro ? [v.vendedor, v.tipo, v.vendas] : [v.vendedor, v.tipo, v.vendas, v.valor];
    excelLinhaDados(ws, linha, dados, i % 2 === 1);
    if (!ocultarFinanceiro) ws.getCell(linha, 4).numFmt = fmtMoeda;
    linha++;
  });
  linha += 1;

  excelTituloSecao(ws, linha, 'Vendas por Plano', EXCEL_COR_AZUL, EXCEL_COR_AZUL_ESCURO);
  linha += 1;
  excelCabecalhoTabela(ws, linha, ocultarFinanceiro ? ['Plano', 'Velocidade', 'Vendas'] : ['Plano', 'Velocidade', 'Vendas', 'Valor'], EXCEL_COR_AZUL);
  linha += 1;
  porPlano.forEach((v, i) => {
    const dados = ocultarFinanceiro ? [v.plano, v.velocidade, v.vendas] : [v.plano, v.velocidade, v.vendas, v.valor];
    excelLinhaDados(ws, linha, dados, i % 2 === 1);
    if (!ocultarFinanceiro) ws.getCell(linha, 4).numFmt = fmtMoeda;
    linha++;
  });
  linha += 1;

  if (porAdicional.length) {
    excelTituloSecao(ws, linha, 'Adicionais', EXCEL_COR_TEAL, EXCEL_COR_TEAL_ESCURO);
    linha += 1;
    excelCabecalhoTabela(ws, linha, ['Adicional', 'Quantidade', '', ''], EXCEL_COR_TEAL);
    linha += 1;
    porAdicional.forEach((v, i) => {
      excelLinhaDados(ws, linha, [v.adicional, v.quantidade], i % 2 === 1);
      linha++;
    });
  }

  // Rodapé: barrinha degradê espelhando a do topo + assinatura discreta —
  // fecha o "documento" visualmente em vez de a tabela terminar no vazio.
  linha += 1;
  EXCEL_GRADIENTE.forEach((cor, i) => { ws.getCell(linha, i + 1).fill = excelFill(cor); });
  ws.getRow(linha).height = 5;
  linha += 1;
  ws.mergeCells(linha, 1, linha, 4);
  ws.getCell(linha, 1).value = 'UNI Internet  ·  Relatório gerado automaticamente pelo sistema de Ranking de Vendas';
  ws.getCell(linha, 1).font = { size: 8, italic: true, color: { argb: EXCEL_COR_TEXTO_MUTED }, name: 'Arial' };
  ws.getCell(linha, 1).alignment = { horizontal: 'center' };
  ws.getRow(linha).height = 18;

  // Moldura ao redor do relatório inteiro (linha 1 até o rodapé) — evita o
  // efeito "tabelas soltas no vazio" e dá a sensação de um documento fechado.
  excelBordaExterna(ws, 1, linha, 1, 4, EXCEL_COR_AZUL_ESCURO);

  // ============================================================
  // ABA "Vendas" — detalhamento linha a linha, com filtro e freeze
  // ============================================================
  const wsDet = wb.addWorksheet('Vendas', {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
  });
  const colunasDetTodas = [
    { header: 'ID', key: 'id', width: 10 },
    { header: 'Data', key: 'data', width: 12 },
    { header: 'Hora', key: 'hora', width: 8 },
    { header: 'Vendedor', key: 'vendedor', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 10 },
    { header: 'Cliente', key: 'cliente', width: 18 },
    { header: 'Plano', key: 'plano', width: 22 },
    { header: 'Velocidade', key: 'velocidade', width: 12 },
    { header: 'Valor do Plano', key: 'valorPlano', width: 14, financeiro: true },
    { header: 'Adicionais', key: 'adicionais', width: 26 },
    { header: 'Valor dos Adicionais', key: 'valorAdicionais', width: 16, financeiro: true },
    { header: 'Valor Total', key: 'valorTotal', width: 14, financeiro: true },
    { header: 'Fora da Filial', key: 'foraFilial', width: 12 },
    { header: 'Origem', key: 'origem', width: 14 },
    { header: 'Filial de Origem', key: 'filialOrigem', width: 16 },
    { header: 'Observação', key: 'observacao', width: 26 },
  ];
  // Com "Ocultar valores financeiros" marcado, tiramos as 3 colunas de
  // valor em R$ da planilha de detalhamento também.
  const colunasDet = ocultarFinanceiro ? colunasDetTodas.filter(c => !c.financeiro) : colunasDetTodas;
  excelTituloFaixaCompleta(wsDet, colunasDet.length);
  excelCabecalhoTabela(wsDet, 2, colunasDet.map(c => c.header), EXCEL_COR_AZUL);
  colunasDet.forEach((c, i) => { wsDet.getColumn(i + 1).width = c.width; });

  linhas.forEach((l, i) => {
    const valoresTodos = [
      { v: l.id || '—' },
      { v: l.data ? l.data.split('-').reverse().join('/') : '—' },
      { v: l.hora || '—' },
      { v: l.tipoLinha === 'outra_filial' ? 'Outra filial' : l.vendedorNome },
      { v: l.tipoLinha === 'outra_filial' ? '—' : (l.vendedorTipo === 'interno' ? 'Interno' : l.vendedorTipo === 'externo' ? 'Externo' : '—') },
      { v: l.cliente || '—' },
      { v: l.planoNome },
      { v: l.velocidade ? l.velocidade + ' Mbps' : '—' },
      { v: l.valorPlano, financeiro: true },
      { v: l.adicionaisNomes.join(', ') || '—' },
      { v: l.valorAdicionais, financeiro: true },
      { v: l.valorTotal, financeiro: true },
      { v: l.foraFilial ? 'Sim' : 'Não' },
      { v: l.tipoLinha === 'outra_filial' ? 'Outra filial' : (l.tipoLinha === 'origem_outra_filial' ? `Nossa equipe → ${l.filialDestino}` : (l.foraFilial ? 'Fora da filial' : 'Nossa filial')) },
      { v: l.filialOrigem || '—' },
      { v: l.observacao || '—' },
    ];
    const valores = (ocultarFinanceiro ? valoresTodos.filter(x => !x.financeiro) : valoresTodos).map(x => x.v);
    const rowNum = i + 3;
    excelLinhaDados(wsDet, rowNum, valores, i % 2 === 1);
    colunasDet.forEach((c, idx) => { if (c.financeiro) wsDet.getCell(rowNum, idx + 1).numFmt = fmtMoeda; });
  });
  wsDet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: colunasDet.length } };
  // Moldura ao redor de toda a tabela de detalhamento (mesmo tratamento da aba Resumo).
  excelBordaExterna(wsDet, 1, linhas.length + 2, 1, colunasDet.length, EXCEL_COR_AZUL_ESCURO);

  const hoje = new Date().toISOString().split('T')[0];
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Relatorio_Vendas_${hoje}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  showToast('Excel exportado com sucesso!', 'success');
}

// Imagem de fundo do "Relatório de Vendas" em PDF — extraída do modelo
// oficial (Canva) enviado pelo time: logo Uni no topo, barra degradê
// (teal → azul) no topo e no rodapé, e marca d'água "uni" ao centro.
// Fica embutida em base64 para o PDF funcionar 100% no navegador,
// sem depender de nenhum arquivo externo.
const RELATORIO_PDF_BG = "data:image/png;base64,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";

// Desenha o fundo do modelo (logo + barras + marca d'água) na página
// atual do doc. Precisa ser chamada ANTES de qualquer texto/tabela
// ser desenhado na página (senão o fundo cobre o conteúdo).
function desenharFundoRelatorioPDF(doc) {
  doc.addImage(RELATORIO_PDF_BG, 'PNG', 0, 0, 210, 297);
  // A arte original tem uma marca d'água grande no miolo da página. Ela
  // fica atrás das tabelas e reduz o contraste na impressão; preservamos
  // o cabeçalho e o rodapé coloridos, deixando a área de leitura limpa.
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 72, 210, 205, 'F');
}

function exportarRelatorioPDF() {
  if (typeof window.jspdf === 'undefined') { carregarLibsAdmin(); showToast('Biblioteca de PDF ainda carregando — aguarde alguns segundos e tente de novo.', 'error'); return; }
  const linhas = _relatorioState.linhas;
  if (!linhas.length) { showToast('Nenhuma venda para exportar.', 'warning'); return; }

  // Opção "🙈 Ocultar valores financeiros" (mesma do Excel): quando
  // marcada, tira R$ Valor Total, Ticket Médio e as colunas de valor
  // das tabelas do PDF também.
  const ocultarFinanceiro = !!document.getElementById('rel-ocultar-financeiro')?.checked;

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  // Cores extraídas do modelo oficial (mesmo degradê teal → azul do logo
  // e das barras do modelo em PDF enviado pelo time).
  const corAccent = [39, 217, 191];   // teal
  const corAccent2 = [45, 95, 255];   // azul

  const periodoTxt = document.getElementById('rel-data-ini').value.split('-').reverse().join('/') + ' a ' + document.getElementById('rel-data-fim').value.split('-').reverse().join('/');
  const geradoEm = new Date().toLocaleString('pt-BR');

  // Fundo do modelo (logo Uni + barra degradê no topo, marca d'água ao
  // centro, barra degradê no rodapé) na primeira página.
  desenharFundoRelatorioPDF(doc);

  doc.setTextColor(30, 33, 45);
  doc.setFontSize(16); doc.setFont(undefined, 'bold');
  doc.text('Relatório de Vendas', 14, 50);

  doc.setTextColor(90, 95, 110);
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text(`Período: ${periodoTxt}`, 14, 58);
  doc.text(`Gerado em: ${geradoEm}`, 14, 63);
  doc.text(`Filtros: ${obterFiltrosAplicadosTexto()}`, 14, 68);

  const totalVendas = linhas.length;
  const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const ticketMedio = totalVendas ? valorTotal / totalVendas : 0;
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal' || l.tipoLinha === 'origem_outra_filial').length;
  const vendasOutras = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const vendasEquipeOutrasFiliais = linhas.filter(l => l.tipoLinha === 'origem_outra_filial').length;
  const { porVendedor, porPlano, porAdicional } = calcularResumosRelatorio(linhas);
  const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');

  let y = 80;
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('RESUMO', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: corAccent2 },
    head: [ocultarFinanceiro
      ? ['Total de Vendas', 'Vendas da Equipe', 'Equipe em outras filiais', 'Outras Filiais']
      : ['Total de Vendas', 'Valor Total', 'Ticket Médio', 'Vendas da Equipe', 'Equipe em outras filiais', 'Outras Filiais']],
    body: [ocultarFinanceiro
      ? [totalVendas, vendasEquipe, vendasEquipeOutrasFiliais, vendasOutras]
      : [totalVendas, fmt(valorTotal), fmt(ticketMedio), vendasEquipe, vendasEquipeOutrasFiliais, vendasOutras]],
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('VENDAS POR VENDEDOR', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'striped', styles: { fontSize: 8.5 }, headStyles: { fillColor: corAccent },
    head: [ocultarFinanceiro ? ['Vendedor', 'Tipo', 'Vendas'] : ['Vendedor', 'Tipo', 'Vendas', 'Valor']],
    body: porVendedor.map(v => ocultarFinanceiro ? [v.vendedor, v.tipo, v.vendas] : [v.vendedor, v.tipo, v.vendas, fmt(v.valor)]),
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (y > 250) { doc.addPage(); desenharFundoRelatorioPDF(doc); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('VENDAS POR PLANO', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'striped', styles: { fontSize: 8.5 }, headStyles: { fillColor: corAccent },
    head: [ocultarFinanceiro ? ['Plano', 'Velocidade', 'Vendas'] : ['Plano', 'Velocidade', 'Vendas', 'Valor']],
    body: porPlano.map(v => ocultarFinanceiro ? [v.plano, v.velocidade, v.vendas] : [v.plano, v.velocidade, v.vendas, fmt(v.valor)]),
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (porAdicional.length) {
    if (y > 250) { doc.addPage(); desenharFundoRelatorioPDF(doc); y = 20; }
    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
    doc.text('ADICIONAIS', 14, y); y += 6;
    doc.autoTable({
      startY: y, theme: 'striped', styles: { fontSize: 8.5 }, headStyles: { fillColor: corAccent },
      head: [['Adicional', 'Quantidade']],
      body: porAdicional.map(v => [v.adicional, v.quantidade]),
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 10;
  }

  // O detalhamento sempre começa em uma página própria para manter a
  // tabela na mesma posição, mesmo quando o resumo ocupa mais ou menos espaço.
  doc.addPage();
  desenharFundoRelatorioPDF(doc);
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, 210, 45, 'F');
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('DETALHAMENTO DAS VENDAS', 14, 17);
  // Tabela de detalhamento pode quebrar em várias páginas sozinha
  // (linhas demais para caber na página atual). O jspdf-autotable
  // chama willDrawPage a cada página nova ANTES de desenhar o
  // cabeçalho/linhas daquela página — por isso usamos esse hook (e
  // não o didDrawPage, que só dispara DEPOIS que a página já foi
  // desenhada: usá-lo aqui pintava o fundo em cima das linhas recém
  // desenhadas e "sumia" com elas, que era exatamente o bug relatado
  // — a página 2 em diante ficava só com o fundo, sem nenhuma linha).
  // A 1ª página da tabela já tem o fundo e o título desenhados manualmente;
  // nas continuações repetimos o mesmo cabeçalho e reservamos sua altura.
  let _primeiraPaginaDetalhamento = true;
  doc.autoTable({
    startY: 25, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: corAccent2 },
    // Larguras fixas (mm) pra cada coluna: evita que o autoTable
    // espreme a coluna "Cliente" quando outras colunas (Plano,
    // Adicionais) têm texto longo, o que fazia o nome sair cortado.
    // Sem a coluna "Total" (financeiro oculto), a largura dela é
    // redistribuída pra "Adicionais".
    columnStyles: ocultarFinanceiro ? {
      0: { cellWidth: 18 },  // Data
      1: { cellWidth: 12 },  // Hora
      2: { cellWidth: 26 },  // Vendedor
      3: { cellWidth: 30 },  // Cliente
      4: { cellWidth: 32 },  // Plano
      5: { cellWidth: 64 },  // Adicionais
    } : {
      0: { cellWidth: 18 },  // Data
      1: { cellWidth: 12 },  // Hora
      2: { cellWidth: 26 },  // Vendedor
      3: { cellWidth: 30 },  // Cliente
      4: { cellWidth: 32 },  // Plano
      5: { cellWidth: 44 },  // Adicionais
      6: { cellWidth: 20, halign: 'right' },  // Total
    },
    // Nunca divide uma linha entre duas páginas: se ela não couber
    // inteira na página atual, a linha inteira (incluindo o nome do
    // cliente) passa pra próxima página, em vez de cortar no meio.
    rowPageBreak: 'avoid',
    head: [ocultarFinanceiro
      ? ['Data', 'Hora', 'Vendedor', 'Cliente', 'Plano', 'Adicionais']
      : ['Data', 'Hora', 'Vendedor', 'Cliente', 'Plano', 'Adicionais', 'Total']],
    body: linhas.map(l => {
      const linha = [
        l.data ? l.data.split('-').reverse().join('/') : '—',
        l.hora || '—',
        l.tipoLinha === 'outra_filial' ? ('Filial: ' + l.filialOrigem) : (l.vendedorNome + (l.tipoLinha === 'origem_outra_filial' ? ` (venda para ${l.filialDestino})` : '')),
        l.cliente || '—',
        l.planoNome + (l.velocidade ? ' - ' + l.velocidade + ' Mbps' : ''),
        l.adicionaisNomes.join(', ') || '—',
      ];
      if (!ocultarFinanceiro) linha.push(fmt(l.valorTotal));
      return linha;
    }),
    margin: { left: 14, right: 14, top: 25, bottom: 20 },
    willDrawPage: () => {
      if (_primeiraPaginaDetalhamento) { _primeiraPaginaDetalhamento = false; return; }
      desenharFundoRelatorioPDF(doc);
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, 210, 45, 'F');
      doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
      doc.text('DETALHAMENTO DAS VENDAS', 14, 17);
    },
  });

  // número de página no rodapé (feito ao final, sobre todas as páginas já geradas)
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFont(undefined, 'bold'); doc.setFontSize(8); doc.setTextColor(26, 36, 62);
    doc.text(`Página ${i} de ${totalPaginas}`, 105, 290, { align: 'center' });
  }

  const hoje = new Date().toISOString().split('T')[0];
  doc.save(`Relatorio_Vendas_${hoje}.pdf`);
  showToast('PDF exportado com sucesso!', 'success');
}

// ── Saves ────────────────────────────────────────────────────────
