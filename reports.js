// ═══════════════════════════════════════════════════════════════
// REPORTS.JS — Relatório de Vendas (ADM → Relatórios)
// Filtros, tabela paginada, indicadores, export para Excel e
// PDF. exportarRelatorioPDF() usa o template visual definido
// em pdf-template.js (desenharFundoRelatorioPDF).
// ═══════════════════════════════════════════════════════════════

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
      (_cache.planos || []).map(p => `<option value="${p.id}">${p.nome} ${p.velocidade_mb} Mbps</option>`).join('');
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

  if (!dataIni || !dataFim) { showToast('Selecione o período (data inicial e final).', 'warning'); return; }

  // Reaproveita o cache do mês atual quando o período pedido já está
  // contido nele; só consulta o Supabase de novo (funções já
  // existentes) quando o período sai do que já está carregado.
  let vendasBase, filiaisBase;
  const dentroDoCache = _cache.mes && dataIni >= _cache.mes.de && dataFim <= _cache.mes.ate;
  try {
    if (dentroDoCache) {
      vendasBase = _cache.vendasMes || [];
      filiaisBase = _cache.vendasFiliais || [];
    } else {
      [vendasBase, filiaisBase] = await Promise.all([
        loadVendas(dataIni, dataFim),
        loadVendasOutrasFiliais(dataIni, dataFim),
      ]);
    }

    const vendaIds = vendasBase.map(v => v.id).filter(Boolean);
    const adicionaisPorVenda = await loadAdicionaisPorVendas(vendaIds);

    let linhas = [];
    vendasBase.forEach(v => {
      const dataStr = String(v.data_venda || '').slice(0, 10);
      if (dataStr < dataIni || dataStr > dataFim) return;
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
        cliente: v.cliente || null,
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
    (filiaisBase || []).forEach(v => {
      const dataStr = String(v.data_venda || '').slice(0, 10);
      if (dataStr < dataIni || dataStr > dataFim) return;
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
      if (vendedorId && l.vendedorId !== vendedorId && l.vendedorSlug !== vendedorSlug) return false;
      if (tipoVendedor && l.vendedorTipo !== tipoVendedor) return false;
      if (planoId && l.planoId !== planoId) return false;
      if (tipoVenda && l.tipoLinha !== tipoVenda) return false;
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
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal').length;
  const vendasForaFilial = linhas.filter(l => l.tipoLinha === 'fora_filial').length;
  const vendasOutrasFiliais = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const fmt = n => 'R$ ' + Number(n).toFixed(2).replace('.', ',');

  const cards = [
    { label: 'Total de Vendas', valor: totalVendas },
    { label: 'Valor Total', valor: fmt(valorTotal) },
    { label: 'Ticket Médio', valor: fmt(ticketMedio) },
    { label: 'Vendas da Equipe', valor: vendasEquipe },
    { label: 'Fora da Filial', valor: vendasForaFilial },
    { label: 'Outras Filiais', valor: vendasOutrasFiliais },
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
        origemTxt = `🏢 ${l.filialOrigem}`;
        vendedorTxt = 'Outra filial';
        tipoTxt = '—';
      } else {
        origemTxt = l.foraFilial ? '📍 Fora da filial' : '🏠 Nossa filial';
        vendedorTxt = l.vendedorNome;
        tipoTxt = l.vendedorTipo === 'interno' ? 'Interno' : (l.vendedorTipo === 'externo' ? 'Externo' : '—');
      }
      return `<tr>
        <td>${dataFmt}</td><td>${l.hora || '—'}</td><td>${vendedorTxt}</td><td>${tipoTxt}</td>
        <td>${l.cliente || '—'}</td><td>${l.planoNome}</td><td>${veloc}</td>
        <td>${adicionaisTxt}</td><td><strong>${valorFmt}</strong></td><td>${origemTxt}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">Nenhuma venda encontrada para os filtros selecionados.</td></tr>';
  }

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
  ].filter(Boolean).join(' · ') || 'Nenhum filtro adicional';
}

function exportarRelatorioExcel() {
  if (typeof XLSX === 'undefined') { showToast('Biblioteca de Excel não carregada.', 'error'); return; }
  const linhas = _relatorioState.linhas;
  if (!linhas.length) { showToast('Nenhuma venda para exportar.', 'warning'); return; }

  const totalVendas = linhas.length;
  const valorTotal = linhas.reduce((s, l) => s + l.valorTotal, 0);
  const ticketMedio = totalVendas ? valorTotal / totalVendas : 0;
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal').length;
  const vendasForaFilial = linhas.filter(l => l.tipoLinha === 'fora_filial').length;
  const vendasOutrasFiliais = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const { porVendedor, porPlano, porAdicional } = calcularResumosRelatorio(linhas);
  const periodoTxt = document.getElementById('rel-data-ini').value.split('-').reverse().join('/') + ' a ' + document.getElementById('rel-data-fim').value.split('-').reverse().join('/');

  const resumoRows = [
    ['RELATÓRIO DE VENDAS'],
    ['Período', periodoTxt],
    ['Filtros', obterFiltrosAplicadosTexto()],
    [],
    ['Total de Vendas', totalVendas],
    ['Valor Total', valorTotal],
    ['Ticket Médio', ticketMedio],
    ['Vendas da Equipe', vendasEquipe],
    ['Vendas Fora da Filial', vendasForaFilial],
    ['Vendas de Outras Filiais', vendasOutrasFiliais],
    [],
    ['VENDAS POR VENDEDOR'],
    ['Vendedor', 'Tipo', 'Vendas', 'Valor'],
    ...porVendedor.map(v => [v.vendedor, v.tipo, v.vendas, v.valor]),
    [],
    ['VENDAS POR PLANO'],
    ['Plano', 'Velocidade', 'Vendas', 'Valor'],
    ...porPlano.map(v => [v.plano, v.velocidade, v.vendas, v.valor]),
    [],
    ['ADICIONAIS'],
    ['Adicional', 'Quantidade'],
    ...porAdicional.map(v => [v.adicional, v.quantidade]),
  ];

  const rows = linhas.map(l => ({
    'ID': l.id || '—',
    'Data': l.data ? l.data.split('-').reverse().join('/') : '—',
    'Hora': l.hora || '—',
    'Vendedor': l.tipoLinha === 'outra_filial' ? 'Outra filial' : l.vendedorNome,
    'Tipo': l.tipoLinha === 'outra_filial' ? '—' : (l.vendedorTipo === 'interno' ? 'Interno' : l.vendedorTipo === 'externo' ? 'Externo' : '—'),
    'Cliente': l.cliente || '—',
    'Plano': l.planoNome,
    'Velocidade': l.velocidade ? l.velocidade + ' Mbps' : '—',
    'Valor do Plano': l.valorPlano,
    'Adicionais': l.adicionaisNomes.join(', ') || '—',
    'Valor dos Adicionais': l.valorAdicionais,
    'Valor Total': l.valorTotal,
    'Fora da Filial': l.foraFilial ? 'Sim' : 'Não',
    'Origem': l.tipoLinha === 'outra_filial' ? 'Outra filial' : (l.foraFilial ? 'Fora da filial' : 'Nossa filial'),
    'Filial de Origem': l.filialOrigem || '—',
    'Observação': l.observacao || '—',
  }));

  const wb = XLSX.utils.book_new();
  const wsResumo = XLSX.utils.aoa_to_sheet(resumoRows);
  wsResumo['!cols'] = [{ wch: 26 }, { wch: 24 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo');

  const wsVendas = XLSX.utils.json_to_sheet(rows);
  wsVendas['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 16 }, { wch: 10 }, { wch: 16 }, { wch: 20 }, { wch: 12 }, { wch: 14 }, { wch: 26 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 24 }];
  wsVendas['!freeze'] = { xSplit: 0, ySplit: 1 }; // congela a 1ª linha (depende do leitor de xlsx)
  XLSX.utils.book_append_sheet(wb, wsVendas, 'Vendas');

  const hoje = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Relatorio_Vendas_${hoje}.xlsx`);
  showToast('Excel exportado com sucesso!', 'success');
}

function exportarRelatorioPDF() {
  if (typeof window.jspdf === 'undefined') { showToast('Biblioteca de PDF não carregada.', 'error'); return; }
  const linhas = _relatorioState.linhas;
  if (!linhas.length) { showToast('Nenhuma venda para exportar.', 'warning'); return; }

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
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal').length;
  const vendasOutras = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const { porVendedor, porPlano, porAdicional } = calcularResumosRelatorio(linhas);
  const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');

  let y = 80;
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('RESUMO', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: corAccent2 },
    head: [['Total de Vendas', 'Valor Total', 'Ticket Médio', 'Vendas da Equipe', 'Outras Filiais']],
    body: [[totalVendas, fmt(valorTotal), fmt(ticketMedio), vendasEquipe, vendasOutras]],
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('VENDAS POR VENDEDOR', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'striped', styles: { fontSize: 8.5 }, headStyles: { fillColor: corAccent },
    head: [['Vendedor', 'Tipo', 'Vendas', 'Valor']],
    body: porVendedor.map(v => [v.vendedor, v.tipo, v.vendas, fmt(v.valor)]),
    margin: { left: 14, right: 14 },
  });
  y = doc.lastAutoTable.finalY + 10;

  if (y > 250) { doc.addPage(); desenharFundoRelatorioPDF(doc); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('VENDAS POR PLANO', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'striped', styles: { fontSize: 8.5 }, headStyles: { fillColor: corAccent },
    head: [['Plano', 'Velocidade', 'Vendas', 'Valor']],
    body: porPlano.map(v => [v.plano, v.velocidade, v.vendas, fmt(v.valor)]),
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

  if (y > 240) { doc.addPage(); desenharFundoRelatorioPDF(doc); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('DETALHAMENTO DAS VENDAS', 14, y); y += 6;
  // Tabela de detalhamento pode quebrar em várias páginas sozinha
  // (linhas demais para caber na página atual). O jspdf-autotable
  // chama didDrawPage a cada página nova ANTES de desenhar as linhas
  // daquela página — usamos isso para repetir o fundo do modelo
  // também nessas páginas "automáticas" (a 1ª página já tem o fundo
  // desenhado acima, então pulamos ela aqui pra não cobrir o título).
  let _primeiraPaginaDetalhamento = true;
  doc.autoTable({
    startY: y, theme: 'grid', styles: { fontSize: 7.5 }, headStyles: { fillColor: corAccent2 },
    head: [['Data', 'Hora', 'Vendedor', 'Cliente', 'Plano', 'Adicionais', 'Total']],
    body: linhas.map(l => [
      l.data ? l.data.split('-').reverse().join('/') : '—',
      l.hora || '—',
      l.tipoLinha === 'outra_filial' ? ('🏢 ' + l.filialOrigem) : l.vendedorNome,
      l.cliente || '—',
      l.planoNome + (l.velocidade ? ' - ' + l.velocidade + ' Mbps' : ''),
      l.adicionaisNomes.join(', ') || '—',
      fmt(l.valorTotal),
    ]),
    margin: { left: 14, right: 14, top: 20 },
    didDrawPage: () => {
      if (_primeiraPaginaDetalhamento) { _primeiraPaginaDetalhamento = false; return; }
      desenharFundoRelatorioPDF(doc);
    },
  });

  // número de página no rodapé (feito ao final, sobre todas as páginas já geradas)
  const totalPaginas = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(140, 140, 140);
    doc.text(`Página ${i} de ${totalPaginas}`, 105, 290, { align: 'center' });
  }

  const hoje = new Date().toISOString().split('T')[0];
  doc.save(`Relatorio_Vendas_${hoje}.pdf`);
  showToast('PDF exportado com sucesso!', 'success');
}
