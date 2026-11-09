
// Operacao mensal, celebracoes e configuracao de metas.
let _anRetornoFocus = null;
function fecharPerfilAnalitico() {
  const modal = document.getElementById('an-profile-modal');
  const profile = document.getElementById('an-profile');
  if (!modal) return;
  modal.hidden = true;
  if (profile) profile.hidden = true;
  document.body.classList.remove('an-modal-open');
  _anRetornoFocus?.focus?.();
  _anRetornoFocus = null;
}
document.addEventListener('click', event => {
  const selecionar = event.target?.closest?.('[data-an-select]');
  if (selecionar) {
    const select = document.getElementById('an-vendedor-select');
    if (!select) return;
    _anRetornoFocus = selecionar;
    select.value = selecionar.dataset.anSelect;
    renderizarPerfilAnalitico();
    return;
  }
  if (event.target?.closest?.('[data-an-close]')) fecharPerfilAnalitico();
});
document.addEventListener('error', event => {
  const img = event.target;
  if (img?.matches?.('img[data-an-avatar]')) {
    const parent = img.parentElement;
    img.remove();
    if (parent) parent.textContent = img.dataset.fallback || '?';
  }
}, true);
document.addEventListener('input', event => {
  if (event.target?.id === 'an-busca') renderizarGradeAnalitica();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('an-profile-modal')?.hidden) fecharPerfilAnalitico();
});
document.addEventListener('adm:dashboarddataready', () => {
  if (document.getElementById('sec-analitica')?.classList.contains('active')) renderizarAnaliticaPerfis();
  renderizarOperacaoDashboard(_ultimoProcessado);
});

let _dashboardPendenciasRequestId = 0;

function renderizarOperacaoDashboard(d) {
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const fmt = value => Number(value || 0).toLocaleString('pt-BR');
  const vendasMes = [...(d?.intMes || []), ...(d?.extMes || [])]
    .filter(item => Number(item.vendas) > 0)
    .sort((a, b) => Number(b.vendas) - Number(a.vendas) || Number(b.valor || 0) - Number(a.valor || 0));
  const liderVendas = vendasMes[0];
  const liderRenovacoes = _cache.destaquesRenovacoes?.[0];
  const vendaRecente = _cache.vendaMaisRecente;

  setText('dash-renovacoes', _cache.renovacoesTotal == null ? '—' : fmt(_cache.renovacoesTotal));
  setText('dash-month-sales-leader', liderVendas?.nome || 'Sem vendas no mês');
  setText('dash-month-sales-leader-note', liderVendas
    ? `${fmt(liderVendas.vendas)} vendas · ${liderVendas.tipo === 'externo' ? 'Externo' : 'Interno'}`
    : 'O destaque aparece após a primeira venda do mês.');
  setText('dash-month-renewal-leader', liderRenovacoes?.vendedor_nome || 'Sem renovações no mês');
  setText('dash-month-renewal-leader-note', liderRenovacoes
    ? `${fmt(liderRenovacoes.quantidade)} renovações · ${liderRenovacoes.tipo === 'externo' ? 'Externo' : 'Interno'}`
    : 'O destaque aparece após a primeira renovação do mês.');
  setText('dash-recent-sale', vendaRecente?.vendedores?.nome || 'Sem vendas recentes');
  const dataVenda = vendaRecente?.data_venda ? new Date(vendaRecente.data_venda) : null;
  setText('dash-recent-sale-note', dataVenda && !Number.isNaN(dataVenda.getTime())
    ? dataVenda.toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Os novos lançamentos aparecerão aqui.');

  const status = document.getElementById('dash-attention-status');
  if (status) {
    status.classList.remove('is-clear', 'is-attention');
    status.textContent = window.ADMIN_AUTENTICADO ? 'Consultando fila de revisão…' : 'Aguardando acesso administrativo';
  }
  carregarContagensPendentesDashboard(d);
}

async function carregarContagensPendentesDashboard(d) {
  const requestId = ++_dashboardPendenciasRequestId;
  const filialId = Number(window.FILIAL_ATUAL_ID);
  const mes = Number(d?.mes?.mesNum);
  const ano = Number(d?.mes?.ano);
  const status = document.getElementById('dash-attention-status');
  const renderContagem = (id, noteId, cardId, quantidade, descricao) => {
    const card = document.getElementById(cardId);
    if (card) card.classList.toggle('is-pending', Number(quantidade) > 0);
    document.getElementById(id)?.replaceChildren(document.createTextNode(quantidade == null ? '—' : fmtDashboard(quantidade)));
    const note = document.getElementById(noteId);
    if (note) note.textContent = quantidade == null ? 'Não foi possível consultar a fila' : quantidade === 0 ? 'Nenhum item aguardando revisão' : descricao;
  };
  const fmtDashboard = value => Number(value || 0).toLocaleString('pt-BR');
  if (!window.ADMIN_AUTENTICADO || !window._supabase || !Number.isInteger(filialId) || filialId <= 0 || !mes || !ano) {
    renderContagem('dash-pending-sales', 'dash-pending-sales-note', 'dash-pending-sales-card', null, '');
    renderContagem('dash-pending-renewals', 'dash-pending-renewals-note', 'dash-pending-renewals-card', null, '');
    if (status) status.textContent = 'Acesse como administrador para consultar as filas';
    return;
  }
  const [vendas, revisoesImportacao, renovacoes] = await Promise.all([
    window._supabase.from('vendas_conferencia_ixc').select('id', { count: 'exact', head: true }).eq('filial_id', filialId).eq('situacao', 'pendente'),
    window._supabase.from('vendas_importacao_revisao_ixc').select('id', { count: 'exact', head: true }).eq('filial_contexto_id', filialId).eq('situacao', 'pendente'),
    window._supabase.from('renovacoes_registros').select('id', { count: 'exact', head: true }).eq('filial_id', filialId).eq('mes', mes).eq('ano', ano).eq('conferencia_pendente', true),
  ]);
  if (requestId !== _dashboardPendenciasRequestId) return;
  if (vendas.error) console.warn('[carregarContagensPendentesDashboard] vendas IXC:', vendas.error.message);
  if (revisoesImportacao.error) console.warn('[carregarContagensPendentesDashboard] revisão de importação IXC:', revisoesImportacao.error.message);
  if (renovacoes.error) console.warn('[carregarContagensPendentesDashboard] renovações:', renovacoes.error.message);
  const quantidadeVendas = vendas.error || revisoesImportacao.error
    ? null
    : Number(vendas.count || 0) + Number(revisoesImportacao.count || 0);
  const detalheVendas = quantidadeVendas == null ? '' : ` (${Number(vendas.count || 0)} ausente(s) do relatório · ${Number(revisoesImportacao.count || 0)} com vínculo pendente)`;
  const quantidadeRenovacoes = renovacoes.error ? null : Number(renovacoes.count || 0);
  renderContagem('dash-pending-sales', 'dash-pending-sales-note', 'dash-pending-sales-card', quantidadeVendas,
    `${fmtDashboard(quantidadeVendas)} item(ns) aguardando revisão${detalheVendas}`);
  renderContagem('dash-pending-renewals', 'dash-pending-renewals-note', 'dash-pending-renewals-card', quantidadeRenovacoes,
    `${fmtDashboard(quantidadeRenovacoes)} renovação(ões) aguardando conferência`);
  if (status) {
    status.classList.toggle('is-clear', quantidadeVendas === 0 && quantidadeRenovacoes === 0);
    status.classList.toggle('is-attention', Number(quantidadeVendas) + Number(quantidadeRenovacoes) > 0);
    status.textContent = quantidadeVendas == null || quantidadeRenovacoes == null
      ? 'Não foi possível consultar todas as filas'
      : quantidadeVendas + quantidadeRenovacoes === 0 ? 'Tudo em dia' : `${quantidadeVendas + quantidadeRenovacoes} item(ns) precisam de revisão`;
  }
}

function contarDiasUteisResumo(inicio, fim) {
  let total = 0;
  const dia = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate());
  const limite = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate());
  while (dia <= limite) {
    if (dia.getDay() !== 0 && dia.getDay() !== 6) total++;
    dia.setDate(dia.getDate() + 1);
  }
  return total;
}

async function gerarResumoMensalFilial(evt) {
  const d = _ultimoProcessado;
  if (!d || !d.mes) { showToast('Carregue os dados do painel antes de gerar o resumo.', 'warning'); return; }
  const btn = evt?.currentTarget || evt?.target?.closest('button');
  const textoOriginal = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando imagem…'; }

  try {
    if (typeof html2canvas === 'undefined') {
      await carregarLibsAdmin();
      if (typeof html2canvas === 'undefined') throw new Error('Não foi possível carregar o gerador de imagens. Tente novamente.');
    }

    const agora = new Date();
    const mes = Number(d.mes.mesNum) || agora.getMonth() + 1;
    const ano = Number(d.mes.ano) || agora.getFullYear();
    const inicioMes = new Date(ano, mes - 1, 1);
    const fimMes = new Date(ano, mes, 0);
    const hojeData = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const ultimoDiaDecorrido = hojeData < inicioMes
      ? new Date(ano, mes - 1, 0)
      : new Date(Math.min(hojeData.getTime(), fimMes.getTime()));
    const vendas = Number(d.totalMes || 0);
    const meta = Number(d.metasFilial?.mensal_m1) || 0;
    const faltam = meta ? Math.max(0, meta - vendas) : null;
    const percentual = meta ? Math.round((vendas / meta) * 100) : null;
    const diasUteisPassados = ultimoDiaDecorrido >= inicioMes ? contarDiasUteisResumo(inicioMes, ultimoDiaDecorrido) : 0;
    const amanha = new Date(ultimoDiaDecorrido.getFullYear(), ultimoDiaDecorrido.getMonth(), ultimoDiaDecorrido.getDate() + 1);
    const diasUteisRestantes = ultimoDiaDecorrido < fimMes ? contarDiasUteisResumo(amanha, fimMes) : 0;
    const mediaAtual = diasUteisPassados ? vendas / diasUteisPassados : null;
    const mediaNecessaria = faltam === null ? null : faltam === 0 ? 0 : diasUteisRestantes > 0 ? faltam / diasUteisRestantes : null;
    const metasRenovCancel = d.metasRenovCancel || {};
    const valorVendas = (_cache.vendasMes || []).filter(v => v.fora_filial !== true)
      .reduce((soma, v) => soma + (Number(v.valor_total || 0) || (Number(v.valor_plano || v.valor || 0) + Number(v.valor_adicionais || 0))), 0);
    const valorOutrasFiliais = (_cache.vendasFiliais || [])
      .reduce((soma, v) => soma + Number(v.valor_total || 0), 0);
    const ticketMedio = vendas > 0 ? (valorVendas + valorOutrasFiliais) / vendas : null;
    const formatarNumero = valor => Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
    const formatarInteiro = valor => Number(valor).toLocaleString('pt-BR');
    const formatarMoeda = valor => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const nomeMes = d.mes.mesNome ? d.mes.mesNome.charAt(0).toLocaleUpperCase('pt-BR') + d.mes.mesNome.slice(1) : inicioMes.toLocaleDateString('pt-BR', { month: 'long' });
    const filialNome = window.FILIAL_ATUAL?.nome || 'Filial';
    const setText = (id, texto) => { const el = document.getElementById(id); if (el) el.textContent = texto; };

    setText('mf-filial', filialNome);
    setText('mf-periodo', `${nomeMes} de ${ano}`);
    setText('mf-meta-title', meta ? `de ${meta.toLocaleString('pt-BR')} vendas` : 'vendas realizadas');
    setText('mf-progress-pct', percentual === null ? '—' : `${percentual}%`);
    const progress = document.getElementById('mf-progress-fill');
    if (progress) progress.style.width = `${Math.min(100, Math.max(0, percentual || 0))}%`;
    setText('mf-vendas', vendas.toLocaleString('pt-BR'));
    setText('mf-faltam', faltam === null ? 'Meta não cadastrada' : faltam ? `Faltam ${faltam.toLocaleString('pt-BR')} vendas para atingir a meta` : 'Meta atingida');
    setText('mf-cancelamentos', metasRenovCancel.cancelamentos_atual == null ? '—' : Number(metasRenovCancel.cancelamentos_atual).toLocaleString('pt-BR'));
    const renovacoesTotal = _cache.renovacoesTotal != null && Number.isFinite(Number(_cache.renovacoesTotal)) ? Number(_cache.renovacoesTotal) : null;
    setText('mf-renovacoes', renovacoesTotal === null ? '—' : renovacoesTotal.toLocaleString('pt-BR'));
    const cancelAtual = metasRenovCancel.cancelamentos_atual == null ? null : Number(metasRenovCancel.cancelamentos_atual);
    const limitesCancelamento = [
      { label: 'M1', meta: Number(metasRenovCancel.cancelamentos_m1) },
      { label: 'M2', meta: Number(metasRenovCancel.cancelamentos_m2) },
      { label: 'M3', meta: Number(metasRenovCancel.cancelamentos_m3) },
    ].filter(item => item.meta > 0).sort((a, b) => a.meta - b.meta);
    const limiteEmUso = cancelAtual == null ? null : (limitesCancelamento.find(item => cancelAtual <= item.meta) || limitesCancelamento[limitesCancelamento.length - 1]);
    const textoMetaCancelamento = cancelAtual == null
      ? 'Atualize o valor no painel ADM'
      : !limiteEmUso
        ? 'Defina os limites M1, M2 ou M3'
        : `${limiteEmUso.label} · ${formatarInteiro(cancelAtual)}/${formatarInteiro(limiteEmUso.meta)} · ${Math.round((cancelAtual / limiteEmUso.meta) * 100)}% do limite`;
    const renovAtual = renovacoesTotal;
    const metasRenovacaoFilial = _cache.metasRenovacaoFilial || {
      meta_m3: metasRenovCancel.renovacoes_m3,
      meta_m2: metasRenovCancel.renovacoes_m2,
      meta_m1: metasRenovCancel.renovacoes_m1,
    };
    const metasRenovacao = [
      { label: 'M3', meta: Number(metasRenovacaoFilial.meta_m3) },
      { label: 'M2', meta: Number(metasRenovacaoFilial.meta_m2) },
      { label: 'M1', meta: Number(metasRenovacaoFilial.meta_m1) },
    ].filter(item => item.meta > 0).sort((a, b) => a.meta - b.meta);
    const metaRenovacaoEmUso = renovAtual == null ? null : (metasRenovacao.find(item => renovAtual < item.meta) || metasRenovacao[metasRenovacao.length - 1]);
    const textoMetaRenovacao = renovAtual == null
      ? 'Importe o relatório de renovações'
      : !metaRenovacaoEmUso
        ? 'Defina as metas M1, M2 ou M3'
        : `${metaRenovacaoEmUso.label} · ${formatarInteiro(renovAtual)}/${formatarInteiro(metaRenovacaoEmUso.meta)} · ${Math.round((renovAtual / metaRenovacaoEmUso.meta) * 100)}% da meta`;
    setText('mf-cancelamentos-meta', textoMetaCancelamento);
    setText('mf-renovacoes-meta', textoMetaRenovacao);
    setText('mf-media-atual', mediaAtual === null ? '—' : `${formatarNumero(mediaAtual)} / dia`);
    setText('mf-media-necessaria', mediaNecessaria === null ? '—' : mediaNecessaria === 0 ? 'Meta atingida' : `${formatarNumero(mediaNecessaria)} / dia`);
    setText('mf-ticket', ticketMedio === null ? '—' : formatarMoeda(ticketMedio));
    setText('mf-gerado-em', `ATUALIZADO EM ${agora.toLocaleDateString('pt-BR')}`);

    if (document.fonts?.ready) await document.fonts.ready;
    const card = document.getElementById('mf-card');
    await Promise.all(Array.from(card.querySelectorAll('img'), img => img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
    const canvas = await html2canvas(card, { backgroundColor: null, scale: 1, useCORS: true, allowTaint: false, imageTimeout: 10000 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível converter o resumo para imagem.');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Resumo_Mensal_${filialNome.replace(/[^a-z0-9]+/gi, '_')}_${ano}-${String(mes).padStart(2, '0')}.png`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('Resumo mensal da filial baixado.', 'success');
  } catch (err) {
    console.error('[gerarResumoMensalFilial]', err);
    showToast(err.message || 'Não foi possível gerar o resumo mensal.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = textoOriginal; }
  }
}

// Gera os cards dos vendedores ativos atualmente exibidos na tabela e
// entrega um ZIP único. O processamento é sequencial para limitar o uso
// de memória do canvas em celulares e computadores com pouca memória.
async function baixarCardsStatusZip(evt) {
  const d = _ultimoProcessado;
  const btn = evt?.currentTarget || document.getElementById('adm-vendedores-bulk-btn');
  const status = document.getElementById('adm-vendedores-bulk-status');
  if (!d) { showToast('Carregue os dados da equipe antes de gerar os cards.', 'warning'); return; }

  const vendedores = [...(d.intMes || []), ...(d.extMes || [])]
    .filter(v => v?.slug)
    .filter((v, i, lista) => lista.findIndex(item => item.slug === v.slug) === i);
  if (!vendedores.length) { showToast('Não há vendedores ativos para gerar cards.', 'warning'); return; }

  const textoOriginal = btn?.querySelector('span')?.textContent || 'Gerar todos e baixar ZIP';
  const botoesIndividuais = [...document.querySelectorAll('#adm-vendedores-tbody .adm-btn-status')];
  let zip;
  const erros = [];
  if (btn) btn.disabled = true;
  botoesIndividuais.forEach(botao => { botao.disabled = true; });

  try {
    if (status) status.textContent = 'Preparando gerador de imagens…';
    if (typeof html2canvas === 'undefined' || typeof JSZip === 'undefined') await carregarLibsAdmin();
    if (typeof html2canvas === 'undefined' || typeof JSZip === 'undefined') {
      throw new Error('Não foi possível carregar as bibliotecas necessárias para criar o ZIP.');
    }
    zip = new JSZip();
    if (document.fonts?.ready) await document.fonts.ready;

    const arquivoSeguro = nome => String(nome || 'vendedor')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'vendedor';

    for (let i = 0; i < vendedores.length; i++) {
      const vendedor = vendedores[i];
      if (status) status.textContent = `Gerando imagem ${i + 1} de ${vendedores.length}: ${vendedor.nome}…`;
      if (btn?.querySelector('span')) btn.querySelector('span').textContent = `Gerando ${i + 1}/${vendedores.length}`;
      try {
        const blob = await gerarStatusVendedor(vendedor.slug, null, { returnBlob: true });
        if (!blob) throw new Error('Card não foi gerado');
        zip.file(`${String(i + 1).padStart(2, '0')}_${arquivoSeguro(vendedor.nome)}.png`, blob);
      } catch (err) {
        console.warn('[baixarCardsStatusZip] falha para', vendedor.nome, err);
        erros.push(vendedor.nome);
      }
      // Deixa a interface atualizar o progresso entre capturas.
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    if (!Object.keys(zip.files).length) throw new Error('Nenhum card pôde ser gerado.');
    if (status) status.textContent = 'Compactando as imagens…';
    const arquivoZip = await zip.generateAsync({ type: 'blob' }, progresso => {
      if (status) status.textContent = `Compactando as imagens… ${Math.round(progresso.percent)}%`;
    });
    const url = URL.createObjectURL(arquivoZip);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Cards_Desempenho_${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    const gerados = Object.keys(zip.files).length;
    if (status) status.textContent = erros.length
      ? `${gerados} cards no ZIP. ${erros.length} não foram gerados: ${erros.join(', ')}.`
      : `${gerados} cards gerados e baixados.`;
    showToast(erros.length
      ? `ZIP baixado com ${gerados} cards. ${erros.length} vendedor(es) falharam; veja o resumo aqui.`
      : `ZIP baixado com ${gerados} cards de desempenho.`, erros.length ? 'warning' : 'success');
  } catch (err) {
    console.error('[baixarCardsStatusZip]', err);
    if (status) status.textContent = err.message || 'Falha ao gerar o ZIP.';
    showToast(err.message || 'Não foi possível gerar o ZIP.', 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btn?.querySelector('span')) btn.querySelector('span').textContent = textoOriginal;
    botoesIndividuais.forEach(botao => { botao.disabled = false; });
  }
}

// ================================================================
// ABA "CELEBRAÇÕES" — arte de conquista baseada nas metas individuais
// mensais. Só permite celebrar marcos efetivamente alcançados.
// ================================================================

