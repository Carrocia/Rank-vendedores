// Operacoes de vendas, cadastros e renderizacao do painel administrativo.
async function saveVenda(dados) {
  // dados: { vendedor_id, plano_id, data_venda, valor, cliente, numero_venda, observacao, filial_origem_id, filial_destino_id }
  // valor = preço praticado NO MOMENTO DA VENDA (não recalcular depois)
  const { data, error } = await window._supabase
    .from('vendas')
    .insert([{
      vendedor_id: dados.vendedor_id,
      filial_origem_id: dados.filial_origem_id,
      filial_destino_id: dados.filial_destino_id,
      plano_id: dados.plano_id,
      data_venda: dados.data_venda,
      valor: dados.valor,          // snapshot do preço no momento
      cliente: dados.cliente || null,
      numero_venda: dados.numero_venda,
      observacao: dados.observacao || null,
      fora_filial: dados.fora_filial === true,
    }])
    .select()
    .single();
  if (error) {
    console.error('[saveVenda]', error);
    if (error.code === '23505') throw new Error('Este número de contrato já foi registrado.');
    throw new Error('Não foi possível registrar a venda.');
  }
  return data;
}

// ── Exclusão de venda ───────────────────────────────────────────
// Apaga primeiro os adicionais vinculados (FK venda_id) e só depois a
// venda em si, pra não esbarrar em erro de chave estrangeira caso a
// tabela não tenha ON DELETE CASCADE configurado.
async function deleteVenda(venda_id) {
  const { error: errAdic } = await window._supabase
    .from('venda_adicionais')
    .delete()
    .eq('venda_id', venda_id);
  if (errAdic) { console.error('[deleteVenda - adicionais]', errAdic); throw new Error('Não foi possível excluir os adicionais da venda.'); }

  const { error } = await window._supabase
    .from('vendas')
    .delete()
    .eq('id', venda_id);
  if (error) { console.error('[deleteVenda]', error); throw new Error('Não foi possível excluir a venda.'); }
}

// Exclusão de venda de OUTRA filial — tabelas próprias, separadas das
// vendas normais (vendas_outras_filiais / venda_outra_filial_adicionais).
async function deleteVendaOutraFilial(venda_outra_filial_id) {
  const { error: errAdic } = await window._supabase
    .from('venda_outra_filial_adicionais')
    .delete()
    .eq('venda_outra_filial_id', venda_outra_filial_id);
  if (errAdic) { console.error('[deleteVendaOutraFilial - adicionais]', errAdic); throw new Error('Não foi possível excluir os adicionais da venda.'); }

  const { error } = await window._supabase
    .from('vendas_outras_filiais')
    .delete()
    .eq('id', venda_outra_filial_id);
  if (error) { console.error('[deleteVendaOutraFilial]', error); throw new Error('Não foi possível excluir a venda.'); }
}

// Chamado pelo botão 🗑️ da tabela de relatório. tipoLinha diz qual par
// de tabelas usar (venda normal/fora da filial vs. venda de outra
// filial). Pede confirmação antes de excluir (ação irreversível),
// depois recarrega dados e relatório.
async function handleExcluirVenda(venda_id, tipoLinha) {
  if (!venda_id) return;
  const confirmado = window.confirm('Tem certeza que deseja excluir esta venda? Essa ação não pode ser desfeita.');
  if (!confirmado) return;
  try {
    if (tipoLinha === 'outra_filial') {
      await deleteVendaOutraFilial(venda_id);
    } else {
      await deleteVenda(venda_id);
    }
    showToast('Venda excluída com sucesso!', 'success');
    await carregarDados();
    if (typeof aplicarFiltrosRelatorio === 'function') await aplicarFiltrosRelatorio();
  } catch (err) {
    console.error('[handleExcluirVenda]', err);
    showToast('Não foi possível excluir a venda.', 'error');
  }
}

async function saveVendaAdicionais(venda_id, adicionais) {
  // adicionais: [{ produto_adicional_id, quantidade, valor_unitario }]
  // Cada adicional tem sua própria quantidade — NÃO multiplicar pela qtd da venda
  if (!adicionais || adicionais.length === 0) return [];
  const rows = adicionais.map(a => ({
    venda_id,
    produto_adicional_id: a.produto_adicional_id,
    quantidade: a.quantidade,          // quantidade individual do adicional
    valor_unitario: a.valor_unitario,  // snapshot do preço no momento
  }));
  const { data, error } = await window._supabase
    .from('venda_adicionais')
    .insert(rows)
    .select();
  if (error) { console.error('[saveVendaAdicionais]', error); throw new Error('Não foi possível registrar os adicionais.'); }
  return data;
}

async function saveAdicionalAvulso(dados) {
  // dados: { vendedor_id, produto_adicional_id, data_venda, quantidade, valor_unitario, observacao }
  const { data, error } = await window._supabase
    .from('adicionais_avulsos')
    .insert([{
      vendedor_id: dados.vendedor_id,
      produto_adicional_id: dados.produto_adicional_id,
      data_venda: dados.data_venda,
      quantidade: dados.quantidade,
      valor_unitario: dados.valor_unitario,
      observacao: dados.observacao || null,
    }])
    .select()
    .single();
  if (error) { console.error('[saveAdicionalAvulso]', error); throw new Error('Não foi possível registrar o adicional avulso.'); }
  return data;
}

async function registrarVendaOutraFilial(dados) {
  // NÃO pertence a nenhum vendedor — NÃO entra no ranking individual
  // ENTRA na meta global da filial
  const { data, error } = await window._supabase
    .from('vendas_outras_filiais')
    .insert([{
      filial_id: dados.filial_id,
      plano_id: dados.plano_id,
      quantidade: dados.quantidade,
      valor_unitario: dados.valor_unitario,
      valor_total: dados.valor_total,
      data_venda: dados.data_venda,
      observacao: dados.observacao || null,
    }])
    .select()
    .single();
  if (error) { console.error('[registrarVendaOutraFilial]', error); throw new Error('Não foi possível registrar a venda da filial.'); }
  return data;
}

async function saveVendaOutraFilialAdicionais(venda_outra_filial_id, adicionais) {
  if (!adicionais || adicionais.length === 0) return [];
  const rows = adicionais.map(a => ({
    venda_outra_filial_id,
    produto_adicional_id: a.produto_adicional_id,
    quantidade: a.quantidade,
    valor_unitario: a.valor_unitario,
  }));
  const { data, error } = await window._supabase
    .from('venda_outra_filial_adicionais')
    .insert(rows)
    .select();
  if (error) { console.error('[saveVendaOutraFilialAdicionais]', error); throw new Error('Não foi possível registrar os adicionais da filial.'); }
  return data;
}

// ── Cálculo de períodos ───────────────────────────────────────────
function calcularPeriodoSemana() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg...
  const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana; // retroceder até segunda
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() + diffSeg);
  seg.setHours(0, 0, 0, 0);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  dom.setHours(23, 59, 59, 999);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const labelDia = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  return {
    de: fmt(seg), ate: fmt(dom),
    inicio: seg, fim: dom,
    diasNoMs: diasCalendario(seg, dom),
    label: `${labelDia(seg)} a ${labelDia(dom)}`,
    diasLabels: dias,
    diasDatas: Array.from({length:7}, (_,i) => { const d = new Date(seg); d.setDate(seg.getDate()+i); return fmt(d); }),
  };
}

// Semana anterior (segunda a domingo) — usada para calcular a
// "Maior Evolução" real (comparação com a semana atual), sem inventar
// nenhum número: se não houver vendas na semana anterior, o delta é 0.
function calcularPeriodoSemanaAnterior() {
  const atual = calcularPeriodoSemana();
  const seg = new Date(atual.inicio);
  seg.setDate(seg.getDate() - 7);
  const dom = new Date(atual.fim);
  dom.setDate(dom.getDate() - 7);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return { de: fmt(seg), ate: fmt(dom) };
}

function calcularPeriodoMes() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based
  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return {
    de: fmt(inicio), ate: fmt(fim),
    diaAtual: hoje.getDate(),
    diasNoMes: fim.getDate(),
    diasRestantes: fim.getDate() - hoje.getDate(),
    mesNome: hoje.toLocaleDateString('pt-BR', { month: 'long' }),
    mesNum: mes + 1,
    ano,
  };
}

function diasCalendario(d1, d2) {
  return Math.round((d2 - d1) / 86400000) + 1;
}

// ── Cálculo de Ranking ────────────────────────────────────────────
// Critério 1: quantidade de vendas principais
// Critério 2 (empate): maior valor total (plano + adicionais)
function calcularRanking(vendas) {
  const agrupado = {};
  const vendedoresExternos = new Set((_cache?.vendedores || []).filter(v => v.tipo === 'externo').map(v => String(v.id)));
  for (const v of vendas) {
    const id = v.vendedor_id;
    if (id == null) continue;
    const vendaRecebidaDeOutraFilial = v.filial_origem_id != null && v.filial_destino_id != null && Number(v.filial_origem_id) !== Number(v.filial_destino_id);
    if (vendedoresExternos.has(String(id)) && (v.fora_filial === true || vendaRecebidaDeOutraFilial)) continue;
    if (!agrupado[id]) {
      agrupado[id] = {
        vendedor_id: id,
        vendas: 0,
        valor: 0,
        nome: v.vendedores?.nome || id,
        slug: v.vendedores?.slug || id
      };
    }
    // Critério 1: quantidade de vendas principais
    agrupado[id].vendas += 1;
    // Critério 2: valor total vendido
    // Inclui o plano + todos os adicionais vinculados à venda.
    agrupado[id].valor += Number(
      v.valor_total ??
      (
        Number(v.valor_plano || 0) +
        Number(v.valor_adicionais || 0)
      )
    );
  }
  return Object.values(agrupado)
    .sort((a, b) =>
      b.vendas - a.vendas ||
      b.valor - a.valor
    );
}

function calcularTotais(vendasEquipe, vendasFiliais, metaGlobal, vendasRecebidas = []) {
  const equipe = vendasEquipe.length;
  const filiaisLegado = vendasFiliais.reduce((s, v) => s + Number(v.quantidade || 1), 0);
  const filiais = filiaisLegado + vendasRecebidas.length;
  const total = equipe + filiais;
  const pct = metaGlobal > 0 ? Math.min(100, Math.round((total / metaGlobal) * 100)) : 0;
  return { equipe, filiais, total, pct, metaGlobal };
}

// ── Helpers de UI ────────────────────────────────────────────────
let _admScrollYBeforeLock = 0;

function adm_lockBackgroundScroll() {
  if (document.body.classList.contains('adm-modal-open')) return;
  _admScrollYBeforeLock = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${_admScrollYBeforeLock}px`;
  document.body.style.left = '0';
  document.body.style.right = '0';
  document.body.style.width = '100%';
  document.body.classList.add('adm-modal-open');
}

function adm_unlockBackgroundScrollIfClosed() {
  const loginAberto = document.getElementById('adm-login-overlay')?.classList.contains('active');
  const painelAberto = document.getElementById('adm-panel-overlay')?.classList.contains('active');
  if (!loginAberto && !painelAberto) {
    document.body.classList.remove('adm-modal-open');
    document.body.style.removeProperty('position');
    document.body.style.removeProperty('top');
    document.body.style.removeProperty('left');
    document.body.style.removeProperty('right');
    document.body.style.removeProperty('width');
    window.scrollTo({ top: _admScrollYBeforeLock, left: 0, behavior: 'auto' });
  }
}

function adm_showLogin() {
  adm_lockBackgroundScroll();
  document.getElementById('adm-login-overlay').classList.add('active');
  document.getElementById('adm-login-error').classList.remove('visible');
}

function adm_hideLogin() {
  document.getElementById('adm-login-overlay').classList.remove('active');
  adm_unlockBackgroundScrollIfClosed();
}

// Bibliotecas e fontes usadas só pelo ADM (exportar Excel/PDF e gerar imagens).
// Carregam quando o painel abre — quem só visita o ranking nunca baixa isso.
let _libsAdminPromise = null;
function carregarLibsAdmin() {
  if (_libsAdminPromise) return _libsAdminPromise;
  const addScript = src => new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src; el.onload = resolve;
    el.onerror = () => reject(new Error('Falha ao carregar ' + src));
    document.head.appendChild(el);
  });
  const fontes = document.createElement('link');
  fontes.rel = 'stylesheet';
  fontes.href = 'https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Dancing+Script:wght@600;700&display=swap';
  fontes.onload = () => { try { document.fonts.load('700 20px Manrope'); document.fonts.load('700 20px "Dancing Script"'); } catch (e) {} };
  document.head.appendChild(fontes);
  const CDN = 'https://cdn.jsdelivr.net/npm/';
  _libsAdminPromise = Promise.all([
    addScript(CDN + 'exceljs@4.4.0/dist/exceljs.min.js'),
    addScript(CDN + 'jspdf@2.5.1/dist/jspdf.umd.min.js').then(() => addScript(CDN + 'jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js')),
    addScript(CDN + 'html2canvas@1.4.1/dist/html2canvas.min.js'),
    addScript(CDN + 'jszip@3.10.1/dist/jszip.min.js'),
  ]).catch(err => { console.error('[carregarLibsAdmin]', err); _libsAdminPromise = null; });
  return _libsAdminPromise;
}

async function adm_showPanel() {
  adm_lockBackgroundScroll();
  const painelOverlay = document.getElementById('adm-panel-overlay');
  const painelConteudo = document.querySelector('#adm-panel .adm-panel-inner');
  painelOverlay.scrollTop = 0;
  if (painelConteudo) painelConteudo.scrollTop = 0;
  painelOverlay.classList.add('active');
  requestAnimationFrame(() => {
    painelOverlay.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    painelConteudo?.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
  carregarLibsAdmin();
  // data padrão no formulário = hoje
  const hoje = new Date().toISOString().split('T')[0];
  const dataEl = document.getElementById('venda-data');
  if (dataEl && !dataEl.value) dataEl.value = hoje;
  prepararCadastroVendedor();
  carregarVendedoresGerenciamento();
  configurarAbaAdmins();
  configurarAbaFiliais();
  configurarNavegacaoAdmin();
  adm_navigateTo('dashboard');

  try {
    const vendedoresTodasFiliais = await loadVendedoresTodasFiliais();
    popularSelectVendedoresTodasFiliais(vendedoresTodasFiliais);
    await carregarVendedoresParaLimpezaSuperadmin();
  } catch (err) {
    console.error('[adm_showPanel] vendedores por regional', err);
    showToast(err.message || 'Não foi possível carregar vendedores por regional.', 'error');
  }
}

function configurarNavegacaoAdmin() {
  const superAdmin = ehSuperAdminAtual();
  const limpezaVendedorCard = document.getElementById('rel-limpeza-vendedor-card');
  if (limpezaVendedorCard) limpezaVendedorCard.hidden = !superAdmin;
  const vendedoresGlobaisCard = document.getElementById('adm-vendedores-global-card');
  const vendedoresGlobaisFiltro = document.getElementById('adm-vendedores-global-filial');
  const vendedoresGlobaisBusca = document.getElementById('adm-vendedores-global-busca');
  const formCadastroVendedor = document.querySelector('.adm-vendedor-cadastro-card');
  const vendedorOutraFilialField = document.getElementById('filial-vendedor-field');
  const vendedorOutraFilialHint = document.getElementById('filial-vendedor-escopo-hint');
  if (vendedoresGlobaisCard) vendedoresGlobaisCard.hidden = !superAdmin;
  if (formCadastroVendedor) formCadastroVendedor.hidden = !superAdmin;
  if (vendedorOutraFilialField) vendedorOutraFilialField.hidden = !superAdmin;
  if (vendedorOutraFilialHint) vendedorOutraFilialHint.hidden = superAdmin;
  if (superAdmin && vendedoresGlobaisFiltro) {
    if (!vendedoresGlobaisFiltro.dataset.filiaisCarregadas) {
      (_cache.filiais || []).forEach(f => vendedoresGlobaisFiltro.add(new Option(f.nome, String(f.id))));
      vendedoresGlobaisFiltro.dataset.filiaisCarregadas = 'true';
    }
    if (!vendedoresGlobaisFiltro.dataset.listenerRegistrado) {
      vendedoresGlobaisFiltro.addEventListener('change', () => {
        _vendedoresVisaoGlobalPagina = 1;
        renderizarVendedoresVisaoGlobal();
      });
      vendedoresGlobaisFiltro.dataset.listenerRegistrado = 'true';
    }
    if (vendedoresGlobaisBusca && !vendedoresGlobaisBusca.dataset.listenerRegistrado) {
      vendedoresGlobaisBusca.addEventListener('input', () => {
        _vendedoresVisaoGlobalPagina = 1;
        renderizarVendedoresVisaoGlobal();
      });
      vendedoresGlobaisBusca.dataset.listenerRegistrado = 'true';
    }
    carregarVendedoresVisaoGlobal();
  }
  const elementosSuperAdmin = ['adm-nav-rede', 'adm-nav-planos', 'adm-nav-tema', 'adm-nav-admins', 'adm-nav-filiais'];
  elementosSuperAdmin.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = superAdmin ? '' : 'none';
  });
  const grupoGlobal = document.getElementById('adm-nav-global-label');
  if (grupoGlobal) grupoGlobal.style.display = superAdmin ? '' : 'none';
  const navMetasLegado = document.getElementById('adm-nav-metas');
  if (navMetasLegado) navMetasLegado.style.display = 'none';
  const secMetasLegado = document.getElementById('sec-metas');
  if (secMetasLegado) secMetasLegado.style.display = 'none';
  const secRede = document.getElementById('sec-rede');
  if (secRede) secRede.style.display = superAdmin ? '' : 'none';
  const totalizador = document.getElementById('card-totalizador');
  if (totalizador) totalizador.style.display = superAdmin ? '' : 'none';

  const seletorFilial = document.getElementById('adm-rede-filial');
  if (superAdmin && seletorFilial && !seletorFilial.dataset.carregado) {
    (_cache.filiais || []).forEach(f => seletorFilial.add(new Option(f.nome, String(f.id))));
    seletorFilial.dataset.carregado = 'true';
  }
  const mesInput = document.getElementById('adm-rede-mes');
  if (mesInput && !mesInput.value) {
    const hoje = new Date();
    mesInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  }
  if (mesInput) window.atualizarSeletorMesADM?.(mesInput);
}

function formatarQuantidadeRede(valor) {
  return Number(valor || 0).toLocaleString('pt-BR');
}

function formatarMoedaRede(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function carregarVendasRede(inicio, fim) {
  return carregarTodasPaginas(() => window._supabase
    .from('vendas_admin')
    .select('id, filial_destino_id, valor_total, data_venda')
    .gte('data_venda', inicio)
    .lt('data_venda', fim)
    .order('id', { ascending: true }), 'comparativo da rede');
}

async function carregarDashboardRede() {
  if (!ehSuperAdminAtual() || !window._supabase) return;
  const inputMes = document.getElementById('adm-rede-mes');
  const tbody = document.getElementById('adm-rede-tbody');
  const alertas = document.getElementById('adm-rede-alertas');
  const botao = document.getElementById('adm-rede-atualizar');
  if (!inputMes || !tbody || !alertas) return;
  const [ano, mes] = inputMes.value.split('-').map(Number);
  if (!ano || !mes || mes < 1 || mes > 12) {
    showToast('Escolha um mês válido para comparar as filiais.', 'warning');
    return;
  }
  const inicio = new Date(ano, mes - 1, 1).toISOString();
  const fimDia = new Date(ano, mes, 0);
  const fim = fimDoDiaExclusivo(`${ano}-${String(mes).padStart(2, '0')}-${String(fimDia.getDate()).padStart(2, '0')}`);
  const textoOriginal = botao?.textContent;
  if (botao) { botao.disabled = true; botao.textContent = 'Carregando…'; }
  const botaoExportar = document.getElementById('adm-rede-exportar');
  if (botaoExportar) botaoExportar.disabled = true;
  _dashboardRedeDados = null;
  tbody.innerHTML = '<tr><td colspan="9" class="adm-empty-state">Carregando comparativo…</td></tr>';
  alertas.replaceChildren();
  try {
    const [filiaisResult, metasResult, vendedoresResult, vendas] = await Promise.all([
      window._supabase.from('filiais').select('id, nome, ativo, site_habilitado').order('nome'),
      window._supabase.from('metas_filial').select('filial_id, meta_mensal_m1').eq('mes', mes).eq('ano', ano),
      window._supabase.from('vendedores').select('id, filial_id').eq('ativo', true),
      carregarVendasRede(inicio, fim),
    ]);
    const erro = filiaisResult.error || metasResult.error || vendedoresResult.error;
    if (erro) throw erro;
    let admins = null;
    try {
      const respostaAdmins = await window._supabase.functions.invoke(EDGE_FN_GERENCIAR_ADMINS, { body: { action: 'list' } });
      if (respostaAdmins.error || respostaAdmins.data?.error) throw respostaAdmins.error || new Error(respostaAdmins.data.error);
      admins = respostaAdmins.data?.admins || [];
    } catch (errorAdmins) {
      console.warn('[carregarDashboardRede] Não foi possível conferir contas regionais:', errorAdmins);
    }
    _dashboardRedeDados = {
      filiais: filiaisResult.data || [],
      metas: metasResult.data || [],
      vendedores: vendedoresResult.data || [],
      vendas,
      admins,
      mes,
      ano,
    };
    const exportar = document.getElementById('adm-rede-exportar');
    if (exportar) exportar.disabled = false;
    const seletor = document.getElementById('adm-rede-filial');
    if (seletor) {
      const filtroAnterior = seletor.value;
      seletor.replaceChildren(new Option('Todas as filiais', ''));
      _dashboardRedeDados.filiais.forEach(f => seletor.add(new Option(f.nome, String(f.id))));
      seletor.value = _dashboardRedeDados.filiais.some(f => String(f.id) === filtroAnterior) ? filtroAnterior : '';
    }
    renderDashboardRede();
  } catch (error) {
    console.error('[carregarDashboardRede]', error);
    tbody.innerHTML = `<tr><td colspan="9" class="adm-empty-state">${escapeHtmlText(error.message || 'Não foi possível carregar as informações da rede.')}</td></tr>`;
    const li = document.createElement('li');
    li.className = 'adm-empty-state';
    li.textContent = 'Não foi possível verificar os alertas. Confira as permissões do superadministrador.';
    alertas.appendChild(li);
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = textoOriginal || 'Atualizar visão'; }
  }
}

function exportarComparativoRede() {
  const dados = _dashboardRedeDados;
  if (!dados) {
    showToast('Atualize a visão da rede antes de exportar.', 'warning');
    return;
  }
  const filtro = document.getElementById('adm-rede-filial')?.value || '';
  const filiais = dados.filiais.filter(f => !filtro || String(f.id) === filtro);
  const equipePorFilial = new Map();
  dados.vendedores.forEach(v => equipePorFilial.set(String(v.filial_id), (equipePorFilial.get(String(v.filial_id)) || 0) + 1));
  const contaAtivaPorFilial = new Set((dados.admins || []).filter(a => a.ativo === true).map(a => String(a.filial_id)));
  const metaPorFilial = new Map((dados.metas || []).map(m => [String(m.filial_id), Number(m.meta_mensal_m1 || 0)]));
  const vendasPorFilial = new Map();
  dados.vendas.forEach(v => {
    const id = String(v.filial_destino_id);
    const atual = vendasPorFilial.get(id) || { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(v.valor_total || 0);
    vendasPorFilial.set(id, atual);
  });
  const linhas = [
    ['Filial', 'Ativa', 'Ranking público', 'Vendedores ativos', 'Acesso regional', 'Vendas no mês (destino)', 'Valor vendido', 'Meta mensal M1', 'Atingimento'],
    ...filiais.map(f => {
      const resumo = vendasPorFilial.get(String(f.id)) || { quantidade: 0, valor: 0 };
      const vendas = resumo.quantidade;
      const meta = metaPorFilial.get(String(f.id)) || 0;
      return [f.nome, f.ativo ? 'Sim' : 'Não', f.site_habilitado ? 'Ativo' : 'Desativado',
        equipePorFilial.get(String(f.id)) || 0,
        dados.admins == null ? 'Não verificado' : contaAtivaPorFilial.has(String(f.id)) ? 'Ativo' : 'Sem conta ativa',
        vendas, resumo.valor.toFixed(2).replace('.', ','), meta || '', meta ? `${Math.round((vendas / meta) * 100)}%` : ''];
    }),
  ];
  const csv = '\uFEFF' + linhas.map(linha => linha.map(celula => {
    let valor = String(celula ?? '');
    if (/^[=+\-@\t\r]/.test(valor)) valor = `'${valor}`;
    return `"${valor.replace(/"/g, '""')}"`;
  }).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `comparativo-filiais-${dados.ano}-${String(dados.mes).padStart(2, '0')}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderDashboardRede() {
  const dados = _dashboardRedeDados;
  if (!dados) return;
  const filtro = document.getElementById('adm-rede-filial')?.value || '';
  const filiais = dados.filiais.filter(f => !filtro || String(f.id) === filtro);
  const vendedoresPorFilial = new Map();
  dados.vendedores.forEach(v => {
    const id = String(v.filial_id);
    vendedoresPorFilial.set(id, (vendedoresPorFilial.get(id) || 0) + 1);
  });
  const metasPorFilial = new Map((dados.metas || []).map(m => [String(m.filial_id), Number(m.meta_mensal_m1 || 0)]));
  const vendasPorFilial = new Map();
  dados.vendas.forEach(v => {
    const id = String(v.filial_destino_id);
    const atual = vendasPorFilial.get(id) || { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += Number(v.valor_total || 0);
    vendasPorFilial.set(id, atual);
  });

  const ativas = filiais.filter(f => f.ativo === true);
  const semEquipe = ativas.filter(f => !vendedoresPorFilial.get(String(f.id))).length;
  const semMeta = ativas.filter(f => !(metasPorFilial.get(String(f.id)) > 0)).length;
  const adminsPorFilial = new Map();
  (dados.admins || []).filter(admin => admin.ativo === true).forEach(admin => {
    const id = String(admin.filial_id);
    adminsPorFilial.set(id, (adminsPorFilial.get(id) || 0) + 1);
  });
  const semAcesso = dados.admins == null ? null : ativas.filter(f => !adminsPorFilial.get(String(f.id))).length;
  const totalVendas = filiais.reduce((soma, f) => soma + (vendasPorFilial.get(String(f.id))?.quantidade || 0), 0);
  const totalValor = filiais.reduce((soma, f) => soma + (vendasPorFilial.get(String(f.id))?.valor || 0), 0);
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('rede-filiais-ativas', formatarQuantidadeRede(ativas.length));
  setText('rede-vendas', formatarQuantidadeRede(totalVendas));
  setText('rede-valor', formatarMoedaRede(totalValor));
  setText('rede-sem-equipe', formatarQuantidadeRede(semEquipe));
  setText('rede-sem-meta', formatarQuantidadeRede(semMeta));
  setText('rede-sem-acesso', semAcesso == null ? '—' : formatarQuantidadeRede(semAcesso));

  const tbody = document.getElementById('adm-rede-tbody');
  tbody.replaceChildren();
  if (!filiais.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9; td.className = 'adm-empty-state'; td.textContent = 'Nenhuma filial encontrada.';
    tr.appendChild(td); tbody.appendChild(tr);
  }
  filiais.forEach(f => {
    const equipe = vendedoresPorFilial.get(String(f.id)) || 0;
    const resumoVendas = vendasPorFilial.get(String(f.id)) || { quantidade: 0, valor: 0 };
    const vendas = resumoVendas.quantidade;
    const meta = metasPorFilial.get(String(f.id)) || 0;
    const percentual = meta ? Math.round((vendas / meta) * 100) : null;
    const adminAtivo = dados.admins == null ? null : Boolean(adminsPorFilial.get(String(f.id)));
    const problemas = [];
    if (!f.ativo) problemas.push('Inativa');
    else {
      if (!equipe) problemas.push('Sem equipe');
      if (dados.admins && !adminAtivo) problemas.push('Sem acesso regional');
      if (!meta) problemas.push('Sem meta');
      if (!vendas) problemas.push('Sem vendas');
      if (!f.site_habilitado) problemas.push('Ranking público desativado');
    }
    const valores = [
      f.nome,
      f.ativo && f.site_habilitado ? 'Ativo' : 'Desativado',
      formatarQuantidadeRede(equipe),
      adminAtivo == null ? 'Não verificado' : adminAtivo ? 'Ativo' : 'Sem conta ativa',
      formatarQuantidadeRede(vendas),
      formatarMoedaRede(resumoVendas.valor),
      meta ? `${formatarQuantidadeRede(meta)} vendas` : 'Não configurada',
      percentual == null ? '—' : `${percentual}%`,
      problemas.length ? problemas.join(' · ') : 'Em operação',
    ];
    const tr = document.createElement('tr');
    valores.forEach((valor, index) => {
      const td = document.createElement('td');
      td.textContent = valor;
      if (index === 8) td.className = problemas.length ? 'adm-rede-status-atencao' : 'adm-rede-status-ok';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const listaAlertas = document.getElementById('adm-rede-alertas');
  listaAlertas.replaceChildren();
  const problemas = [];
  ativas.forEach(f => {
    const equipe = vendedoresPorFilial.get(String(f.id)) || 0;
    const vendas = vendasPorFilial.get(String(f.id))?.quantidade || 0;
    const meta = metasPorFilial.get(String(f.id)) || 0;
    if (!equipe) problemas.push({ filialId: String(f.id), texto: `${f.nome}: cadastre vendedores ativos.` });
    if (dados.admins && !adminsPorFilial.get(String(f.id))) problemas.push({ filialId: String(f.id), texto: `${f.nome}: crie uma conta administrativa regional.` });
    if (!meta) problemas.push({ filialId: String(f.id), texto: `${f.nome}: configure a meta mensal M1 de ${dados.mes}/${dados.ano}.` });
    if (!vendas) problemas.push({ filialId: String(f.id), texto: `${f.nome}: ainda não há vendas destinadas a esta filial no período.` });
    if (!f.site_habilitado) problemas.push({ filialId: String(f.id), texto: `${f.nome}: o ranking público está desativado.` });
  });
  const listaFinal = filtro ? problemas.filter(item => item.filialId === filtro) : problemas;
  if (!listaFinal.length) {
    const li = document.createElement('li'); li.className = 'adm-rede-alerta-ok';
    li.textContent = 'Nenhum ponto de atenção nas filiais ativas neste período.'; listaAlertas.appendChild(li);
  } else {
    listaFinal.forEach(item => {
      const li = document.createElement('li'); li.textContent = item.texto; listaAlertas.appendChild(li);
    });
  }
}

function configurarAbaAdmins() {
  const nav = document.getElementById('adm-nav-admins');
  const section = document.getElementById('sec-admins');
  const isSuperAdmin = window.ADMIN_AUTENTICADO && window.ADMIN_FILIAL_ID == null;
  if (nav) nav.style.display = isSuperAdmin ? '' : 'none';
  if (section) section.style.display = isSuperAdmin ? '' : 'none';
  if (!isSuperAdmin) return;

  const select = document.getElementById('adm-admin-filial');
  if (select && !select.options.length) {
    (_cache.filiais || []).filter(f => f.ativo !== false).forEach(f => {
      select.add(new Option(f.nome, String(f.id)));
    });
  }
}

function ehSuperAdminAtual() {
  return window.ADMIN_AUTENTICADO === true && window.ADMIN_FILIAL_ID == null;
}

function configurarAbaFiliais() {
  const nav = document.getElementById('adm-nav-filiais');
  const section = document.getElementById('sec-filiais-admin');
  const autorizado = ehSuperAdminAtual();
  if (nav) nav.style.display = autorizado ? '' : 'none';
  if (section) section.style.display = autorizado ? '' : 'none';
  if (autorizado) carregarFiliaisGerenciadas();
}

function slugFilial(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function atualizarSlugFilialAutomaticamente() {
  const slug = document.getElementById('adm-filial-slug');
  const nome = document.getElementById('adm-filial-nome');
  if (!slug || !nome || slug.dataset.manual === 'true') return;
  slug.value = slugFilial(nome.value);
}

async function carregarFiliaisGerenciadas() {
  const tbody = document.getElementById('adm-filiais-tbody');
  if (!tbody || !window._supabase || !ehSuperAdminAtual()) return;
  tbody.innerHTML = '<tr><td colspan="5" class="adm-empty-state">Carregando filiais…</td></tr>';
  const { data, error } = await window._supabase
    .from('filiais')
    .select('id, nome, slug, ativo, site_habilitado')
    .order('nome');
  if (error) {
    console.error('[carregarFiliaisGerenciadas]', error);
    tbody.innerHTML = `<tr><td colspan="5" class="adm-empty-state">${escapeHtmlText(error.message || 'Não foi possível carregar as filiais.')}</td></tr>`;
    return;
  }
  tbody.replaceChildren();
  if (!data?.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.className = 'adm-empty-state';
    td.textContent = 'Nenhuma filial cadastrada.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  data.forEach(filial => {
    const tr = document.createElement('tr');
    const nome = document.createElement('td');
    nome.textContent = filial.nome;
    const slug = document.createElement('td');
    slug.textContent = filial.slug;
    const status = document.createElement('td');
    status.textContent = filial.ativo ? 'Ativa' : 'Desativada';
    const site = document.createElement('td');
    site.textContent = filial.ativo && filial.site_habilitado ? 'Habilitado' : 'Desabilitado';
    const acoes = document.createElement('td');
    const editar = document.createElement('button');
    editar.type = 'button';
    editar.className = 'adm-btn adm-btn-small';
    editar.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-edit"></use></svg><span>Editar</span>';
    editar.addEventListener('click', () => editarFilialGerenciada(filial));
    acoes.appendChild(editar);
    tr.append(nome, slug, status, site, acoes);
    tbody.appendChild(tr);
  });
}

function editarFilialGerenciada(filial) {
  if (!ehSuperAdminAtual()) {
    showToast('Somente o superadministrador pode editar filiais.', 'error');
    return;
  }
  _filialGerenciadaEmEdicaoId = Number(filial.id);
  document.getElementById('adm-filial-nome').value = filial.nome || '';
  const slug = document.getElementById('adm-filial-slug');
  slug.value = filial.slug || '';
  slug.dataset.manual = 'true';
  document.getElementById('adm-filial-ativa').checked = filial.ativo === true;
  document.getElementById('adm-filial-site-habilitado').checked = filial.site_habilitado === true;
  document.getElementById('adm-filial-form-title').textContent = `Editar filial: ${filial.nome}`;
  document.getElementById('adm-filial-submit').textContent = 'Salvar alterações';
  document.getElementById('adm-filial-cancelar').hidden = false;
  document.getElementById('adm-filial-nome').focus();
}

function cancelarEdicaoFilial() {
  _filialGerenciadaEmEdicaoId = null;
  document.getElementById('adm-filial-gerenciar-form')?.reset();
  const slug = document.getElementById('adm-filial-slug');
  if (slug) delete slug.dataset.manual;
  const title = document.getElementById('adm-filial-form-title');
  const button = document.getElementById('adm-filial-submit');
  const cancel = document.getElementById('adm-filial-cancelar');
  if (title) title.textContent = 'Cadastrar nova filial';
  if (button) button.textContent = 'Cadastrar filial';
  if (cancel) cancel.hidden = true;
}

async function salvarFilialGerenciada(event) {
  event.preventDefault();
  if (!ehSuperAdminAtual() || !window._supabase) {
    showToast('Somente o superadministrador pode cadastrar ou editar filiais.', 'error');
    return;
  }
  const nome = document.getElementById('adm-filial-nome').value.trim();
  const slug = slugFilial(document.getElementById('adm-filial-slug').value);
  const ativo = document.getElementById('adm-filial-ativa').checked;
  const siteHabilitado = ativo && document.getElementById('adm-filial-site-habilitado').checked;
  if (!nome || !slug) {
    showToast('Informe o nome e o endereço curto da filial.', 'warning');
    return;
  }
  const botao = document.getElementById('adm-filial-submit');
  botao.disabled = true;
  botao.textContent = _filialGerenciadaEmEdicaoId ? 'Salvando…' : 'Cadastrando…';
  try {
    const dados = { nome, slug, ativo, site_habilitado: siteHabilitado };
    const resposta = _filialGerenciadaEmEdicaoId
      ? await window._supabase.from('filiais').update(dados).eq('id', _filialGerenciadaEmEdicaoId).select('id, nome, slug').single()
      : await window._supabase.from('filiais').insert(dados).select('id, nome, slug').single();
    if (resposta.error) {
      if (resposta.error.code === '23505') throw new Error('Já existe uma filial com esse nome ou endereço curto.');
      throw new Error(resposta.error.message || 'Não foi possível salvar a filial.');
    }
    const editada = Boolean(_filialGerenciadaEmEdicaoId);
    const filialSalva = resposta.data;
    cancelarEdicaoFilial();
    showToast(editada ? 'Filial atualizada. Recarregando os dados…' : 'Filial cadastrada. Recarregando os dados…', 'success');
    await carregarFiliaisGerenciadas();
    const url = new URL(window.location.href);
    if (Number(window.FILIAL_ATUAL_ID) === Number(filialSalva?.id) && ativo) {
      url.searchParams.set('filial', filialSalva.slug);
    }
    window.setTimeout(() => window.location.assign(url.toString()), 700);
  } catch (error) {
    console.error('[salvarFilialGerenciada]', error);
    showToast(error.message || 'Não foi possível salvar a filial.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = _filialGerenciadaEmEdicaoId ? 'Salvar alterações' : 'Cadastrar filial';
  }
}

async function carregarAdminsGerenciados() {
  const tbody = document.getElementById('adm-admins-tbody');
  if (!tbody || !window._supabase || window.ADMIN_FILIAL_ID != null || !window.ADMIN_AUTENTICADO) return;
  tbody.innerHTML = '<tr><td colspan="4" class="adm-empty-state">Carregando contas…</td></tr>';
  const { data, error } = await window._supabase.functions.invoke(EDGE_FN_GERENCIAR_ADMINS, { body: { action: 'list' } });
  if (error || data?.error) {
    console.error('[carregarAdminsGerenciados]', error || data.error);
    tbody.innerHTML = `<tr><td colspan="4" class="adm-empty-state">${escapeHtmlText(data?.error || error?.message || 'Não foi possível carregar as contas.')}</td></tr>`;
    return;
  }
  tbody.replaceChildren();
  const admins = data?.admins || [];
  if (!admins.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'adm-empty-state';
    td.textContent = 'Nenhuma conta regional cadastrada.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  admins.forEach(admin => {
    const tr = document.createElement('tr');
    const email = document.createElement('td');
    email.textContent = admin.email || '(e-mail não localizado)';
    const filial = document.createElement('td');
    filial.textContent = admin.filial_nome || 'Regional não localizada';
    const status = document.createElement('td');
    status.textContent = admin.ativo ? 'Ativa' : 'Inativa';
    const actions = document.createElement('td');
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'adm-btn adm-btn-small adm-btn-danger';
    deleteButton.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-trash"></use></svg><span>Excluir</span>';
    deleteButton.setAttribute('aria-label', `Excluir acesso de ${admin.email || 'conta regional'}`);
    deleteButton.addEventListener('click', () => excluirAdminRegional(admin.user_id, admin.email, deleteButton));
    actions.appendChild(deleteButton);
    tr.append(email, filial, status, actions);
    tbody.appendChild(tr);
  });
}

async function excluirAdminRegional(userId, email, botao) {
  if (!window.ADMIN_AUTENTICADO || window.ADMIN_FILIAL_ID != null || !window._supabase) {
    showToast('Somente o superadministrador pode excluir contas regionais.', 'error');
    return;
  }
  const identificacao = email || 'esta conta regional';
  if (!window.confirm(`Excluir o acesso de ${identificacao}? A conta não poderá mais entrar no painel.`)) return;

  botao.disabled = true;
  botao.textContent = 'Excluindo…';
  try {
    const { data, error } = await window._supabase.functions.invoke(EDGE_FN_GERENCIAR_ADMINS, {
      body: { action: 'delete', user_id: userId },
    });
    if (error || data?.error) {
      let mensagem = data?.error;
      if (!mensagem && error?.context?.json) {
        try { mensagem = (await error.context.json()).error; } catch (_) {}
      }
      throw new Error(mensagem || error?.message || 'Não foi possível excluir a conta regional.');
    }
    showToast(`Acesso de ${identificacao} excluído.`, 'success');
    await carregarAdminsGerenciados();
  } catch (error) {
    console.error('[excluirAdminRegional]', error);
    showToast(error.message || 'Não foi possível excluir a conta regional.', 'error');
    botao.disabled = false;
    botao.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-trash"></use></svg><span>Excluir</span>';
  }
}

async function criarAdminRegional(event) {
  event.preventDefault();
  if (!window.ADMIN_AUTENTICADO || window.ADMIN_FILIAL_ID != null || !window._supabase) {
    showToast('Somente o superadministrador pode criar contas regionais.', 'error');
    return;
  }
  const email = document.getElementById('adm-admin-email').value.trim().toLowerCase();
  const password = document.getElementById('adm-admin-senha').value;
  const confirmacao = document.getElementById('adm-admin-senha-confirmacao').value;
  const filialId = Number(document.getElementById('adm-admin-filial').value);
  if (password !== confirmacao) {
    showToast('As senhas não conferem.', 'warning');
    return;
  }
  if (password.length < 8) {
    showToast('A senha inicial precisa ter pelo menos 8 caracteres.', 'warning');
    return;
  }
  const botao = document.getElementById('adm-admin-submit');
  botao.disabled = true;
  botao.textContent = 'Criando conta…';
  try {
    const { data, error } = await window._supabase.functions.invoke(EDGE_FN_GERENCIAR_ADMINS, {
      body: { action: 'create', email, password, filial_id: filialId },
    });
    if (error || data?.error) {
      let mensagem = data?.error;
      if (!mensagem && error?.context?.json) {
        try { mensagem = (await error.context.json()).error; } catch (_) {}
      }
      throw new Error(mensagem || error?.message || 'Não foi possível criar a conta regional.');
    }

    document.getElementById('adm-admin-form').reset();
    const filialNome = data?.admin?.filial_nome || 'regional selecionada';
    showToast(`Conta ${email} criada para ${filialNome}. Envie a senha inicial com segurança.`, 'success');
    await carregarAdminsGerenciados();
  } catch (error) {
    console.error('[criarAdminRegional]', error);
    showToast(error.message || 'Não foi possível criar a conta regional.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = 'Criar conta regional';
  }
}

function adm_hidePanel() {
  document.getElementById('adm-panel-overlay').classList.remove('active');
  adm_unlockBackgroundScrollIfClosed();
}

function adm_navigateTo(sectionId) {
  if (['rede', 'admins', 'filiais-admin', 'planos', 'tema'].includes(sectionId) && !ehSuperAdminAtual()) {
    showToast('Somente o superadministrador pode abrir esta área.', 'error');
    return;
  }
  document.getElementById('adm-panel')?.classList.remove('adm-mobile-menu-open');
  document.querySelector('.adm-mobile-dock [data-adm-mobile-menu]')?.setAttribute('aria-expanded', 'false');
  document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
  document.querySelector(`.adm-nav-item[data-section="${sectionId}"]`)?.classList.add('active');
  document.getElementById('sec-' + sectionId)?.classList.add('active');
  document.dispatchEvent(new CustomEvent('adm:sectionchange', { detail: { sectionId } }));
  if (sectionId === 'vendedores') {
    prepararCadastroVendedor();
    carregarVendedoresGerenciamento();
  }
  if (sectionId === 'admins') carregarAdminsGerenciados();
  if (sectionId === 'filiais-admin') carregarFiliaisGerenciadas();
  if (sectionId === 'rede') carregarDashboardRede();
  if (sectionId === 'nova-venda' && typeof carregarPendenciasIxc === 'function') {
    carregarPendenciasIxc();
    if (typeof carregarRevisoesImportacaoIxc === 'function') carregarRevisoesImportacaoIxc();
    // Atualiza a lista ao voltar do cadastro/edição de vendedores, sem exigir
    // recarregar a página. A proteção evita aplicar dados de uma filial trocada.
    const filialId = Number(window.FILIAL_ATUAL_ID);
    loadVendedores().then(vendedores => {
      if (filialId !== Number(window.FILIAL_ATUAL_ID)) return;
      _cache.vendedores = vendedores;
      popularSelectVendedores(vendedores);
    }).catch(error => console.warn('[adm_navigateTo] não foi possível atualizar vendedores:', error));
  }
  if (sectionId === 'renovacoes') carregarRelatorioResumoRenovacoes();
  if (sectionId === 'analitica') renderizarAnaliticaPerfis();
  if (sectionId === 'celebracoes') atualizarMetasCelebraveis();
  // A área rolável é o conteúdo interno no mobile e o overlay no desktop.
  document.querySelector('#adm-panel .adm-panel-inner')?.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('adm-panel-overlay')?.scrollTo({ top: 0, behavior: 'auto' });
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
  const destino = document.getElementById('venda-destino');
  if (destino) destino.value = String(window.FILIAL_ATUAL_ID || '');
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
  const numero_venda = document.getElementById('venda-numero-contrato').value.trim();
  const obs = document.getElementById('venda-obs').value.trim();
  const foraFilial = document.getElementById('venda-fora-filial').checked;
  const adminAutenticado = window.ADMIN_AUTENTICADO === true;
  const destinoSelecionado = Number(document.getElementById('venda-destino')?.value || window.FILIAL_ATUAL_ID);
  const filial_destino_id = adminAutenticado ? destinoSelecionado : Number(window.FILIAL_ATUAL_ID);
  if (!vendedor_id || !plano_id) { showToast('Selecione o vendedor e o plano.', 'warning'); return; }
  if (!Number.isInteger(filial_destino_id) || filial_destino_id <= 0) { showToast('Selecione uma filial de destino válida.', 'warning'); return; }
  const destinoAtivo = (_cache.filiais || []).some(f => Number(f.id) === filial_destino_id && f.ativo !== false);
  if (!destinoAtivo) {
    showToast('A filial de destino selecionada não está ativa.', 'warning');
    return;
  }
  if (!data_venda || !hora_venda) { showToast('Informe a data e a hora da venda.', 'warning'); return; }
  if (!numero_venda) { showToast('Informe o número do contrato.', 'warning'); return; }
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
    const venda = await saveVenda({ vendedor_id, filial_origem_id: window.FILIAL_ATUAL_ID, filial_destino_id, plano_id, data_venda: data_venda_timestamp, valor: parseFloat(planoValorStr), cliente: cliente, numero_venda, observacao: observacaoFinal, fora_filial: foraFilial });
    if (adicionaisParaSalvar.length > 0) await saveVendaAdicionais(venda.id, adicionaisParaSalvar);
    await carregarDados();
    resetVendaForm();
    const destinoNome = (_cache.filiais || []).find(f => Number(f.id) === filial_destino_id)?.nome;
    showToast(destinoNome && filial_destino_id !== Number(window.FILIAL_ATUAL_ID)
      ? `Venda registrada para ${destinoNome}.`
      : 'Venda registrada com sucesso!', 'success');
  } catch (err) {
    console.error('[handleNovaVenda]', err);
    showToast(err.message || 'Não foi possível registrar a venda.', 'error');
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
  const checkboxes = document.querySelectorAll('input[name="filial-adicionais"]:checked');
  const adicionaisValor = Array.from(checkboxes).reduce((acc, cb) => acc + parseFloat(cb.value.split('|')[1] || 0), 0);
  const total = valorUnit + adicionaisValor;
  document.getElementById('filial-total').textContent = 'R$ ' + total.toFixed(2).replace('.', ',');
}

function resetFilialForm() {
  document.getElementById('adm-filial-form').reset();
  document.getElementById('filial-total').textContent = 'R$ 0,00';
  const data = document.getElementById('filial-data');
  if (data) data.value = new Date().toLocaleDateString('en-CA');
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
  await renderContratosRecebidosOutraFilial();
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
    const dataRaw = String(v.data_venda || '').slice(0, 10);
    const dataFmt = /^\d{4}-\d{2}-\d{2}$/.test(dataRaw)
      ? dataRaw.split('-').reverse().join('/')
      : '—';
    return `<tr>
      <td><strong>${filialNome}</strong></td>
      <td>${v.plano_nome || '—'}</td>
      <td>${v.quantidade || 1}</td>
      <td>R$ ${Number(v.valor_unitario || 0).toFixed(2).replace('.', ',')}</td>
      <td>—</td>
      <td><strong>${totalFmt}</strong></td>
      <td>${dataFmt}</td>
      <td style="color:var(--text-muted)">${v.observacao || '—'}</td>
    </tr>`;
  }).join('');
}

async function renderContratosRecebidosOutraFilial() {
  const tbody = document.getElementById('filial-contratos-body');
  if (!tbody || !window._supabase) return;
  const { data, error } = await window._supabase
    .from('vendas_admin')
    .select('id, data_venda, numero_venda, cliente, vendedor_nome, plano_nome, valor_total, filial_origem_nome, filial_origem_id, filial_destino_id')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .neq('filial_origem_id', window.FILIAL_ATUAL_ID)
    .order('data_venda', { ascending: false })
    .limit(100);
  if (error) {
    console.error('[renderContratosRecebidosOutraFilial]', error);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Não foi possível carregar os contratos recebidos. Consulte o relatório de vendas.</td></tr>';
    return;
  }
  if (!data?.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">Nenhuma venda recebida com contrato encontrada.</td></tr>';
    return;
  }
  const escapar = valor => String(valor ?? '—').replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[caractere]);
  tbody.innerHTML = data.map(v => {
    const dataVenda = v.data_venda ? new Date(v.data_venda).toLocaleDateString('pt-BR') : '—';
    const total = 'R$ ' + Number(v.valor_total || 0).toFixed(2).replace('.', ',');
    return `<tr>
      <td>${escapar(v.filial_origem_nome)}</td>
      <td><strong>${escapar(v.numero_venda)}</strong></td>
      <td>${escapar(v.cliente)}</td>
      <td>${escapar(v.vendedor_nome || 'Sem vendedor')}</td>
      <td>${escapar(v.plano_nome)}</td>
      <td><strong>${total}</strong></td>
      <td>${escapar(dataVenda)}</td>
    </tr>`;
  }).join('');
}

// ── Handler do formulário ────────────────────────────────────────
async function handleVendaOutraFilial(e) {
  e.preventDefault();

  const filialId = Number(document.getElementById('filial-origem').value);
  const vendedorRaw = document.getElementById('filial-vendedor').value;
  const planoRaw = document.getElementById('filial-plano').value;
  const [planoId, planoValorPadraoStr] = (planoRaw || '').split('|');
  const valorCustom = parseFloat(document.getElementById('filial-valor').value);
  const valorUnit = isNaN(valorCustom) ? parseFloat(planoValorPadraoStr) : valorCustom;
  const data = document.getElementById('filial-data').value;
  const cliente = document.getElementById('filial-cliente').value.trim();
  const numeroVenda = document.getElementById('filial-numero-contrato').value.trim();
  const obs = document.getElementById('filial-obs').value.trim();
  if (!filialId || !planoId) { showToast('Selecione a filial de origem e o plano.', 'warning'); return; }
  if (filialId === Number(window.FILIAL_ATUAL_ID)) {
    showToast('A filial de origem precisa ser diferente da regional atual.', 'warning');
    return;
  }
  if (vendedorRaw) {
    if (!ehSuperAdminAtual()) {
      showToast('Contas regionais registram vendas recebidas sem identificar vendedores de outras filiais.', 'warning');
      return;
    }
    const vendedorSelecionado = _vendedoresTodasFiliais.find(v => String(v.id) === String(vendedorRaw));
    if (!vendedorSelecionado || Number(vendedorSelecionado.filial_id) !== filialId) {
      showToast('O vendedor selecionado não pertence à filial de origem escolhida.', 'warning');
      return;
    }
  }
  if (!data || !numeroVenda) { showToast('Informe a data e o número do contrato.', 'warning'); return; }

  const checkboxes = document.querySelectorAll('input[name="filial-adicionais"]:checked');
  const adicionais = Array.from(checkboxes).map(cb => {
    const [aid, aval] = cb.value.split('|');
    return { id: aid, valor: parseFloat(aval) };
  });
  const adicionaisValor = adicionais.reduce((s, a) => s + a.valor, 0);
  const valorTotal = valorUnit + adicionaisValor;
  const [ano, mes, dia] = data.split('-').map(Number);
  const instante = new Date(ano, mes - 1, dia, 12, 0, 0).toISOString();
  const partesObs = [];
  if (cliente) partesObs.push('Cliente: ' + cliente);
  if (obs) partesObs.push(obs);

  try {
    const venda = await saveVenda({
      vendedor_id: vendedorRaw || null,
      filial_origem_id: filialId,
      filial_destino_id: window.FILIAL_ATUAL_ID,
      plano_id: planoId,
      data_venda: instante,
      valor: valorUnit,
      cliente,
      numero_venda: numeroVenda,
      observacao: partesObs.join(' — ') || null,
      fora_filial: false,
    });
    const adicionaisFilial = Array.from(checkboxes).map(cb => {
      const [prod_id, valor_unit] = cb.value.split('|');
      return { produto_adicional_id: prod_id, quantidade: 1, valor_unitario: parseFloat(valor_unit) };
    });
    if (adicionaisFilial.length > 0) await saveVendaAdicionais(venda.id, adicionaisFilial);
    await carregarDados();
    await renderFilialLista();
    resetFilialForm();
    showToast('Venda da filial registrada com sucesso!', 'success');
  } catch (err) {
    console.error('[handleVendaOutraFilial]', err);
    showToast(err.message || 'Não foi possível registrar a venda da filial.', 'error');
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
    const foto = vendedor ? (vendedor.foto_url || PHOTOS[vendedor.slug] || '') : '';
    const nome = escapeHtmlText(vendedor ? vendedor.nome : (r.nome || r.vendedor_id));
    const avatarHTML = foto
      ? `<img class="adm-ranking-photo" src="${foto}" alt="${nome}" onerror="this.style.display='none'">`
      : `<span class="adm-ranking-photo adm-ranking-photo-fallback" aria-label="${nome}">${nome.trim().charAt(0).toUpperCase()}</span>`;
    const tipo = vendedor ? vendedor.tipo : '—';
    const valorFmt = 'R$ ' + Number(r.valor || 0).toFixed(2).replace('.', ',');
    return `<div class="adm-ranking-item">
      <div class="adm-ranking-pos ${posClass(i)}">${i + 1}º</div>
      ${avatarHTML}
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
  const tbody = document.getElementById('adm-vendedores-tbody');
  if (!tbody) return;
  if (!d) {
    tbody.replaceChildren();
    return;
  }

  // Os dados já foram filtrados pela filial atual em loadVendedores();
  // renderizar a partir desses arrays evita nomes fixos de outra regional.
  const todos = [...(d.intMes || []), ...(d.extMes || [])];
  if (!todos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9;
    td.className = 'adm-empty-state';
    td.textContent = 'Nenhum vendedor ativo cadastrado nesta regional.';
    tr.appendChild(td);
    tbody.replaceChildren(tr);
    return;
  }

  const linhas = todos.map(v => {
    const tr = document.createElement('tr');

    const fotoTd = document.createElement('td');
    const foto = v.foto_url || PHOTOS[v.slug] || '';
    if (foto) {
      const img = document.createElement('img');
      img.src = foto;
      img.alt = v.nome;
      img.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid var(--accent);';
      img.onerror = () => {
        const inicial = document.createElement('span');
        inicial.className = 'adm-vendedor-avatar-fallback';
        inicial.textContent = String(v.nome || '?').trim().charAt(0).toUpperCase();
        fotoTd.replaceChildren(inicial);
      };
      fotoTd.appendChild(img);
    } else {
      const inicial = document.createElement('span');
      inicial.className = 'adm-vendedor-avatar-fallback';
      inicial.textContent = String(v.nome || '?').trim().charAt(0).toUpperCase();
      inicial.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:50%;border:2px solid var(--accent);background:var(--surface-hover);color:var(--heading-color);font-weight:800;';
      fotoTd.appendChild(inicial);
    }

    const nomeTd = document.createElement('td');
    const nome = document.createElement('strong');
    nome.textContent = v.nome;
    nomeTd.appendChild(nome);

    const tipoTd = document.createElement('td');
    const tipo = document.createElement('span');
    tipo.className = `adm-badge ${v.tipo === 'interno' ? 'interno' : 'externo'}`;
    tipo.textContent = v.tipo === 'interno' ? 'Interno' : 'Externo';
    tipoTd.appendChild(tipo);

    const metaTd = document.createElement('td');
    metaTd.textContent = v.meta ? `${v.meta} vendas` : 'Sem meta cadastrada';

    const vendasTd = document.createElement('td');
    vendasTd.textContent = String(v.vendas);

    const pctTd = document.createElement('td');
    if (v.meta) {
      const pct = Math.round((v.vendas / v.meta) * 100);
      const pctBarra = Math.max(0, Math.min(100, pct));
      pctTd.innerHTML = `<div class="vt-pct-wrap"><div class="vt-pct-bar"><div class="vt-pct-bar-fill" style="width:${pctBarra}%"></div></div><span>${pct}%</span></div>`;
    } else {
      pctTd.textContent = '—';
    }

    const rankTd = document.createElement('td');
    const rankResumo = (_cache.ranksMensais || []).find(item => String(item.vendedor_id) === String(v.id));
    if (rankResumo?.elegivel && rankResumo.rank_mensal) {
      const seloRank = document.createElement('span');
      seloRank.className = `adm-rank-tag adm-rank-tag--${String(rankResumo.rank_mensal).toLowerCase()}`;
      seloRank.textContent = rankResumo.rank_mensal;
      const fmtPct = (atual, meta) => Number(meta) > 0 ? `${Math.round((Number(atual) / Number(meta)) * 100)}%` : '—';
      seloRank.title = [
        `Vendas: ${rankResumo.vendas} / ${rankResumo.meta_vendas} (${fmtPct(rankResumo.vendas, rankResumo.meta_vendas)})`,
        rankResumo.tipo === 'externo' ? 'Renovações: não são critério para externos' : `Renovações: ${rankResumo.renovacoes} / ${rankResumo.meta_renovacoes} (${fmtPct(rankResumo.renovacoes, rankResumo.meta_renovacoes)})`,
        `Ticket médio individual: R$ ${Number(rankResumo.ticket_medio || 0).toFixed(2).replace('.', ',')}`,
        'Pontuação mensal: vendas percorrem M3 (50), M2 (70) e M1 (100); renovação soma até 15 pontos gradualmente entre M3, M2 e M1.',
        'Faixas: D 50, C 70, B 85, A 100, S 115 pontos; ticket mínimo: D R$ 105, C R$ 110, B R$ 115, A R$ 120, S R$ 130.',
        rankResumo.tipo === 'externo' ? 'Externo: pontuação baseada em vendas; renovação não tem peso nem meta.' : 'Renovação é bônus, não bloqueia o rank quando não há meta cadastrada.',
      ].join('\n');
      rankTd.appendChild(seloRank);
    } else {
      const motivos = [];
      if (rankResumo) {
        if (Number(rankResumo.meta_vendas) <= 0) motivos.push('meta de vendas M1 não cadastrada');
        if (Number(rankResumo.ticket_referencia) <= 0) motivos.push('sem referência de ticket regional com os dados de vendas do mês');
      }
      rankTd.textContent = !rankResumo
        ? (v.participa_ranking === false ? 'Fora do rank' : _rankMensalErro ? 'Erro no cálculo' : 'Sem retorno')
        : motivos[0]?.includes('renovações') ? 'Meta renov.'
          : motivos[0]?.includes('vendas') ? 'Meta vendas'
            : motivos[0]?.includes('ticket') ? 'Ticket base'
              : 'Sem rank';
      rankTd.className = 'adm-rank-no-base';
      if (!rankResumo) {
        rankTd.title = v.participa_ranking === false
          ? 'Este vendedor está configurado para aparecer somente em relatórios, sem participar dos ranks.'
          : _rankMensalErro
          ? `Falha ao consultar o rank: ${_rankMensalErro}`
          : 'O cálculo não retornou este vendedor. Confira se participa do ranking e se o RPC foi criado no Supabase.';
      } else {
        rankTd.title = motivos.length
          ? `Sem base para classificar: ${motivos.join('; ')}.`
          : `Sem rank: precisa de 50 pontos e ticket mínimo de R$ 105 para D. Vendas avançam por M3 (50), M2 (70) e M1 (100); renovações podem somar até 15 pontos, sem bloquear o rank.`;
      }
    }

    const statusTd = document.createElement('td');
    const statusBtn = document.createElement('button');
    statusBtn.type = 'button';
    statusBtn.className = 'adm-btn-status';
    statusBtn.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-sparkles"></use></svg><span>Gerar Status</span>';
    statusBtn.addEventListener('click', event => gerarStatusVendedor(v.slug, event));
    statusTd.appendChild(statusBtn);

    const acoesTd = document.createElement('td');
    acoesTd.className = 'adm-vendedor-actions';
    if (typeof podeGerenciarVendedorDaFilial === 'function' && podeGerenciarVendedorDaFilial(v)) {
      const editarBtn = document.createElement('button');
      editarBtn.type = 'button';
      editarBtn.className = 'adm-btn adm-btn-small';
      editarBtn.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-edit"></use></svg><span>Editar</span>';
      editarBtn.addEventListener('click', () => iniciarEdicaoVendedor(v.id));
      const desativarBtn = document.createElement('button');
      desativarBtn.type = 'button';
      desativarBtn.className = 'adm-btn adm-btn-small adm-btn-danger';
      desativarBtn.innerHTML = '<svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-ban"></use></svg><span>Desativar</span>';
      desativarBtn.addEventListener('click', () => alterarStatusVendedor(v.id, false));
      acoesTd.append(editarBtn, desativarBtn);
    } else {
      acoesTd.textContent = '—';
    }

    tr.append(fotoTd, nomeTd, tipoTd, metaTd, vendasTd, pctTd, rankTd, statusTd, acoesTd);
    return tr;
  });
  tbody.replaceChildren(...linhas);
}

// ================================================================
// CARD "PAINEL DE DESEMPENHO" — gerado só pelo ADM (botão "Gerar
// Status" na tabela de Equipe de Vendas). Preenche o template oculto
// (#sc-card, no fim do <body>) com dados JÁ CALCULADOS por
// processarDadosParaRender() — nada de número é inventado aqui. A
// única camada de "gamificação" em cima dos dados reais é a força do
// selo de sinal, que reflete a posição REAL da pessoa no ranking da
// semana (não é um número decorativo) — documentado função a função.
// html2canvas() fotografa o template e vira PNG pra download.
// ================================================================

// Posição (1º, 2º, 3º...) do vendedor no ranking DESTA semana, dentro
// do próprio grupo (interno concorre com interno, externo com
// externo) — o mesmo critério já usado nos pódios da página pública.
// Retorna null se o vendedor não tiver nenhuma venda na semana (não
// faz sentido "ranquear" quem está zerado).
function calcularPosicaoRanking(slug, tipo, d) {
  // mesmo critério de desempate do pódio público: em caso de empate no
  // número de vendas, quem tem maior valor total fica na frente
  const grupo = (tipo === 'interno' ? d.intSem : d.extSem).slice().sort((a, b) => (b.vendas - a.vendas) || ((b.valor || 0) - (a.valor || 0)));
  const posicao = grupo.findIndex(v => v.slug === slug);
  const vendas = posicao >= 0 ? grupo[posicao].vendas : 0;
  if (vendas === 0) return null;
  return posicao + 1; // 1-indexado
}

function ordinal(n) {
  return n + 'º';
}

// Frases de incentivo escolhidas pelo avanço da meta e a posição semanal,
// sem usar a data de ativação para inferir constância diária.
const SC_FRASES_ALTA = [
  'Você tá voando tão alto que o Wi-Fi pediu carona. 🚀',
  'Seu progresso aparece em cada meta que você alcança.',
  'Meta no retrovisor, próximo desafio no radar. Bora!',
  'Seu sinal tá tão forte que chega antes da notícia da venda.',
  'Conexão feita, cliente feliz, equipe orgulhosa. Repete!',
];
const SC_FRASES_MEDIA = [
  'Cada venda é uma conexão. E você tá conectando bonito!',
  'Ritmo bom! O próximo cliente já pode estar dando tchau pro concorrente.',
  'A rede tá crescendo — segue nessa frequência que tá funcionando.',
  'Mais uma venda e o café fica até mais gostoso. ☕',
  'Um passo de cada vez também chega no topo. Continua!',
];
const SC_FRASES_BAIXA = [
  'Toda grande rede começa com uma conexão. Bora fazer a próxima?',
  'O sinal pode oscilar; sua capacidade, não. Vamos nessa!',
  'Até o melhor Wi-Fi precisa reconectar às vezes. Partiu!',
  'A próxima venda pode mudar o ritmo do dia. Vai que é sua!',
  'Respira, ajusta a rota e chama o próximo cliente. Você consegue!',
];

async function gerarStatusVendedor(slug, evt, options = {}) {
  const d = _ultimoProcessado;
  if (!d) { showToast('Ainda não há dados carregados para gerar o card.', 'warning'); return; }

  const vendedorSemana = [...d.intSem, ...d.extSem].find(v => v.slug === slug);
  const vendedorMes = [...d.intMes, ...d.extMes].find(v => v.slug === slug);
  if (!vendedorSemana || !vendedorMes) { showToast('Vendedor não encontrado.', 'error'); return; }

  const vendedorCadastro = (_cache.vendedores || []).find(v => (v.slug || v.id) === slug);
  const tipo = vendedorSemana.tipo;

  const posicao = calcularPosicaoRanking(slug, tipo, d);
  const barrasAcesas = posicao === 1 ? 4 : posicao !== null && posicao <= 3 ? 3 : posicao !== null && posicao <= 5 ? 2 : posicao !== null ? 1 : 0;
  const labelSinal = posicao === null ? 'SEM VENDAS NA SEMANA' : `${ordinal(posicao)} NA SEMANA`;

  const ticketMedio = vendedorMes.vendas ? (vendedorMes.valor / vendedorMes.vendas) : 0;

  // A meta do card acompanha a próxima conquista individual, igual ao
  // ranking mensal: M3 -> M2 -> M1. Depois de M1, o percentual segue
  // sobre M1 e pode passar de 100%.
  const mesNome = (d.mes && d.mes.mesNome) ? (d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1)) : CONFIG.mesReferencia;
  const metaIndividual = (_cache.metas || []).find(m => String(m.vendedor_id) === String(vendedorCadastro?.id));
  const metasPessoais = tipo === 'interno'
    ? [
        { tier: 'm3', label: 'M3', meta: Number(metaIndividual?.meta_m3) },
        { tier: 'm2', label: 'M2', meta: Number(metaIndividual?.meta_m2) },
        { tier: 'm1', label: 'M1', meta: Number(metaIndividual?.meta_m1) },
      ].filter(m => Number.isFinite(m.meta) && m.meta > 0).sort((a, b) => a.meta - b.meta)
    : [];
  const vendasMesPessoa = Number(vendedorMes.vendas || 0);
  const metaAtualObj = tipo === 'interno'
    ? (metasPessoais.find(m => vendasMesPessoa < m.meta) || metasPessoais[metasPessoais.length - 1] || null)
    : (Number(vendedorMes.meta) > 0 ? { label: 'Meta mensal', meta: Number(vendedorMes.meta) } : null);
  const temMeta = !!metaAtualObj;
  const pctMeta = temMeta ? Math.round((vendasMesPessoa / metaAtualObj.meta) * 100) : 0;
  const pctBarra = Math.min(100, Math.max(0, pctMeta));
  const faltam = temMeta ? Math.max(0, metaAtualObj.meta - vendasMesPessoa) : null;
  const m1JaAtingida = tipo === 'interno' && metasPessoais.length > 0
    && vendasMesPessoa >= metasPessoais[metasPessoais.length - 1].meta;

  // O texto de incentivo reflete metas e posição, não dias com ativação.
  const pontuacaoDestaque = Math.min(100, pctMeta) + (posicao ? (6 - Math.min(5, posicao)) * 5 : 0);
  const poolFrases = pontuacaoDestaque >= 100 ? SC_FRASES_ALTA : pontuacaoDestaque >= 60 ? SC_FRASES_MEDIA : SC_FRASES_BAIXA;
  const frase = poolFrases[vendedorMes.vendas % poolFrases.length];

  // ── Preenche o template oculto ──────────────────────────────────
  const foto = vendedorCadastro?.foto_url || vendedorSemana.foto_url || PHOTOS[slug] || '';
  const avatarEl = document.getElementById('sc-avatar');
  const inicialVendedor = String(vendedorSemana.nome || '?').trim().charAt(0).toUpperCase();
  avatarEl.replaceChildren();
  if (foto) {
    const fotoEl = document.createElement('img');
    fotoEl.alt = '';
    fotoEl.decoding = 'async';
    fotoEl.crossOrigin = 'anonymous';
    fotoEl.onerror = () => avatarEl.replaceChildren(document.createTextNode(inicialVendedor));
    fotoEl.src = foto;
    avatarEl.appendChild(fotoEl);
    try {
      if (fotoEl.decode) await fotoEl.decode();
    } catch (_) {
      avatarEl.replaceChildren(document.createTextNode(inicialVendedor));
    }
  } else {
    avatarEl.textContent = inicialVendedor;
  }

  document.getElementById('sc-name').textContent = vendedorSemana.nome;
  document.getElementById('sc-role').textContent = (tipo === 'interno' ? 'VENDEDOR(A) · INTERNO' : 'VENDEDOR(A) · EXTERNO');

  const barrasEls = document.querySelectorAll('#sc-signal-bars span');
  barrasEls.forEach((el, i) => el.classList.toggle('on', i < barrasAcesas));
  document.getElementById('sc-signal-label').textContent = labelSinal;

  document.getElementById('sc-hero-goal').textContent = tipo === 'interno' && metaAtualObj
    ? `${metaAtualObj.label} — Meta Individual de ${mesNome}`
    : `Meta Individual — ${mesNome}`;
  document.getElementById('sc-hero-bar').style.width = pctBarra + '%';
  document.getElementById('sc-hero-pct').textContent = temMeta ? (pctMeta + '%') : '—';
  document.getElementById('sc-hero-sub').innerHTML = !temMeta
    ? 'Sem meta individual cadastrada este mês'
    : faltam > 0
      ? `Faltam <b>${faltam} ${faltam === 1 ? 'venda' : 'vendas'}</b> para alcançar ${metaAtualObj.label === 'Meta mensal' ? 'a meta do mês' : 'a ' + metaAtualObj.label}`
      : m1JaAtingida
        ? `${metasPessoais[metasPessoais.length - 1].label} alcançada! Continue superando sua marca. 🎉`
        : `${metaAtualObj.label} alcançada! Próximo nível no seu radar. 🎉`;

  // Mostrar somente o maior nível individual já atingido. O selo de
  // liderança é separado e só aparece para quem está em 1º na semana.
  const badges = [];
  const metasBatidas = metasPessoais.filter(m => vendasMesPessoa >= m.meta);
  const maiorMetaBatida = metasBatidas[metasBatidas.length - 1];
  const metaExternaBatida = tipo === 'externo'
    ? (vendasMesPessoa > 14 ? { tier: 'm1', label: 'M1' } : vendasMesPessoa >= 14 ? { tier: 'm2', label: 'M2' } : null)
    : null;
  const maiorConquista = tipo === 'externo' ? metaExternaBatida : maiorMetaBatida;
  if (maiorConquista) badges.push({ label: `${maiorConquista.label} Atingida` });
  if (posicao === 1) badges.push({ label: 'Líder da Semana' });
  const cardStory = document.getElementById('sc-card');
  // A moldura comunica apenas uma conquista confirmada. No externo, os
  // marcos de vendas são M2 com 14 e M1 acima de 14 vendas.
  const marcoAtingido = maiorConquista?.tier || '';
  if (cardStory) {
    if (marcoAtingido) cardStory.dataset.achievedTier = marcoAtingido;
    else delete cardStory.dataset.achievedTier;
  }
  const badgesSection = document.getElementById('sc-badges-section');
  if (badges.length) {
    badgesSection.style.display = '';
    document.getElementById('sc-badges-row').innerHTML = badges.map(b =>
      `<div class="sc-badge on"><span class="sc-badge-check">✓</span>${b.label}</div>`
    ).join('');
  } else {
    badgesSection.style.display = 'none';
  }

  const statsGrid = document.querySelector('#sc-card .sc-stats-grid');
  const statVendasLabel = document.getElementById('sc-stat-vendas-label');
  const statForaTile = document.getElementById('sc-stat-fora-tile');
  const statFora = document.getElementById('sc-stat-fora');
  const statRenovTile = document.getElementById('sc-stat-renov-tile');
  const ehExterno = tipo === 'externo';
  document.getElementById('sc-card')?.classList.toggle('is-external', ehExterno);
  if (statsGrid) statsGrid.classList.toggle('is-external', ehExterno);
  if (statVendasLabel) statVendasLabel.textContent = ehExterno ? 'Vendas para a Meta' : 'Vendas no Mês';
  if (statForaTile) {
    statForaTile.hidden = false;
    statForaTile.style.display = ehExterno ? 'block' : 'none';
  }
  if (statRenovTile) {
    statRenovTile.hidden = ehExterno;
    statRenovTile.style.display = ehExterno ? 'none' : '';
  }
  if (ehExterno && statFora) {
    const vendasForaNaFilialDestino = (_cache.vendasMes || []).filter(v =>
      String(v.vendedor_id) === String(vendedorCadastro?.id) &&
      (v.fora_filial === true || isVendaRecebidaDeOutraFilial(v))
    ).length;
    const vendasOriginadasNaRegional = (_cache.vendasOrigemMes || [])
      .filter(v => v.tipo === 'externo' && Number(v.vendedor_id) === Number(vendedorCadastro?.id))
      .reduce((total, v) => total + Number(v.vendas || 0), 0);
    statFora.textContent = vendasForaNaFilialDestino + vendasOriginadasNaRegional;
  }
  document.getElementById('sc-stat-vendas').textContent = vendedorMes.vendas;
  document.getElementById('sc-stat-ticket').textContent = ticketMedio ? ('R$' + ticketMedio.toFixed(0)) : '—';
  document.getElementById('sc-stat-semana').textContent = vendedorSemana.vendas || 0;
  if (!ehExterno) {
    const renovacaoMensal = Array.isArray(_cache.renovacoesMes) ? _cache.renovacoesMes : null;
    const renovacaoPessoa = renovacaoMensal?.find(item => String(item.vendedor_id) === String(vendedorCadastro?.id));
    const quantidadeRenovacoes = renovacaoPessoa ? Number(renovacaoPessoa.quantidade || 0) : (renovacaoMensal ? 0 : null);
    const metasRenovPessoa = _cache.metasRenovacaoFilial || {};
    const metasRenovPessoaOrdenadas = [
      { label: 'M3', valor: Number(metasRenovPessoa.meta_m3) },
      { label: 'M2', valor: Number(metasRenovPessoa.meta_m2) },
      { label: 'M1', valor: Number(metasRenovPessoa.meta_m1) },
    ].filter(meta => meta.valor > 0).sort((a, b) => a.valor - b.valor);
    const metaRenovacaoAtual = quantidadeRenovacoes === null ? null
      : (metasRenovPessoaOrdenadas.find(meta => quantidadeRenovacoes < meta.valor) || metasRenovPessoaOrdenadas[metasRenovPessoaOrdenadas.length - 1] || null);
    const statRenov = document.getElementById('sc-stat-renovacoes');
    const statRenovMeta = document.getElementById('sc-stat-renovacoes-meta');
    if (statRenov) statRenov.textContent = quantidadeRenovacoes === null ? '—' : quantidadeRenovacoes.toLocaleString('pt-BR');
    if (statRenovMeta) statRenovMeta.textContent = quantidadeRenovacoes === null
      ? 'Aguardando relatório'
      : metaRenovacaoAtual
        ? `${metaRenovacaoAtual.label} · ${quantidadeRenovacoes.toLocaleString('pt-BR')} / ${metaRenovacaoAtual.valor.toLocaleString('pt-BR')}`
    : 'Meta da equipe não configurada';
  }

  document.getElementById('sc-phrase').textContent = `"${frase}"`;
  document.getElementById('sc-data-geracao').textContent = 'UNI INTERNET · GERADO EM ' + new Date().toLocaleDateString('pt-BR');

  // ── Fotografa o template e baixa como PNG ───────────────────────
  const btn = evt ? evt.target.closest('button') : null;
  const textoOriginalBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
  try {
    if (typeof html2canvas === 'undefined') { carregarLibsAdmin(); showToast('Biblioteca de imagem ainda carregando — aguarde alguns segundos e tente de novo.', 'error'); return; }
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(document.getElementById('sc-card'), {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
      allowTaint: false,
      imageTimeout: 10000,
    });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Não foi possível converter o card em imagem.');
    if (options.returnBlob) return blob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Story_Desempenho_${vendedorSemana.nome}_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Card gerado com sucesso!', 'success');
  } catch (err) {
    console.error('[gerarStatusVendedor]', err);
    if (options.returnBlob) throw err;
    showToast('Não foi possível gerar o card.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn; }
  }
}

// ── Analítica individual e ficha de progressão ───────────────────
