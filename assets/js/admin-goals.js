// Configuração de metas de vendas, renovações e cancelamentos.
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
// Mantém os nomes de campo usados pelos cards públicos. Ao salvar o mês
// atual, os valores entram no cache e a interface reflete a mudança sem
// refazer todas as consultas do painel.
// ================================================================

let _cancelamentosPeriodoReq = 0;
let _metasVendasPeriodoReq = 0;
let _metasRenovacaoPeriodoReq = 0;

function periodoAtualMetas() {
  const periodo = _cache?.mes || calcularPeriodoMes();
  const mes = Number(periodo.mesNum || periodo.mes);
  return { ano: Number(periodo.ano), mes, mesNum: mes, chave: `${periodo.ano}-${String(mes).padStart(2, '0')}` };
}

function lerPeriodoMetas(id) {
  const chave = document.getElementById(id)?.value || '';
  const partes = /^(\d{4})-(\d{2})$/.exec(chave);
  if (!partes) return null;
  const ano = Number(partes[1]);
  const mes = Number(partes[2]);
  if (mes < 1 || mes > 12) return null;
  return { ano, mes, mesNum: mes, chave };
}

function rotuloPeriodoMeta(periodo) {
  const nome = new Date(periodo.ano, periodo.mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function preencherMetasVendas(cache, periodo) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val == null ? '' : String(val); };
  const label = rotuloPeriodoMeta(periodo);
  setText('cfg-fil-periodo', label);
  setText('cfg-ind-periodo', label);

  const mf = cache.metasFilial;
  setVal('cfg-fil-sem-m3', mf?.semanal_m3);
  setVal('cfg-fil-sem-m2', mf?.semanal_m2);
  setVal('cfg-fil-sem-m1', mf?.semanal_m1);
  setVal('cfg-fil-mes-m3', mf?.mensal_m3);
  setVal('cfg-fil-mes-m2', mf?.mensal_m2);
  setVal('cfg-fil-mes-m1', mf?.mensal_m1);

  const vendedores = cache.vendedores || [];
  const metas = cache.metas || [];
  const internos = vendedores.filter(v => v.tipo === 'interno' && v.ativo !== false);
  const externos = vendedores.filter(v => v.tipo === 'externo' && v.ativo !== false);
  const setCount = (id, count) => { const el = document.getElementById(id); if (el) el.textContent = String(count); };
  setCount('cfg-meta-interno-count', internos.length);
  setCount('cfg-meta-externo-count', externos.length);
  const obterMetaPadrao = (grupo, campo) => {
    const valores = grupo.map(v => metas.find(m => String(m.vendedor_id) === String(v.id))?.[campo]).filter(v => v !== null && v !== undefined && v !== '');
    if (!valores.length) return null;
    const frequencias = new Map();
    valores.forEach(valor => frequencias.set(String(valor), (frequencias.get(String(valor)) || 0) + 1));
    return valores.find(valor => frequencias.get(String(valor)) === Math.max(...frequencias.values()));
  };
  setVal('cfg-meta-interno-m3', obterMetaPadrao(internos, 'meta_m3'));
  setVal('cfg-meta-interno-m2', obterMetaPadrao(internos, 'meta_m2'));
  setVal('cfg-meta-interno-m1', obterMetaPadrao(internos, 'meta_m1'));
  setVal('cfg-meta-externo-vendas', obterMetaPadrao(externos, 'meta_vendas'));
  const botao = document.getElementById('cfg-vendas-salvar');
  if (botao) botao.disabled = false;
}

async function carregarMetasVendasPeriodoSelecionado() {
  const entrada = document.getElementById('cfg-vendas-mes');
  if (!entrada || !_dadosCarregados) return;
  const periodo = lerPeriodoMetas('cfg-vendas-mes');
  const atual = periodoAtualMetas();
  if (!periodo || periodo.chave < '2026-10' || periodo.chave > atual.chave) {
    showToast('Selecione um mês válido entre outubro de 2026 e o mês atual.', 'warning');
    return;
  }
  const sequencia = ++_metasVendasPeriodoReq;
  const botao = document.getElementById('cfg-vendas-salvar');
  if (botao) botao.disabled = true;
  ['cfg-fil-sem-m3', 'cfg-fil-sem-m2', 'cfg-fil-sem-m1', 'cfg-fil-mes-m3', 'cfg-fil-mes-m2', 'cfg-fil-mes-m1', 'cfg-meta-interno-m3', 'cfg-meta-interno-m2', 'cfg-meta-interno-m1', 'cfg-meta-externo-vendas']
    .forEach(id => { const campo = document.getElementById(id); if (campo) campo.value = ''; });
  const label = rotuloPeriodoMeta(periodo);
  setVendasPeriodoLabel(label);
  try {
    let cache;
    if (periodo.chave === atual.chave) {
      cache = _cache;
    } else {
      const vendedores = _cache.vendedores || [];
      const ids = vendedores.map(v => v.id);
      const [filialResult, metasResult] = await Promise.all([
        window._supabase.from('metas_filial').select('*')
          .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', periodo.mes).eq('ano', periodo.ano).maybeSingle(),
        ids.length
          ? window._supabase.from('metas').select('*').in('vendedor_id', ids).eq('mes', periodo.mes).eq('ano', periodo.ano)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (filialResult.error) throw filialResult.error;
      if (metasResult.error) throw metasResult.error;
      const row = filialResult.data;
      cache = {
        ..._cache,
        metasFilial: row ? {
          id: row.id, mes: row.mes, ano: row.ano,
          semanal_m3: row.meta_semanal_m3, semanal_m2: row.meta_semanal_m2, semanal_m1: row.meta_semanal_m1,
          mensal_m3: row.meta_mensal_m3, mensal_m2: row.meta_mensal_m2, mensal_m1: row.meta_mensal_m1,
        } : null,
        metas: metasResult.data || [],
      };
    }
    if (sequencia !== _metasVendasPeriodoReq || entrada.value !== periodo.chave) return;
    preencherMetasVendas(cache, periodo);
  } catch (erro) {
    console.error('[carregarMetasVendasPeriodoSelecionado]', erro);
    showToast('Não foi possível carregar as metas de vendas deste mês.', 'error');
  }
}

function setVendasPeriodoLabel(label) {
  ['cfg-fil-periodo', 'cfg-ind-periodo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

async function carregarMetasRenovacaoPeriodoSelecionado() {
  const entrada = document.getElementById('cfg-renov-mes');
  if (!entrada || !_dadosCarregados) return;
  const periodo = lerPeriodoMetas('cfg-renov-mes');
  const atual = periodoAtualMetas();
  if (!periodo || periodo.chave < '2026-10' || periodo.chave > atual.chave) {
    showToast('Selecione um mês válido entre outubro de 2026 e o mês atual.', 'warning');
    return;
  }
  const sequencia = ++_metasRenovacaoPeriodoReq;
  const label = rotuloPeriodoMeta(periodo);
  const titulo = document.getElementById('cfg-renov-periodo');
  if (titulo) titulo.textContent = label;
  const botao = document.getElementById('cfg-renov-salvar');
  if (botao) botao.disabled = true;
  ['m3', 'm2', 'm1'].forEach(nivel => { const campo = document.getElementById(`cfg-renov-${nivel}`); if (campo) campo.value = ''; });
  try {
    let metas;
    if (periodo.chave === atual.chave) {
      metas = _cache.metasRenovacaoFilial || {
        meta_m3: _cache.metasRenovCancel?.renovacoes_m3,
        meta_m2: _cache.metasRenovCancel?.renovacoes_m2,
        meta_m1: _cache.metasRenovCancel?.renovacoes_m1,
      };
    } else {
      const { data, error } = await window._supabase.from('metas_renovacao_filial')
        .select('meta_m3,meta_m2,meta_m1')
        .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', periodo.mes).eq('ano', periodo.ano).maybeSingle();
      if (error) throw error;
      metas = data;
    }
    if (sequencia !== _metasRenovacaoPeriodoReq || entrada.value !== periodo.chave) return;
    ['m3', 'm2', 'm1'].forEach(nivel => {
      const campo = document.getElementById(`cfg-renov-${nivel}`);
      if (campo) campo.value = metas?.[`meta_${nivel}`] == null ? '' : String(metas[`meta_${nivel}`]);
    });
    if (botao) botao.disabled = false;
  } catch (erro) {
    console.error('[carregarMetasRenovacaoPeriodoSelecionado]', erro);
    showToast('Não foi possível carregar as metas de renovação deste mês.', 'error');
  }
}

function periodoSelecionadoCancelamentos() {
  const valor = document.getElementById('cfg-cancel-mes')?.value || '';
  const partes = /^(\d{4})-(\d{2})$/.exec(valor);
  if (!partes) return null;
  return { ano: Number(partes[1]), mes: Number(partes[2]), chave: valor };
}

// Atualiza a interface com os valores que acabaram de ser gravados, sem
// reler vendas, gráficos e demais tabelas do painel.
function aplicarMetasVendasNoCache(periodo, dadosFilial, vendedoresSalvos) {
  const mes = Number(periodo.mesNum || periodo.mes);
  _cache.metasFilial = {
    ...(_cache.metasFilial || {}),
    ...dadosFilial,
    mes,
    ano: Number(periodo.ano),
  };
  const metasPorId = new Map((_cache.metas || []).map(meta => [String(meta.vendedor_id), meta]));
  vendedoresSalvos.forEach(({ vendedor_id, dados }) => {
    const chave = String(vendedor_id);
    metasPorId.set(chave, {
      ...(metasPorId.get(chave) || {}),
      vendedor_id,
      mes,
      ano: Number(periodo.ano),
      ...dados,
    });
  });
  _cache.metas = [...metasPorId.values()];
  renderAll(_cache);
}

async function carregarCancelamentosPeriodoSelecionado() {
  const entrada = document.getElementById('cfg-cancel-mes');
  if (!entrada || !_dadosCarregados) return;
  const periodo = periodoSelecionadoCancelamentos();
  if (!periodo || periodo.mes < 1 || periodo.mes > 12) return;

  const agora = _cache.mes || calcularPeriodoMes();
  const chaveAtual = `${agora.ano}-${String(agora.mesNum || agora.mes).padStart(2, '0')}`;
  const atual = periodo.chave === chaveAtual;
  const sequencia = ++_cancelamentosPeriodoReq;
  const nomeMes = new Date(periodo.ano, periodo.mes - 1, 1)
    .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const label = document.getElementById('cfg-cancel-periodo');
  if (label) label.textContent = nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1);

  try {
    const dados = atual ? (_cache.metasRenovCancel || null) : await loadMetasRenovCancel(periodo.mes, periodo.ano);
    if (sequencia !== _cancelamentosPeriodoReq || entrada.value !== periodo.chave) return;
    const setVal = (id, val) => {
      const campo = document.getElementById(id);
      if (campo) campo.value = val == null ? '' : String(val);
    };
    setVal('cfg-cancel-m1', dados?.cancelamentos_m1);
    setVal('cfg-cancel-m2', dados?.cancelamentos_m2);
    setVal('cfg-cancel-m3', dados?.cancelamentos_m3);
    setVal('cfg-cancel-atual', dados?.cancelamentos_atual);
  } catch (erro) {
    console.error('[carregarCancelamentosPeriodoSelecionado]', erro);
    showToast('Não foi possível carregar os cancelamentos deste mês.', 'error');
  }
}

// Preenche o formulário (filial + tabela de vendedores) com os dados
// já carregados em _cache — não faz nenhuma consulta nova ao Supabase.
function renderConfigMetas(cache) {
  const mesLabel = (cache.mes && cache.mes.mesNome)
    ? (cache.mes.mesNome.charAt(0).toUpperCase() + cache.mes.mesNome.slice(1)) + '/' + cache.mes.ano
    : '—';
  const periodoActual = periodoAtualMetas();
  const selectorVendas = document.getElementById('cfg-vendas-mes');
  if (selectorVendas) {
    selectorVendas.max = periodoActual.chave;
    selectorVendas.min = '2026-10';
    if (!selectorVendas.value) selectorVendas.value = periodoActual.chave;
    window.atualizarSeletorMesADM?.(selectorVendas);
    const periodoVendas = lerPeriodoMetas('cfg-vendas-mes');
    if (periodoVendas?.chave === periodoActual.chave) preencherMetasVendas(cache, periodoVendas);
    else if (periodoVendas) carregarMetasVendasPeriodoSelecionado();
  } else {
    preencherMetasVendas(cache, periodoActual);
  }

  const selectorRenovacao = document.getElementById('cfg-renov-mes');
  if (selectorRenovacao) {
    selectorRenovacao.max = periodoActual.chave;
    selectorRenovacao.min = '2026-10';
    if (!selectorRenovacao.value) selectorRenovacao.value = periodoActual.chave;
    window.atualizarSeletorMesADM?.(selectorRenovacao);
    const periodoRenovacao = lerPeriodoMetas('cfg-renov-mes');
    const tituloRenovacao = document.getElementById('cfg-renov-periodo');
    if (tituloRenovacao && periodoRenovacao) tituloRenovacao.textContent = rotuloPeriodoMeta(periodoRenovacao);
    if (periodoRenovacao?.chave === periodoActual.chave) {
      const metas = cache.metasRenovacaoFilial || {
        meta_m3: cache.metasRenovCancel?.renovacoes_m3,
        meta_m2: cache.metasRenovCancel?.renovacoes_m2,
        meta_m1: cache.metasRenovCancel?.renovacoes_m1,
      };
      ['m3', 'm2', 'm1'].forEach(nivel => {
        const campo = document.getElementById(`cfg-renov-${nivel}`);
        if (campo) campo.value = metas?.[`meta_${nivel}`] == null ? '' : String(metas[`meta_${nivel}`]);
      });
      const botao = document.getElementById('cfg-renov-salvar');
      if (botao) botao.disabled = false;
    } else if (periodoRenovacao) carregarMetasRenovacaoPeriodoSelecionado();
  }

  const periodoCancelamento = document.getElementById('cfg-cancel-periodo');
  if (periodoCancelamento) periodoCancelamento.textContent = mesLabel;
  const seletorCancel = document.getElementById('cfg-cancel-mes');
  if (seletorCancel) {
    seletorCancel.max = periodoActual.chave;
    if (!seletorCancel.value) seletorCancel.value = periodoActual.chave;
    window.atualizarSeletorMesADM?.(seletorCancel);
  }

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = (val === null || val === undefined) ? '' : val; };

  const rc = cache.metasRenovCancel;
  const periodoCancel = periodoSelecionadoCancelamentos();
  if (periodoCancel?.chave === periodoActual.chave) {
    setVal('cfg-cancel-m3', rc?.cancelamentos_m3);
    setVal('cfg-cancel-m2', rc?.cancelamentos_m2);
    setVal('cfg-cancel-m1', rc?.cancelamentos_m1);
    setVal('cfg-cancel-atual', rc?.cancelamentos_atual);
  } else if (periodoCancel) {
    carregarCancelamentosPeriodoSelecionado();
  }

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

// Salva/atualiza a meta da filial no período escolhido.
async function salvarMetaFilial(dados, periodo = _cache.mes) {
  // dados chega com nomes internos (semanal_m3, mensal_m3, ...) —
  // convertidos aqui para os nomes reais das colunas do Supabase
  // (meta_semanal_m3, meta_mensal_m3, ...) antes de update/insert.
  const dadosSupabase = {
    // As colunas de metas_filial são NOT NULL no Supabase: campo em branco
    // vai como 0 (o site já trata 0 como "meta não definida" e mostra "—").
    meta_semanal_m3: dados.semanal_m3 ?? 0,
    meta_semanal_m2: dados.semanal_m2 ?? 0,
    meta_semanal_m1: dados.semanal_m1 ?? 0,
    meta_mensal_m3: dados.mensal_m3 ?? 0,
    meta_mensal_m2: dados.mensal_m2 ?? 0,
    meta_mensal_m1: dados.mensal_m1 ?? 0,
  };
  const mes = Number(periodo.mesNum || periodo.mes);
  const { data: existente, error: erroBusca } = await window._supabase.from('metas_filial')
    .select('id').eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', periodo.ano).maybeSingle();
  if (erroBusca) throw new Error('Não foi possível consultar a meta da filial: ' + erroBusca.message);
  if (existente?.id) {
    const { error } = await window._supabase.from('metas_filial').update(dadosSupabase).eq('id', existente.id);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível salvar a meta da filial: ' + error.message); }
  } else {
    const payload = { filial_id: window.FILIAL_ATUAL_ID, mes, ano: periodo.ano, ...dadosSupabase };
    const { error } = await window._supabase.from('metas_filial').insert([payload]);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível criar a meta da filial: ' + error.message); }
  }
}

// Salva/atualiza a meta individual de um vendedor no período escolhido.
async function salvarMetaVendedor(vendedor_id, dados, periodo = _cache.mes) {
  const payload = { vendedor_id, mes: Number(periodo.mesNum || periodo.mes), ano: periodo.ano, ...dados };
  // UPDATE-ou-INSERT (não depende de constraint única para o upsert):
  // procura a linha do vendedor no mês/ano; se existir atualiza, senão cria.
  const { data: existente, error: errBusca } = await window._supabase
    .from('metas')
    .select('id')
    .eq('vendedor_id', vendedor_id)
    .eq('mes', payload.mes)
    .eq('ano', payload.ano)
    .limit(1);
  let error = errBusca;
  if (!error) {
    if (existente && existente.length) {
      ({ error } = await window._supabase.from('metas').update(dados).eq('id', existente[0].id));
    } else {
      ({ error } = await window._supabase.from('metas').insert([payload]));
    }
  }
  if (error) {
    console.error('[salvarMetaVendedor] code:', error.code);
    console.error('[salvarMetaVendedor] message:', error.message);
    console.error('[salvarMetaVendedor] details:', error.details);
    console.error('[salvarMetaVendedor] hint:', error.hint);
    console.error('[salvarMetaVendedor] payload:', payload);
    throw new Error('Não foi possível salvar a meta do vendedor: ' + (error.message || error.code));
  }
}

// Salva os limites e o total manual de cancelamentos. Os campos antigos de
// renovação são mantidos intactos somente para compatibilidade durante a migração.
async function salvarMetaRenovCancel(dados, periodo = _cache.mes, existentePeriodo = _cache.metasRenovCancel) {
  const legado = existentePeriodo || {};
  const dadosSupabase = {
    renovacoes_meta_m3: dados.renovacoes_m3 ?? legado.renovacoes_m3 ?? 0,
    renovacoes_meta_m2: dados.renovacoes_m2 ?? legado.renovacoes_m2 ?? 0,
    renovacoes_meta_m1: dados.renovacoes_m1 ?? legado.renovacoes_m1 ?? 0,
    renovacoes_atual: legado.renovacoes_atual ?? 0,
    cancelamentos_meta_m3: dados.cancelamentos_m3 ?? legado.cancelamentos_m3 ?? 0,
    cancelamentos_meta_m2: dados.cancelamentos_m2 ?? legado.cancelamentos_m2 ?? 0,
    cancelamentos_meta_m1: dados.cancelamentos_m1 ?? legado.cancelamentos_m1 ?? 0,
    cancelamentos_atual: dados.cancelamentos_atual ?? legado.cancelamentos_atual ?? 0,
  };
  const existente = existentePeriodo;
  if (existente && existente.id) {
    const { error } = await window._supabase.from('metas_renovacao_cancelamento').update(dadosSupabase).eq('id', existente.id);
    if (error) { console.error('[salvarMetaRenovCancel]', error); throw new Error('Não foi possível salvar as metas de renovação/cancelamento: ' + error.message); }
  } else {
    const payload = { filial_id: window.FILIAL_ATUAL_ID, mes: periodo.mesNum || periodo.mes, ano: periodo.ano, ...dadosSupabase };
    const { error } = await window._supabase.from('metas_renovacao_cancelamento').insert([payload]);
    if (error) { console.error('[salvarMetaRenovCancel]', error); throw new Error('Não foi possível criar as metas de renovação/cancelamento: ' + error.message); }
  }
}

async function salvarMetaRenovacaoFilial(dados, periodo = _cache.mes) {
  const payload = {
    filial_id: window.FILIAL_ATUAL_ID,
    mes: Number(periodo.mesNum || periodo.mes),
    ano: periodo.ano,
    meta_m3: dados.meta_m3 ?? null,
    meta_m2: dados.meta_m2 ?? null,
    meta_m1: dados.meta_m1 ?? null,
    atualizado_em: new Date().toISOString(),
  };
  const { error } = await window._supabase.from('metas_renovacao_filial')
    .upsert(payload, { onConflict: 'filial_id,mes,ano' });
  if (error) throw error;
}

// Handler do botão "💾 Salvar Metas": valida tudo primeiro, só then salva
// no Supabase e só then chama carregarDados() para refletir os novos
// valores em toda a interface (pública e administrativa).
async function handleSalvarMetas() {
  if (!_dadosCarregados) { showToast('Os dados ainda não foram carregados do Supabase.', 'warning'); return; }
  const periodo = document.getElementById('cfg-vendas-mes') ? lerPeriodoMetas('cfg-vendas-mes') : periodoAtualMetas();
  if (!periodo) { showToast('Selecione um mês válido para as metas de vendas.', 'warning'); return; }
  const periodoAtual = periodoAtualMetas();
  if (periodo.chave < '2026-10' || periodo.chave > periodoAtual.chave) { showToast('Selecione um mês entre outubro de 2026 e o mês atual.', 'warning'); return; }

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

  // 2) Ler uma vez as metas padrão de cada tipo e replicar para o grupo.
  const camposPorTipo = ['cfg-meta-interno-m3', 'cfg-meta-interno-m2', 'cfg-meta-interno-m1', 'cfg-meta-externo-vendas'];
  const metasTipo = camposPorTipo.map(lerMetaInput);
  if (metasTipo.some(item => !item.ok)) {
    showToast('Informe metas por tipo como números inteiros maiores ou iguais a zero (ou deixe em branco).', 'warning');
    return;
  }
  const internos = (_cache.vendedores || []).filter(v => v.tipo === 'interno' && v.ativo !== false);
  const externos = (_cache.vendedores || []).filter(v => v.tipo === 'externo' && v.ativo !== false);
  const vendedoresParaSalvar = [];
  internos.forEach(v => vendedoresParaSalvar.push({ vendedor_id: v.id, dados: { meta_m3: metasTipo[0].valor, meta_m2: metasTipo[1].valor, meta_m1: metasTipo[2].valor } }));
  externos.forEach(v => vendedoresParaSalvar.push({ vendedor_id: v.id, dados: { meta_vendas: metasTipo[3].valor } }));

  // 3) Só depois de validar tudo, gravar as metas de vendas.
  const botao = document.getElementById('cfg-vendas-salvar');
  if (botao) botao.disabled = true;
  try {
    await salvarMetaFilial(dadosFilial, periodo);
    for (const v of vendedoresParaSalvar) {
      await salvarMetaVendedor(v.vendedor_id, v.dados, periodo);
    }
    if (periodo.chave === periodoAtual.chave) {
      aplicarMetasVendasNoCache(periodo, dadosFilial, vendedoresParaSalvar);
    } else await carregarMetasVendasPeriodoSelecionado();
    showToast(`Metas de vendas de ${rotuloPeriodoMeta(periodo)} aplicadas a ${internos.length} interno(s) e ${externos.length} externo(s).`, 'success');
  } catch (err) {
    console.error('[handleSalvarMetas]', err);
    showToast((err && err.message) ? err.message : 'Não foi possível salvar as metas. Verifique a conexão com o Supabase.', 'error');
  } finally {
    if (botao) botao.disabled = false;
  }
}

async function handleSalvarCancelamentos() {
  if (!_dadosCarregados) { showToast('Os dados ainda não foram carregados do Supabase.', 'warning'); return; }
  const periodoSelecionado = periodoSelecionadoCancelamentos();
  if (!periodoSelecionado || periodoSelecionado.mes < 1 || periodoSelecionado.mes > 12) {
    showToast('Selecione um mês válido para registrar os cancelamentos.', 'warning');
    return;
  }
  const periodoAtual = _cache.mes || calcularPeriodoMes();
  const chaveAtual = `${periodoAtual.ano}-${String(periodoAtual.mesNum || periodoAtual.mes).padStart(2, '0')}`;
  if (periodoSelecionado.chave > chaveAtual) {
    showToast('Não é possível registrar cancelamentos para um mês futuro.', 'warning');
    return;
  }

  const campos = ['cfg-cancel-m1', 'cfg-cancel-m2', 'cfg-cancel-m3', 'cfg-cancel-atual'];
  const leituras = campos.map(lerMetaInput);
  if (leituras.some(item => !item.ok)) {
    showToast('Preencha metas e total de cancelamentos com números inteiros maiores ou iguais a zero (ou deixe em branco).', 'warning');
    return;
  }

  const botao = document.getElementById('cfg-cancel-salvar');
  const textoOriginal = botao?.textContent || 'Salvar cancelamentos deste mês';
  if (botao) { botao.disabled = true; botao.textContent = 'Salvando…'; }
  try {
    const { data: linhaExistente, error: erroBusca } = await window._supabase
      .from('metas_renovacao_cancelamento')
      .select('*')
      .eq('filial_id', window.FILIAL_ATUAL_ID)
      .eq('mes', periodoSelecionado.mes)
      .eq('ano', periodoSelecionado.ano)
      .maybeSingle();
    if (erroBusca) throw new Error('Não foi possível consultar o mês selecionado: ' + erroBusca.message);
    const existente = linhaExistente ? {
      id: linhaExistente.id,
      mes: linhaExistente.mes,
      ano: linhaExistente.ano,
      renovacoes_m3: linhaExistente.renovacoes_meta_m3,
      renovacoes_m2: linhaExistente.renovacoes_meta_m2,
      renovacoes_m1: linhaExistente.renovacoes_meta_m1,
      renovacoes_atual: linhaExistente.renovacoes_atual,
      cancelamentos_m3: linhaExistente.cancelamentos_meta_m3,
      cancelamentos_m2: linhaExistente.cancelamentos_meta_m2,
      cancelamentos_m1: linhaExistente.cancelamentos_meta_m1,
      cancelamentos_atual: linhaExistente.cancelamentos_atual,
    } : null;
    const dados = {
      cancelamentos_m1: leituras[0].valor,
      cancelamentos_m2: leituras[1].valor,
      cancelamentos_m3: leituras[2].valor,
      cancelamentos_atual: leituras[3].valor,
    };
    await salvarMetaRenovCancel(dados, { mes: periodoSelecionado.mes, mesNum: periodoSelecionado.mes, ano: periodoSelecionado.ano }, existente);
    const periodoAtualEhSelecionado = periodoSelecionado.chave === chaveAtual;
    if (periodoAtualEhSelecionado) {
      _cache.metasRenovCancel = {
        ...(existente || {}),
        ...dados,
        mes: periodoSelecionado.mes,
        ano: periodoSelecionado.ano,
      };
      renderAll(_cache);
    } else await carregarCancelamentosPeriodoSelecionado();
    const nomeMes = new Date(periodoSelecionado.ano, periodoSelecionado.mes - 1, 1)
      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    showToast(`Cancelamentos de ${nomeMes} salvos.`, 'success');
  } catch (erro) {
    console.error('[handleSalvarCancelamentos]', erro);
    showToast(erro?.message || 'Não foi possível salvar os cancelamentos deste mês.', 'error');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal; }
  }
}

async function handleSalvarMetasRenovacao() {
  if (!_dadosCarregados) { showToast('Os dados ainda não foram carregados do Supabase.', 'warning'); return; }
  const periodo = document.getElementById('cfg-renov-mes') ? lerPeriodoMetas('cfg-renov-mes') : periodoAtualMetas();
  if (!periodo) { showToast('Selecione um mês válido para as metas de renovação.', 'warning'); return; }
  const periodoAtual = periodoAtualMetas();
  if (periodo.chave < '2026-10' || periodo.chave > periodoAtual.chave) { showToast('Selecione um mês entre outubro de 2026 e o mês atual.', 'warning'); return; }
  const ids = ['cfg-renov-m3', 'cfg-renov-m2', 'cfg-renov-m1'];
  const valores = ids.map(lerMetaInput);
  if (valores.some(item => !item.ok)) {
    showToast('Informe metas de renovação como números inteiros iguais ou maiores que zero.', 'warning');
    return;
  }
  const botao = document.getElementById('cfg-renov-salvar');
  if (botao) botao.disabled = true;
  try {
    await salvarMetaRenovacaoFilial({ meta_m3: valores[0].valor, meta_m2: valores[1].valor, meta_m1: valores[2].valor }, periodo);
    const internos = (_cache.vendedores || []).filter(v => v.tipo === 'interno' && v.ativo !== false);
    const metasCompartilhadas = internos.map(v => ({
      filial_id: Number(v.filial_id || window.FILIAL_ATUAL_ID),
      vendedor_id: Number(v.id),
      mes: periodo.mesNum || periodo.mes,
      ano: periodo.ano,
      meta_m3: valores[0].valor,
      meta_m2: valores[1].valor,
      meta_m1: valores[2].valor,
      atualizado_em: new Date().toISOString(),
    }));
    if (metasCompartilhadas.length) {
      const { error } = await window._supabase.from('metas_renovacao_individual')
        .upsert(metasCompartilhadas, { onConflict: 'vendedor_id,mes,ano' });
      if (error) throw new Error('As metas gerais foram salvas, mas não foi possível aplicá-las a todos os vendedores: ' + error.message);
    }
    if (periodo.chave === periodoAtual.chave) {
      _cache.metasRenovacaoFilial = {
        ...(_cache.metasRenovacaoFilial || {}),
        meta_m3: valores[0].valor,
        meta_m2: valores[1].valor,
        meta_m1: valores[2].valor,
        mes: Number(periodo.mesNum || periodo.mes),
        ano: Number(periodo.ano),
      };
      renderAll(_cache);
    } else await carregarMetasRenovacaoPeriodoSelecionado();
    showToast(`Metas de renovação de ${rotuloPeriodoMeta(periodo)} aplicadas igualmente a ${internos.length} vendedor(es) interno(s).`, 'success');
  } catch (err) {
    console.error('[handleSalvarMetasRenovacao]', err);
    const msg = String((err && err.message) || err);
    showToast(msg.startsWith('As metas gerais foram salvas, mas')
      ? msg
      : /metas_renovacao_filial|schema cache|does not exist/i.test(msg)
      ? 'A tabela de metas gerais ainda não existe. Execute supabase/renovacoes-mensais.sql no SQL Editor.'
      : 'Não foi possível salvar as metas de renovação: ' + msg, 'error', 9000);
  } finally {
    if (botao) botao.disabled = false;
  }
}

// ── Inicializar totalizador quando a seção for aberta ────────────
// (chamado pelo adm_navigateTo, veja listener abaixo)


document.addEventListener('DOMContentLoaded', function() {

const renovArquivoInput = document.getElementById('renov-relatorio-arquivo');
if (renovArquivoInput) renovArquivoInput.addEventListener('change', event => prepararRelatorioRenovacao(event.target.files?.[0]));
const renovMesInput = document.getElementById('renov-relatorio-mes');
if (renovMesInput && !renovMesInput.value) {
  const agora = new Date();
  renovMesInput.value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
}
if (renovMesInput) window.atualizarSeletorMesADM?.(renovMesInput);
if (renovMesInput) renovMesInput.addEventListener('change', () => { analisarLinhasRelatorioRenovacao(); carregarRelatorioResumoRenovacoes(); });

document.getElementById('adm-trigger').addEventListener('click', adm_showLogin);

document.getElementById('adm-login-back').addEventListener('click', adm_hideLogin);

document.getElementById('adm-login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const email = document.getElementById('adm-email').value.trim();
  const password = document.getElementById('adm-password').value;
  const errEl = document.getElementById('adm-login-error');
  const btn = document.getElementById('adm-login-btn');

  if (!email || !password) {
    errEl.textContent = 'Preencha e-mail e senha.';
    errEl.classList.add('visible');
    return;
  }

  btn.textContent = 'Entrando…';
  btn.classList.add('adm-loading');
  errEl.classList.remove('visible');

  try {
    await loginAdmin(email, password);
    // Recarrega vendas com a view security_invoker para que as políticas
    // regionais do administrador se apliquem também aos dados do painel.
    await carregarDados();
    adm_hideLogin();
    await adm_showPanel();
    document.getElementById('adm-user-info').innerHTML = `<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-user"></use></svg><span>${email}</span>`;
  } catch (err) {
    errEl.textContent = err.message.includes('permissão')
      ? err.message
      : err.message.includes('não inicializado')
        ? 'Preencha SUPABASE_URL e SUPABASE_ANON_KEY no código antes de usar o login.'
        : 'E-mail ou senha incorretos.';
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Entrar';
    btn.classList.remove('adm-loading');
  }
});

document.getElementById('adm-logout-btn').addEventListener('click', async () => {
  if (!confirm('Deseja sair do painel administrativo?')) return;
  try { await logoutAdmin(); } catch (_) {}
  adm_hidePanel();
});

document.querySelectorAll('.adm-nav-item[data-section]').forEach(btn => {
  btn.addEventListener('click', () => {
    adm_navigateTo(btn.dataset.section);
    if (btn.dataset.section === 'outras-filiais') {
      atualizarTotalizador();
      renderFilialLista();
    }
    if (btn.dataset.section === 'config-metas' && _dadosCarregados) {
      renderConfigMetas(_cache);
    }
    if (btn.dataset.section === 'relatorios') {
      abrirRelatorioVendas();
    }
  });
});

const admSidebarToggle = document.getElementById('adm-sidebar-toggle');
const admPanel = document.getElementById('adm-panel');
if (admSidebarToggle && admPanel) {
  try {
    if (localStorage.getItem('adm-sidebar-collapsed') === '1') admPanel.classList.add('adm-sidebar-collapsed');
  } catch (_) {}
  admSidebarToggle.addEventListener('click', () => {
    const collapsed = admPanel.classList.toggle('adm-sidebar-collapsed');
    admSidebarToggle.setAttribute('aria-pressed', String(collapsed));
    admSidebarToggle.setAttribute('aria-label', collapsed ? 'Expandir menu' : 'Recolher menu');
    admSidebarToggle.title = collapsed ? 'Expandir menu' : 'Recolher menu';
    try { localStorage.setItem('adm-sidebar-collapsed', collapsed ? '1' : '0'); } catch (_) {}
  });
}

document.getElementById('adm-rede-atualizar')?.addEventListener('click', carregarDashboardRede);
document.getElementById('adm-rede-filial')?.addEventListener('change', () => renderDashboardRede());
document.getElementById('adm-rede-exportar')?.addEventListener('click', exportarComparativoRede);

// Fechar painel com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (document.getElementById('adm-panel-overlay').classList.contains('active')) {
      if (confirm('Deseja sair do painel administrativo?')) {
        logoutAdmin().catch(() => {});
        adm_hidePanel();
      }
    } else if (document.getElementById('adm-login-overlay').classList.contains('active')) {
      adm_hideLogin();
    }
  }
});

}); // fim DOMContentLoaded

// ================================================================
// INICIALIZAÇÃO — chamada por último, depois que TODAS as constantes
// (SUPABASE_URL/SUPABASE_ANON_KEY) e funções já foram declaradas
// acima. carregarDados() já chama initSupabase() internamente.
// ================================================================
carregarDados();

// ============================================================
// MODO TV — abra o site com ?tv=1 (ex.: ...index.html?tv=1&tempo=20)
// Apresentação automática em tela cheia para a TV da loja: passa os
// painéis um a um, ajusta o tamanho à tela, atualiza os dados sozinho e
// mantém a tela acesa. Teclas: ← → (navegar) · espaço (pausar) · F (tela
// cheia) · Esc (sair). &tempo=SEGUNDOS muda a duração de cada painel.
// ============================================================
(function modoTV() {
  const params = new URLSearchParams(location.search);
  const ativo = ['1', 'true'].includes(params.get('tv'));

  if (!ativo) { // página normal: só adiciona o botão de entrada
    const linha = document.querySelector('.tabs-row');
    if (linha) {
      const u = new URL(location.href); u.searchParams.set('tv', '1');
      const a = document.createElement('a');
      a.className = 'tv-enter-btn'; a.href = u.toString();
      a.title = 'Apresentação automática para a TV da loja'; a.textContent = 'Modo TV';
      linha.appendChild(a);
    }
    return;
  }

  document.documentElement.setAttribute('data-tv', '');
  const tempo = Math.max(5, parseInt(params.get('tempo') || '15', 10) || 15) * 1000;
  const shell = document.querySelector('.page-shell');
  const porId = id => document.getElementById(id);
  const secaoDe = id => { const el = porId(id); return el ? el.closest('section') : null; };
  const E = {
    meta: porId('metaCardSection'),
    rankSemanal: document.querySelector('[data-tab-panel="semanal"]'),
    rankMensal: document.querySelector('[data-tab-panel="mensal"]'),
    filial: porId('metasFilialSection'), churn: document.querySelector('.churn-dash'),
    murais: document.querySelector('.murais-duo'), evolucao: secaoDe('evolucaoChart'),
    planos: secaoDe('donutChart'), conquistas: secaoDe('conquistasGrid'),
  };
  const slides = [
    { titulo: 'Meta da Semana', tab: 'semanal', show: ['meta'] },
    { titulo: 'Ranking Semanal', tab: 'semanal', show: ['rankSemanal'] },
    { titulo: 'Metas da Filial — Semana', tab: 'semanal', show: ['filial'] },
    { titulo: 'Meta do Mês', tab: 'mensal', show: ['meta'] },
    { titulo: 'Ranking Mensal', tab: 'mensal', show: ['rankMensal'] },
    { titulo: 'Metas da Filial — Mês', tab: 'mensal', show: ['filial'] },
    { titulo: 'Renovações e Risco de Churn', show: ['churn'] },
    { titulo: 'Murais de Destaques', show: ['murais'] },
    { titulo: 'Evolução e Planos', show: ['evolucao', 'planos'] },
    { titulo: 'Conquistas Recentes', show: ['conquistas'], vazio: () => { const g = porId('conquistasGrid'); return !g || !g.children.length; } },
  ];
  const lista = () => slides.filter(sl => !(sl.vazio && sl.vazio()));

  // ----- barra inferior -----
  const bar = document.createElement('div');
  bar.id = 'tvBar';
  bar.innerHTML = `
    <div class="tv-progress"><div class="tv-progress-fill" id="tvFill"></div></div>
    <div class="tv-bar-row">
      <div class="tv-title" id="tvTitle"></div>
      <div class="tv-dots" id="tvDots"></div>
      <div class="tv-meta"><span id="tvClock"></span><small id="tvUpd"></small></div>
      <div class="tv-ctrls">
        <button type="button" id="tvPrev" title="Anterior (←)">⏮</button>
        <button type="button" id="tvPlay" title="Pausar (espaço)">⏸</button>
        <button type="button" id="tvNext" title="Próximo (→)">⏭</button>
        <button type="button" id="tvFull" title="Tela cheia (F)">⛶</button>
        <button type="button" id="tvExit" title="Sair do modo TV (Esc)">✕</button>
      </div>
    </div>`;
  document.body.appendChild(bar);
  const hhmm = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  let atualizadoEm = new Date();
  const relogio = () => { porId('tvClock').textContent = hhmm(new Date()); porId('tvUpd').textContent = 'dados das ' + hhmm(atualizadoEm); };
  relogio(); setInterval(relogio, 20000);

  // ----- escala: o palco tem 1480px de largura e é ampliado/reduzido para caber -----
  let rafAjuste = null;
  function ajustarEscala() {
    if (!shell) return;
    shell.style.setProperty('--tv-scale', '1');
    const natW = 1480, natH = shell.offsetHeight || 1;
    const dispH = window.innerHeight - 56;
    const esc = Math.max(0.4, Math.min(window.innerWidth / natW, dispH / natH, 3));
    shell.style.setProperty('--tv-scale', esc.toFixed(3));
    shell.style.top = Math.max(0, (dispH - natH * esc) / 2) + 'px';
  }
  const agendarAjuste = () => { cancelAnimationFrame(rafAjuste); rafAjuste = requestAnimationFrame(ajustarEscala); };
  window.addEventListener('resize', agendarAjuste);
  if ('ResizeObserver' in window && shell) new ResizeObserver(agendarAjuste).observe(shell);

  // ----- rotação dos painéis -----
  let idx = -1, timer = null, pausado = false, inicio = 0, restante = tempo;
  const fill = porId('tvFill');
  function reiniciarProgresso() {
    fill.style.animation = 'none'; void fill.offsetWidth;
    fill.style.animation = `tvProgress ${tempo}ms linear forwards`;
    fill.style.animationPlayState = pausado ? 'paused' : 'running';
  }
  function agendar(ms) { clearTimeout(timer); inicio = Date.now(); restante = ms; if (!pausado) timer = setTimeout(() => mostrar(idx + 1), ms); }
  function mostrar(i) {
    const L = lista();
    idx = ((i % L.length) + L.length) % L.length;
    const sl = L[idx];
    if (sl.tab) { const b = document.querySelector(`.tab-button[data-tab="${sl.tab}"]`); if (b && !b.classList.contains('active')) b.click(); }
    Object.values(E).forEach(el => el && el.classList.remove('tv-on'));
    sl.show.forEach(k => E[k] && E[k].classList.add('tv-on'));
    porId('tvTitle').textContent = sl.titulo;
    porId('tvDots').innerHTML = L.map((_, n) => `<span class="${n === idx ? 'on' : ''}"></span>`).join('');
    ajustarEscala(); setTimeout(ajustarEscala, 350); // 2ª medição depois das animações de entrada
    reiniciarProgresso(); agendar(tempo);
  }
  function alternarPausa() {
    pausado = !pausado;
    if (pausado) { clearTimeout(timer); restante = Math.max(0, restante - (Date.now() - inicio)); }
    else { agendar(restante || tempo); }
    fill.style.animationPlayState = pausado ? 'paused' : 'running';
    porId('tvPlay').textContent = pausado ? '▶' : '⏸';
  }
  const sair = () => { const u = new URL(location.href); ['tv', 'tempo'].forEach(k => u.searchParams.delete(k)); location.href = u.toString(); };
  const telaCheia = () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch (e) {} };
  porId('tvPrev').onclick = () => mostrar(idx - 1);
  porId('tvNext').onclick = () => mostrar(idx + 1);
  porId('tvPlay').onclick = alternarPausa;
  porId('tvFull').onclick = telaCheia;
  porId('tvExit').onclick = sair;
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') mostrar(idx + 1);
    else if (e.key === 'ArrowLeft') mostrar(idx - 1);
    else if (e.key === ' ') { e.preventDefault(); alternarPausa(); }
    else if (e.key === 'f' || e.key === 'F') telaCheia();
    else if (e.key === 'Escape' && !document.fullscreenElement) sair();
  });
  // cursor e botões só aparecem quando o mouse se mexe
  let tCursor = null;
  document.addEventListener('mousemove', () => {
    document.documentElement.classList.add('tv-cursor');
    clearTimeout(tCursor); tCursor = setTimeout(() => document.documentElement.classList.remove('tv-cursor'), 3000);
  });

  // ----- manutenção: dados novos a cada 2 min, tela sempre acesa, recarga a cada 6 h -----
  setInterval(async () => {
    try { if (typeof carregarDados === 'function') { await carregarDados(); atualizadoEm = new Date(); relogio(); agendarAjuste(); } } catch (e) { console.warn('[modoTV] atualização falhou', e); }
  }, 120000);
  let wl = null;
  const manterAcesa = async () => { try { if ('wakeLock' in navigator) wl = await navigator.wakeLock.request('screen'); } catch (e) {} };
  manterAcesa();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') manterAcesa(); });
  setTimeout(() => location.reload(), 6 * 60 * 60 * 1000);

  mostrar(0);
})();
