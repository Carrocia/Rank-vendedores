// ═══════════════════════════════════════════════════════════════
// ADMIN.JS — Painel Administrativo (tudo prefixado adm_)
// Login/navegação do painel, handlers de formulário (nova
// venda, adicional avulso, venda de outra filial), tabelas do
// ADM (ranking, equipe, metas configuradas) e configuração de
// metas (M1/M2/M3 semanais e mensais).
// ═══════════════════════════════════════════════════════════════

// ── Helpers de UI ────────────────────────────────────────────────
function adm_showLogin() {
  document.getElementById('adm-login-overlay').classList.add('active');
  document.getElementById('adm-login-error').classList.remove('visible');
  document.getElementById('adm-email').value = '';
  document.getElementById('adm-password').value = '';
}

function adm_hideLogin() {
  document.getElementById('adm-login-overlay').classList.remove('active');
}

function adm_showPanel() {
  document.getElementById('adm-panel-overlay').classList.add('active');
  // popular fotos na tabela de vendedores
  ['gabriella','lorena','lohayne','ian','william'].forEach(id => {
    const el = document.getElementById('vt-foto-' + id);
    if (el && PHOTOS[id]) el.src = PHOTOS[id];
  });
  // data padrão no formulário = hoje
  const hoje = new Date().toISOString().split('T')[0];
  const dataEl = document.getElementById('venda-data');
  if (dataEl && !dataEl.value) dataEl.value = hoje;
}

function adm_hidePanel() {
  document.getElementById('adm-panel-overlay').classList.remove('active');
}

function adm_navigateTo(sectionId) {
  document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
  document.querySelector(`.adm-nav-item[data-section="${sectionId}"]`)?.classList.add('active');
  document.getElementById('sec-' + sectionId)?.classList.add('active');
  // volta pro topo ao trocar de seção — sem isso, a rolagem da seção
  // anterior ficava "presa", escondendo filtros/cabeçalho da nova seção
  document.getElementById('adm-panel-overlay')?.scrollTo({ top: 0, behavior: 'instant' });
}

// ── Cálculo do total na nova venda ──────────────────────────────
function calcularTotal() {
  const planoEl = document.getElementById('venda-plano');
  const planoValor = planoEl.value ? parseFloat(planoEl.value.split('|')[1] || 0) : 0;
  const checkboxes = document.querySelectorAll('input[name="adicionais"]:checked');
  const adicionaisValor = Array.from(checkboxes).reduce((acc, cb) => {
    return acc + parseFloat(cb.value.split('|')[1] || 0);
  }, 0);
  const total = planoValor + adicionaisValor;
  document.getElementById('venda-total').textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
}

// Volta o dropdown customizado ao estado "nada selecionado" — usado
// pelos reset dos formulários, já que form.reset() só limpa o <select>
// real escondido, não o texto visível do botão customizado.
function resetCustomSelect(selectId) {
  const wrap = document.getElementById(selectId + '-custom');
  if (!wrap) return;
  const valueEl = wrap.querySelector('.custom-select-value');
  if (valueEl) { valueEl.textContent = 'Selecione o plano'; valueEl.classList.add('placeholder'); }
  wrap.querySelectorAll('.custom-select-option.selected').forEach(o => o.classList.remove('selected'));
}

function resetVendaForm() {
  document.getElementById('adm-venda-form').reset();
  document.getElementById('venda-total').textContent = 'R$ 0,00';
  resetCustomSelect('venda-plano');
}

// ── Handler Nova Venda ───────────────────────────────────────────
async function handleNovaVenda(e) {
  e.preventDefault();
  const vendedor_id = document.getElementById('venda-vendedor').value;
  const planoRaw = document.getElementById('venda-plano').value;
  const [plano_id, planoValorStr] = planoRaw.split('|');
  const data_venda = document.getElementById('venda-data').value;
  const hora_venda = document.getElementById('venda-hora').value;
  const cliente = document.getElementById('venda-cliente').value.trim();
  const obs = document.getElementById('venda-obs').value.trim();
  const foraFilial = document.getElementById('venda-fora-filial').checked;
  if (!vendedor_id || !plano_id) { showToast('Selecione o vendedor e o plano.', 'warning'); return; }
  if (!data_venda || !hora_venda) { showToast('Informe a data e a hora da venda.', 'warning'); return; }
  // Monta o instante exato a partir dos componentes LOCAIS de data e
  // hora digitados manualmente, usando o objeto Date (que conhece o
  // fuso horário real do navegador) — e só depois converte para UTC/ISO
  // no momento de enviar ao Supabase. Isso evita o deslocamento que
  // acontecia ao mandar uma string sem indicador de fuso (o Postgres
  // assumia UTC na sessão, não o fuso local do navegador).
  const [anoVenda, mesVenda, diaVenda] = data_venda.split('-').map(Number);
  const [horaVenda, minutoVenda] = hora_venda.split(':').map(Number);
  const dataVendaLocal = new Date(anoVenda, mesVenda - 1, diaVenda, horaVenda, minutoVenda, 0, 0);
  const data_venda_timestamp = dataVendaLocal.toISOString();
  const checkboxes = document.querySelectorAll('input[name="adicionais"]:checked');
  const adicionaisParaSalvar = Array.from(checkboxes).map(cb => {
    const [prod_id, valor_unit] = cb.value.split('|');
    return { produto_adicional_id: prod_id, quantidade: 1, valor_unitario: parseFloat(valor_unit) };
  });
  // A tabela `vendas` não possui coluna própria para o nome do cliente
  // (schema atual: vendedor_id, plano_id, data_venda, valor, observacao).
  // Para não perder essa informação sem alterar o banco por conta própria,
  // ela é concatenada em `observacao`. Se quiser uma coluna dedicada,
  // veja a nota de ALTERAÇÃO NECESSÁRIA NO SQL no resumo desta entrega.
  const partesObs = [];
  if (cliente) partesObs.push('Cliente: ' + cliente);
  if (obs) partesObs.push(obs);
  const observacaoFinal = partesObs.length ? partesObs.join(' — ') : null;
  try {
    const venda = await saveVenda({ vendedor_id, plano_id, data_venda: data_venda_timestamp, valor: parseFloat(planoValorStr), cliente: cliente, observacao: observacaoFinal, fora_filial: foraFilial });
    if (adicionaisParaSalvar.length > 0) await saveVendaAdicionais(venda.id, adicionaisParaSalvar);
    await carregarDados();
    resetVendaForm();
    showToast('Venda registrada com sucesso!', 'success');
  } catch (err) {
    console.error('[handleNovaVenda]', err);
    showToast('Não foi possível registrar a venda.', 'error');
  }
}

// ── Handler Adicional Avulso ─────────────────────────────────────
async function handleNovoAdicional(e) {
  e.preventDefault();
  const vendedor_id = document.getElementById('adic-vendedor')?.value || null;
  const produto_adicional_id = document.getElementById('adic-produto')?.value || null;
  const data_venda = document.getElementById('adic-data')?.value || new Date().toISOString().split('T')[0];
  const quantidade = parseInt(document.getElementById('adic-quantidade')?.value) || 1;
  const valor_unitario = parseFloat(document.getElementById('adic-valor')?.value) || 0;
  const obs = document.getElementById('adic-obs')?.value || null;
  if (!produto_adicional_id) { showToast('Selecione o produto adicional.', 'warning'); return; }
  try {
    await saveAdicionalAvulso({ vendedor_id, produto_adicional_id, data_venda, quantidade, valor_unitario, observacao: obs });
    await carregarDados();
    showToast('Adicional avulso registrado!', 'success');
    document.getElementById('adm-adicional-form').reset();
  } catch (err) {
    console.error('[handleNovoAdicional]', err);
    showToast('Não foi possível registrar o adicional avulso.', 'error');
  }
}

// ================================================================
// VENDAS DE OUTRAS FILIAIS — JavaScript
// NÃO contam para ranking nem metas individuais dos vendedores.
// CONTAM para a meta global da filial.
// As funções registrarVendaOutraFilial() e loadVendasOutrasFiliais()
// que realmente conversam com o Supabase já estão definidas acima
// (seção de funções de banco). Este bloco só cuida do formulário.
// ================================================================

// ── Calcular total do formulário de filial ───────────────────────
function calcularTotalFilial() {
  const planoEl = document.getElementById('filial-plano');
  const planoValorPadrao = planoEl.value ? parseFloat(planoEl.value.split('|')[1] || 0) : 0;
  const valorCustom = parseFloat(document.getElementById('filial-valor').value);
  const valorUnit = isNaN(valorCustom) ? planoValorPadrao : valorCustom;
  const qtd = parseInt(document.getElementById('filial-qtd').value) || 1;
  const checkboxes = document.querySelectorAll('input[name="filial-adicionais"]:checked');
  const adicionaisValor = Array.from(checkboxes).reduce((acc, cb) => acc + parseFloat(cb.value.split('|')[1] || 0), 0);
  const total = (valorUnit * qtd) + adicionaisValor;
  document.getElementById('filial-total').textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
}

function resetFilialForm() {
  document.getElementById('adm-filial-form').reset();
  document.getElementById('filial-total').textContent = 'R$ 0,00';
  resetCustomSelect('filial-plano');
}

// ── Atualizar o totalizador da meta global ───────────────────────
// Reprocessa o cache já carregado (sem nova chamada de rede) e
// atualiza o card "Composição da Meta Global". Se ainda não há dados
// reais carregados, não faz nada — o estado "sem dados" já é exibido
// por renderEstadoSemDados() e nunca é substituído por números fictícios.
function atualizarTotalizador() {
  if (!_dadosCarregados) return;
  const d = processarDadosParaRender(_cache);
  atualizarTotalizadorComDados(d.totalGlobal);
}

function atualizarTotalizadorComDados(totais) {
  const { equipe, filiais, total, pct, metaGlobal } = totais;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('tot-equipe', equipe);
  set('tot-filiais', filiais);
  set('tot-global', total);
  set('tot-meta-label', '/ ' + (metaGlobal || '—') + ' vendas (M1)');
  set('tot-barra-label', pct + '% da meta global');
  const barEl = document.getElementById('tot-barra');
  if (barEl) barEl.style.width = pct + '%';
}

// ── Renderizar a tabela de registros da sessão ───────────────────
async function renderFilialLista() {
  const vazio = document.getElementById('filial-lista-vazia');
  const wrap = document.getElementById('filial-tabela-wrap');
  const tbody = document.getElementById('filial-tabela-body');
  if (!tbody) return;

  let vendas = [];
  if (window._supabase) {
    vendas = await loadVendasOutrasFiliais();
  } else if (_cache.vendasFiliais) {
    vendas = _cache.vendasFiliais;
  }

  if (vendas.length === 0) {
    if (vazio) vazio.style.display = '';
    if (wrap) wrap.style.display = 'none';
    return;
  }
  if (vazio) vazio.style.display = 'none';
  if (wrap) wrap.style.display = '';

  tbody.innerHTML = vendas.map(v => {
    const filialNome = v.filial_nome || '—';
    const totalFmt = 'R$ ' + Number(v.valor_total || 0).toFixed(2).replace('.', ',');
    return `<tr>
      <td><strong>${filialNome}</strong></td>
      <td>${v.plano_nome || '—'}</td>
      <td>${v.quantidade || 1}</td>
      <td>R$ ${Number(v.valor_unitario || 0).toFixed(2).replace('.', ',')}</td>
      <td>—</td>
      <td><strong>${totalFmt}</strong></td>
      <td>${v.data_venda || '—'}</td>
      <td style="color:var(--text-muted)">${v.observacao || '—'}</td>
    </tr>`;
  }).join('');
}

// ── Handler do formulário ────────────────────────────────────────
async function handleVendaOutraFilial(e) {
  e.preventDefault();

  const filialId = document.getElementById('filial-origem').value;
  const planoRaw = document.getElementById('filial-plano').value;
  const [planoId, planoValorPadraoStr] = planoRaw.split('|');
  const planoNome = document.getElementById('filial-plano').selectedOptions[0]?.text || planoId;
  const qtd = parseInt(document.getElementById('filial-qtd').value) || 1;
  const valorCustom = parseFloat(document.getElementById('filial-valor').value);
  const valorUnit = isNaN(valorCustom) ? parseFloat(planoValorPadraoStr) : valorCustom;
  const data = document.getElementById('filial-data').value;
  const obs = document.getElementById('filial-obs').value;
  if (!filialId || !planoId) { showToast('Selecione a filial e o plano.', 'warning'); return; }

  const checkboxes = document.querySelectorAll('input[name="filial-adicionais"]:checked');
  const adicionais = Array.from(checkboxes).map(cb => {
    const [aid, aval] = cb.value.split('|');
    return { id: aid, valor: parseFloat(aval) };
  });
  const adicionaisValor = adicionais.reduce((s, a) => s + a.valor, 0);
  const valorTotal = (valorUnit * qtd) + adicionaisValor;

  const dados = {
    filial_id: filialId,
    plano_id: planoId,
    plano_nome: planoNome,
    quantidade: qtd,
    valor_unitario: valorUnit,
    adicionais,
    valor_adicionais: adicionaisValor,
    valor_total: valorTotal,
    data_venda: data,
    obs,
    tipo: 'outra_filial', // garante separação no banco
    vendedor_id: null,    // nunca atribuir a nenhum vendedor
  };

  try {
    const vendaFilial = await registrarVendaOutraFilial(dados);
    const checkboxesF = document.querySelectorAll('input[name="filial-adicionais"]:checked');
    const adicionaisFilial = Array.from(checkboxesF).map(cb => {
      const [prod_id, valor_unit] = cb.value.split('|');
      return { produto_adicional_id: prod_id, quantidade: 1, valor_unitario: parseFloat(valor_unit) };
    });
    if (adicionaisFilial.length > 0) await saveVendaOutraFilialAdicionais(vendaFilial.id, adicionaisFilial);
    await carregarDados();
    resetFilialForm();
    showToast('Venda da filial registrada com sucesso!', 'success');
  } catch (err) {
    console.error('[handleVendaOutraFilial]', err);
    showToast('Não foi possível registrar a venda da filial.', 'error');
  }
}

function renderAdmRanking(ranking, vendedores) {
  const container = document.getElementById('adm-ranking-list');
  if (!container) return;
  if (!ranking || ranking.length === 0) {
    container.innerHTML = '<div class="adm-form-card" style="opacity:0.65;text-align:center;padding:40px;"><div>Sem dados de vendas para o período.</div></div>';
    return;
  }
  const posClass = (i) => i === 0 ? 'p1' : i === 1 ? 'p2' : i === 2 ? 'p3' : 'pn';
  container.innerHTML = ranking.map((r, i) => {
    const vendedor = (vendedores || []).find(v => v.id === r.vendedor_id);
    const foto = vendedor ? (PHOTOS[vendedor.slug] || '') : '';
    const nome = vendedor ? vendedor.nome : (r.nome || r.vendedor_id);
    const tipo = vendedor ? vendedor.tipo : '—';
    const valorFmt = 'R$ ' + Number(r.valor || 0).toFixed(2).replace('.', ',');
    return `<div class="adm-ranking-item">
      <div class="adm-ranking-pos ${posClass(i)}">${i + 1}º</div>
      <img class="adm-ranking-photo" src="${foto}" alt="${nome}" onerror="this.style.display='none'">
      <div class="adm-ranking-info">
        <div class="name">${nome}</div>
        <div class="sub">${tipo === 'interno' ? 'Vendedor Interno' : 'Vendedor Externo'}</div>
      </div>
      <div class="adm-ranking-value">
        <div class="vendas">${r.vendas}</div>
        <div class="sub">${valorFmt}</div>
      </div>
    </div>`;
  }).join('');
}

// Popula a tabela "Equipe de Vendas" no ADM com dados reais:
// meta individual (tabela metas), vendas do mês e % da meta.
function renderAdmVendedoresTable(d) {
  if (!d) return;
  const todos = [...d.extMes, ...d.intMes];
  todos.forEach(v => {
    const metaEl = document.getElementById('vt-meta-' + v.slug);
    const mesEl = document.getElementById('vt-mes-' + v.slug);
    const pctEl = document.getElementById('vt-pct-' + v.slug);
    if (metaEl) metaEl.textContent = v.meta ? (v.meta + ' vendas') : 'Sem meta cadastrada';
    if (mesEl) mesEl.textContent = v.vendas;
    if (pctEl) {
      if (v.meta) {
        // mesmo número que já era calculado e exibido como texto — a
        // barra visual é só um espelho dele, limitada a 100% de largura
        // pra não estourar o layout (o texto continua mostrando o
        // percentual real, sem limite, exatamente como antes).
        const pct = Math.round((v.vendas / v.meta) * 100);
        const pctBarra = Math.max(0, Math.min(100, pct));
        pctEl.innerHTML = `<div class="vt-pct-wrap"><div class="vt-pct-bar"><div class="vt-pct-bar-fill" style="width:${pctBarra}%"></div></div><span>${pct}%</span></div>`;
      } else {
        pctEl.textContent = '—';
      }
    }
  });
}

// Popula a seção "Metas Configuradas" do ADM com dados reais das
// tabelas metas (individuais) e metas_filial (semanal/mensal).
function renderAdmMetasConfig(cache) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const metas = cache.metas || [];
  const vendedores = cache.vendedores || [];

  // pega a meta de um interno/externo qualquer (todos compartilham a
  // mesma faixa, conforme cadastrado na tabela metas para o período)
  const primeiroInterno = vendedores.find(v => v.tipo === 'interno');
  const primeiroExterno = vendedores.find(v => v.tipo === 'externo');
  const metaInterno = primeiroInterno ? metas.find(m => m.vendedor_id === primeiroInterno.id) : null;
  const metaExterno = primeiroExterno ? metas.find(m => m.vendedor_id === primeiroExterno.id) : null;

  setText('meta-int-m3', metaInterno && metaInterno.meta_m3 ? (metaInterno.meta_m3 + ' vendas') : '—');
  setText('meta-int-m2', metaInterno && metaInterno.meta_m2 ? (metaInterno.meta_m2 + ' vendas') : '—');
  setText('meta-int-m1', metaInterno && metaInterno.meta_m1 ? (metaInterno.meta_m1 + ' vendas') : '—');
  setText('meta-ext-base', metaExterno && metaExterno.meta_vendas ? (metaExterno.meta_vendas + ' vendas') : '—');

  const mf = cache.metasFilial;
  setText('meta-fil-sem-m3', mf && mf.semanal_m3 ? (mf.semanal_m3 + ' vendas') : '—');
  setText('meta-fil-sem-m2', mf && mf.semanal_m2 ? (mf.semanal_m2 + ' vendas') : '—');
  setText('meta-fil-sem-m1', mf && mf.semanal_m1 ? (mf.semanal_m1 + ' vendas') : '—');
  setText('meta-fil-mes-m3', mf && mf.mensal_m3 ? (mf.mensal_m3 + ' vendas') : '—');
  setText('meta-fil-mes-m2', mf && mf.mensal_m2 ? (mf.mensal_m2 + ' vendas') : '—');
  setText('meta-fil-mes-m1', mf && mf.mensal_m1 ? (mf.mensal_m1 + ' vendas') : '—');
}

// ================================================================
// CONFIGURAÇÃO DE METAS (área administrativa editável)
// Usa exatamente os mesmos nomes de campo que renderMetasFilial(),
// renderWeekProgress(), renderMensalProgress() e processarDadosParaRender()
// já leem (semanal_m1/m2/m3, mensal_m1/m2/m3, meta_m1/m2/m3, meta_vendas),
// para garantir que o valor salvo apareça automaticamente nos cards
// públicos depois de carregarDados() — sem tocar em nenhuma dessas funções.
// ================================================================

// Preenche o formulário (filial + tabela de vendedores) com os dados
// já carregados em _cache — não faz nenhuma consulta nova ao Supabase.
function renderConfigMetas(cache) {
  const mesLabel = (cache.mes && cache.mes.mesNome)
    ? (cache.mes.mesNome.charAt(0).toUpperCase() + cache.mes.mesNome.slice(1)) + '/' + cache.mes.ano
    : '—';
  const periodoEls = [document.getElementById('cfg-fil-periodo'), document.getElementById('cfg-ind-periodo')];
  periodoEls.forEach(el => { if (el) el.textContent = mesLabel; });

  // Meta da Filial
  const mf = cache.metasFilial;
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val === null || val === undefined) ? '' : val; };
  setVal('cfg-fil-sem-m3', mf ? mf.semanal_m3 : null);
  setVal('cfg-fil-sem-m2', mf ? mf.semanal_m2 : null);
  setVal('cfg-fil-sem-m1', mf ? mf.semanal_m1 : null);
  setVal('cfg-fil-mes-m3', mf ? mf.mensal_m3 : null);
  setVal('cfg-fil-mes-m2', mf ? mf.mensal_m2 : null);
  setVal('cfg-fil-mes-m1', mf ? mf.mensal_m1 : null);

  // Metas individuais — uma linha por vendedor ativo
  const tbody = document.getElementById('cfg-metas-vendedores-tbody');
  if (!tbody) return;
  const vendedores = cache.vendedores || [];
  const metas = cache.metas || [];
  if (vendedores.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum vendedor carregado.</td></tr>';
    return;
  }
  tbody.innerHTML = vendedores.map(v => {
    const linha = metas.find(m => m.vendedor_id === v.id) || {};
    const isInterno = v.tipo === 'interno';
    const tipoLabel = isInterno
      ? '<span class="adm-badge interno">Interno</span>'
      : '<span class="adm-badge externo">Externo</span>';
    const inputM = (campo, valor) => `<input type="number" min="0" step="1" style="width:90px;" id="cfg-meta-${v.id}-${campo}" value="${valor ?? ''}" placeholder="—" ${isInterno ? '' : 'disabled'}>`;
    const inputVendas = `<input type="number" min="0" step="1" style="width:110px;" id="cfg-meta-${v.id}-vendas" value="${linha.meta_vendas ?? ''}" placeholder="—" ${isInterno ? 'disabled' : ''}>`;
    return `<tr data-vendedor-id="${v.id}" data-tipo="${v.tipo}">
      <td><strong>${v.nome}</strong></td>
      <td>${tipoLabel}</td>
      <td>${inputM('m3', linha.meta_m3)}</td>
      <td>${inputM('m2', linha.meta_m2)}</td>
      <td>${inputM('m1', linha.meta_m1)}</td>
      <td>${inputVendas}</td>
    </tr>`;
  }).join('');
}

// Lê um <input> numérico e valida: vazio é permitido (= "não definir"),
// preenchido precisa ser inteiro >= 0. Retorna null se inválido.
function lerMetaInput(id) {
  const el = document.getElementById(id);
  if (!el) return { ok: true, valor: null };
  const raw = el.value.trim();
  if (raw === '') return { ok: true, valor: null };
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0) return { ok: false, valor: null };
  return { ok: true, valor: num };
}

// Salva/atualiza a meta da filial do mês/ano atual (metas_filial).
// Usa o registro já carregado em _cache.metasFilial para decidir entre
// UPDATE (se já existir) ou INSERT (se ainda não existir) — equivalente
// a um upsert, sem depender de um nome de constraint que não foi informado.
async function salvarMetaFilial(dados) {
  // dados chega com nomes internos (semanal_m3, mensal_m3, ...) —
  // convertidos aqui para os nomes reais das colunas do Supabase
  // (meta_semanal_m3, meta_mensal_m3, ...) antes de update/insert.
  const dadosSupabase = {
    meta_semanal_m3: dados.semanal_m3,
    meta_semanal_m2: dados.semanal_m2,
    meta_semanal_m1: dados.semanal_m1,
    meta_mensal_m3: dados.mensal_m3,
    meta_mensal_m2: dados.mensal_m2,
    meta_mensal_m1: dados.mensal_m1,
  };
  const existente = _cache.metasFilial;
  if (existente && existente.id) {
    const { error } = await window._supabase.from('metas_filial').update(dadosSupabase).eq('id', existente.id);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível salvar a meta da filial.'); }
  } else {
    const payload = { mes: _cache.mes.mesNum, ano: _cache.mes.ano, ...dadosSupabase };
    const { error } = await window._supabase.from('metas_filial').insert([payload]);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível criar a meta da filial.'); }
  }
}

// Salva/atualiza a meta individual de um vendedor no mês/ano atual (metas).
// Mesma lógica de UPDATE-ou-INSERT (equivalente a upsert) do item acima.
async function salvarMetaVendedor(vendedor_id, dados) {
  const payload = { vendedor_id, mes: _cache.mes.mesNum, ano: _cache.mes.ano, ...dados };
  const { error } = await window._supabase
    .from('metas')
    .upsert(payload, { onConflict: 'vendedor_id,mes,ano' });
  if (error) {
    console.error('[salvarMetaVendedor] code:', error.code);
    console.error('[salvarMetaVendedor] message:', error.message);
    console.error('[salvarMetaVendedor] details:', error.details);
    console.error('[salvarMetaVendedor] hint:', error.hint);
    console.error('[salvarMetaVendedor] payload:', payload);
    throw new Error('Não foi possível salvar a meta do vendedor.');
  }
}

// Handler do botão "💾 Salvar Metas": valida tudo primeiro, só then salva
// no Supabase e só then chama carregarDados() para refletir os novos
// valores em toda a interface (pública e administrativa).
async function handleSalvarMetas() {
  if (!_dadosCarregados) { showToast('Os dados ainda não foram carregados do Supabase.', 'warning'); return; }

  // 1) Ler e validar a Meta da Filial
  const camposFilial = ['cfg-fil-sem-m3', 'cfg-fil-sem-m2', 'cfg-fil-sem-m1', 'cfg-fil-mes-m3', 'cfg-fil-mes-m2', 'cfg-fil-mes-m1'];
  const leiturasFilial = camposFilial.map(lerMetaInput);
  if (leiturasFilial.some(l => !l.ok)) {
    showToast('Preencha as metas da filial com números inteiros maiores ou iguais a zero (ou deixe em branco).', 'warning');
    return;
  }
  const dadosFilial = {
    semanal_m3: leiturasFilial[0].valor, semanal_m2: leiturasFilial[1].valor, semanal_m1: leiturasFilial[2].valor,
    mensal_m3: leiturasFilial[3].valor, mensal_m2: leiturasFilial[4].valor, mensal_m1: leiturasFilial[5].valor,
  };

  // 2) Ler e validar as metas individuais de cada vendedor
  const linhas = document.querySelectorAll('#cfg-metas-vendedores-tbody tr[data-vendedor-id]');
  const vendedoresParaSalvar = [];
  for (const linha of linhas) {
    const vendedor_id = linha.dataset.vendedorId;
    const tipo = linha.dataset.tipo;
    const m3 = lerMetaInput(`cfg-meta-${vendedor_id}-m3`);
    const m2 = lerMetaInput(`cfg-meta-${vendedor_id}-m2`);
    const m1 = lerMetaInput(`cfg-meta-${vendedor_id}-m1`);
    const vendas = lerMetaInput(`cfg-meta-${vendedor_id}-vendas`);
    if (!m3.ok || !m2.ok || !m1.ok || !vendas.ok) {
      showToast('Preencha as metas individuais com números inteiros maiores ou iguais a zero (ou deixe em branco).', 'warning');
      return;
    }
    const dados = tipo === 'interno'
      ? { meta_m3: m3.valor, meta_m2: m2.valor, meta_m1: m1.valor }
      : { meta_vendas: vendas.valor };
    vendedoresParaSalvar.push({ vendedor_id, dados });
  }

  // 3) Só depois de validar tudo, gravar no Supabase
  try {
    await salvarMetaFilial(dadosFilial);
    for (const v of vendedoresParaSalvar) {
      await salvarMetaVendedor(v.vendedor_id, v.dados);
    }
    // 4) Só depois de tudo salvo com sucesso, recarregar os dados reais
    await carregarDados();
    showToast('Metas atualizadas com sucesso!', 'success');
  } catch (err) {
    console.error('[handleSalvarMetas]', err);
    showToast('Não foi possível salvar as metas. Verifique a conexão com o Supabase.', 'error');
  }
}

// ── Inicializar totalizador quando a seção for aberta ────────────
// (chamado pelo adm_navigateTo, veja listener abaixo)

