// ── Esqueletos para Supabase (implementar após configuração) ─────
// ================================================================
// CONFIGURAÇÃO SUPABASE
// Preencha SUPABASE_URL e SUPABASE_ANON_KEY antes de usar.
// Nunca use service_role key no frontend.
// ================================================================
const SUPABASE_URL = 'https://xmpurrxwfgzhnrqhrzyt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HGi_8HXwyr4SEzoIKunMiA_cmWsFI8U';
// Esta versão publicada do site representa Alta Floresta D'Oeste.
// Centralizar o ID evita misturar vendas destinadas a outras filiais.
window.FILIAL_ATUAL_ID = 10;
window.FILIAL_ATUAL = null;

function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL === 'COLOCAR_URL_DO_PROJETO') {
    console.warn('[Supabase] URL não configurada.');
    return false;
  }
  const { createClient } = supabase;
  window._supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
}

function configurarFilialAtual(filiais) {
  const publicadas = (filiais || []).filter(f => f.ativo !== false && f.site_habilitado === true);
  const parametros = new URLSearchParams(window.location.search);
  const slugSolicitado = parametros.get('filial');
  const filialPadrao = publicadas.find(f => Number(f.id) === 10) || publicadas[0];
  const filial = (slugSolicitado && publicadas.find(f => f.slug === slugSolicitado)) || filialPadrao;
  if (!filial) throw new Error('Nenhuma filial está habilitada para exibição pública.');
  if (slugSolicitado && slugSolicitado !== filial.slug) {
    const url = new URL(window.location.href);
    url.searchParams.set('filial', filial.slug);
    window.history.replaceState({}, '', url.toString());
  }

  window.FILIAL_ATUAL = filial;
  window.FILIAL_ATUAL_ID = Number(filial.id);
  const nomeEl = document.getElementById('filial-atual-nome');
  if (nomeEl) nomeEl.textContent = filial.nome;
  const adminNome = document.getElementById('filial-atual-admin-nome');
  if (adminNome) adminNome.textContent = filial.nome;
  const adminTituloFilial = document.getElementById('filial-atual-admin-titulo');
  if (adminTituloFilial) adminTituloFilial.textContent = filial.nome;
  document.title = `Ranking de Vendas | ${filial.nome} | UNI Internet`;

  const seletor = document.getElementById('filial-site-select');
  if (seletor) {
    seletor.replaceChildren();
    publicadas.forEach(f => {
      const option = document.createElement('option');
      option.value = f.slug;
      option.textContent = f.nome;
      seletor.appendChild(option);
    });
    seletor.value = filial.slug;
    seletor.disabled = publicadas.length < 2;
  }
  return filial;
}

function abrirFilialSite(slug) {
  if (!slug || !window.FILIAL_ATUAL || slug === window.FILIAL_ATUAL.slug) return;
  if (document.documentElement.classList.contains('filial-page-exiting')) return;
  const url = new URL(window.location.href);
  url.searchParams.set('filial', slug);
  const reduzirMovimento = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduzirMovimento) {
    window.location.assign(url.toString());
    return;
  }
  try { sessionStorage.setItem('uni-filial-transicao', '1'); } catch (_) {}
  document.documentElement.classList.add('filial-page-exiting');
  window.setTimeout(() => window.location.assign(url.toString()), 240);
}

async function copiarLinkFilial() {
  if (!window.FILIAL_ATUAL) return;
  const url = new URL(window.location.href);
  url.searchParams.set('filial', window.FILIAL_ATUAL.slug);
  try {
    await navigator.clipboard.writeText(url.toString());
    showToast('Link da filial copiado.', 'success');
  } catch (err) {
    window.prompt('Copie o link desta filial:', url.toString());
  }
}

// ── Auth ─────────────────────────────────────────────────────────
async function checkAdminSession() {
  if (!window._supabase) return null;
  const { data: { session } } = await window._supabase.auth.getSession();
  if (!session) return null;
  // Verificar se o usuário está em admin_usuarios com ativo = true
  const { data, error } = await window._supabase
    .from('admin_usuarios')
    .select('user_id, nome, ativo')
    .eq('user_id', session.user.id)
    .eq('ativo', true)
    .single();
  if (error || !data) return null;
  return session;
}

async function loginAdmin(email, password) {
  if (!window._supabase) throw new Error('Supabase não inicializado.');
  const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // Verificar se é admin
  const { data: adminData, error: adminError } = await window._supabase
    .from('admin_usuarios')
    .select('user_id, nome, ativo')
    .eq('user_id', data.user.id)
    .eq('ativo', true)
    .single();
  if (adminError || !adminData) {
    await window._supabase.auth.signOut();
    throw new Error('Usuário sem permissão administrativa.');
  }
  return data;
}

async function logoutAdmin() {
  if (!window._supabase) return;
  await window._supabase.auth.signOut();
}

// ── Loaders ──────────────────────────────────────────────────────
async function loadVendedores() {
  const { data, error } = await window._supabase
    .from('vendedores')
    .select('*')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .eq('ativo', true)
    .order('nome');
  if (error) { console.error('[loadVendedores]', error); return []; }
  return data;
}

// O formulário de vendas recebidas de outra filial pode registrar vendedores
// de qualquer regional. Esta lista só é carregada quando o ADM abre, depois do
// login, e não altera a lista local usada em Nova Venda ou nos rankings.
async function loadVendedoresTodasFiliais() {
  const { data, error } = await window._supabase
    .from('vendedores')
    .select('id, nome, tipo, filial_id, slug')
    .eq('ativo', true)
    .order('filial_id')
    .order('nome');
  if (error) {
    console.error('[loadVendedoresTodasFiliais]', error);
    throw new Error('Não foi possível carregar os vendedores de todas as regionais.');
  }
  return data || [];
}

function popularSelectVendedoresTodasFiliais(vendedores) {
  const select = document.getElementById('filial-vendedor');
  if (!select) return;

  const valorAtual = select.value;
  const filiais = _cache.filiais || [];
  const nomeFilial = id => {
    const filial = filiais.find(f => String(f.id) === String(id));
    return filial?.nome || 'Regional sem identificação';
  };
  const grupos = new Map();
  (vendedores || []).forEach(v => {
    const chave = v.filial_id == null ? '__sem_filial__' : String(v.filial_id);
    if (!grupos.has(chave)) grupos.set(chave, { nome: nomeFilial(v.filial_id), vendedores: [] });
    grupos.get(chave).vendedores.push(v);
  });

  select.replaceChildren(new Option('Sem vendedor cadastrado — conta só para a filial', ''));
  [...grupos.values()]
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .forEach(grupo => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = grupo.nome;
      grupo.vendedores
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        .forEach(v => {
          const tipo = v.tipo === 'interno' ? 'Interno' : 'Externo';
          const option = new Option(`${v.nome} (${tipo})`, v.id);
          if (v.slug) option.dataset.slug = v.slug;
          optgroup.appendChild(option);
        });
      select.appendChild(optgroup);
    });
  if (valorAtual) select.value = valorAtual;
}

async function loadPlanos() {
  const { data, error } = await window._supabase
    .from('planos')
    .select('*')
    .order('nome');
  if (error) { console.error('[loadPlanos]', error); return []; }
  return data;
}

async function loadAdicionais() {
  const { data, error } = await window._supabase
    .from('produtos_adicionais')
    .select('*')
    .eq('ativo', true)
    .order('nome');
  if (error) { console.error('[loadAdicionais]', error); return []; }
  return data;
}

async function loadFiliais() {
  const { data, error } = await window._supabase
    .from('filiais')
    .select('*')
    .eq('ativo', true)
    .order('nome');
  if (error) { console.error('[loadFiliais]', error); return []; }
  return data;
}

async function loadMetas(mes, ano, vendedorIds = []) {
  if (!vendedorIds.length) return [];
  const { data, error } = await window._supabase
    .from('metas')
    .select('*')
    .in('vendedor_id', vendedorIds)
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) { console.error('[loadMetas]', error); return []; }
  return data;
}

async function loadMetasFilial(mes, ano) {
  const { data, error } = await window._supabase
    .from('metas_filial')
    .select('*')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .eq('mes', mes)
    .eq('ano', ano)
    .single();
  if (error) { console.error('[loadMetasFilial]', error); return null; }
  if (!data) return null;
  // Normaliza os nomes reais das colunas do Supabase (meta_semanal_m3 etc.)
  // para os nomes internos que o restante do dashboard já espera
  // (semanal_m3 etc.) — nenhuma outra função precisa saber dessa diferença.
  return {
    id: data.id,
    mes: data.mes,
    ano: data.ano,
    semanal_m3: data.meta_semanal_m3,
    semanal_m2: data.meta_semanal_m2,
    semanal_m1: data.meta_semanal_m1,
    mensal_m3: data.meta_mensal_m3,
    mensal_m2: data.meta_mensal_m2,
    mensal_m1: data.meta_mensal_m1,
  };
}

// Renovações/Cancelamentos são só mensais e não vêm de nenhuma venda
// lançada — são digitados manualmente pelo admin (tanto as metas M1/M2/M3
// quanto o "quanto já foi feito no mês"), por isso moram numa tabela à
// parte (metas_renovacao_cancelamento), 1 linha por mes/ano.
async function loadMetasRenovCancel(mes, ano) {
  const { data, error } = await window._supabase
    .from('metas_renovacao_cancelamento')
    .select('*')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .eq('mes', mes)
    .eq('ano', ano)
    .single();
  if (error) { console.error('[loadMetasRenovCancel]', error); return null; }
  if (!data) return null;
  return {
    id: data.id,
    mes: data.mes,
    ano: data.ano,
    renovacoes_m3: data.renovacoes_meta_m3,
    renovacoes_m2: data.renovacoes_meta_m2,
    renovacoes_m1: data.renovacoes_meta_m1,
    renovacoes_atual: data.renovacoes_atual,
    cancelamentos_m3: data.cancelamentos_meta_m3,
    cancelamentos_m2: data.cancelamentos_meta_m2,
    cancelamentos_m1: data.cancelamentos_meta_m1,
    cancelamentos_atual: data.cancelamentos_atual,
  };
}

// A tabela/`view` de vendas não tem uma coluna própria para o nome do
// cliente — ele é digitado no formulário e salvo dentro do campo
// `observacao`, no formato "Cliente: Fulano — outras observações".
// Esta função recupera esse nome de volta a partir da observação,
// para usar como fallback nos relatórios quando não houver v.cliente.
function extrairClienteDeObservacao(observacao) {
  if (!observacao) return null;
  const match = String(observacao).match(/Cliente:\s*([^—]+)/i);
  return match ? match[1].trim() || null : null;
}

// Data "YYYY-MM-DD" -> início do DIA SEGUINTE (fuso local), em ISO.
// data_venda é timestamp; comparar com "<= YYYY-MM-DD" cortava o dia todo.
function fimDoDiaExclusivo(ate) {
  const [y, m, d] = String(ate).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0).toISOString();
}
// "YYYY-MM-DD" da data_venda no fuso LOCAL (o slice(0,10) pegava a data UTC).
function dataLocalStr(raw) {
  const str = String(raw || '');
  if (str.length > 10 && str[10] === 'T') {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const pad = n => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }
  }
  return str.slice(0, 10);
}

// Mesma janela que a busca do Supabase usa: vale a data UTC OU a data local.
// (registros só com data entram como 00:00 UTC; vendas à noite viram o dia
// seguinte em UTC — com o "OU", as duas situações ficam dentro do período.)
function dataNoPeriodo(raw, de, ate) {
  const utc = String(raw || '').slice(0, 10);
  const loc = dataLocalStr(raw);
  return (utc >= de && utc <= ate) || (loc >= de && loc <= ate);
}

async function loadVendas(de, ate) {
  const { data, error } = await window._supabase
    .from('vendas_ranking_publicas')
    .select('*')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .gte('data_venda', de)
    .lt('data_venda', fimDoDiaExclusivo(ate))
    .order('data_venda', { ascending: false });
  if (error) {
    console.error('[loadVendas]', error);
    return [];
  }
  return (data || []).map(v => ({
    ...v,
    vendedores: {
      id: v.vendedor_id,
      nome: v.vendedor_nome,
      slug: v.vendedor_slug
    },
    planos: {
      id: v.plano_id,
      nome: v.plano_nome
    },
    valor: Number(v.valor_plano || 0),
    valor_plano: Number(v.valor_plano || 0),
    valor_adicionais: Number(v.valor_adicionais || 0),
    valor_total: Number(v.valor_total || 0)
  }));
}

// Detalhes identificáveis da venda são consultados apenas pelo relatório
// administrativo. A view vendas_admin deve usar security_invoker e depender
// das políticas de administrador nas tabelas vendas e venda_adicionais.
async function loadVendasAdmin(de, ate) {
  const { data, error } = await window._supabase
    .from('vendas_admin')
    .select('*')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .gte('data_venda', de)
    .lt('data_venda', fimDoDiaExclusivo(ate))
    .order('data_venda', { ascending: false });
  if (error) {
    console.error('[loadVendasAdmin]', error);
    throw error;
  }
  return (data || []).map(v => ({
    ...v,
    vendedores: {
      id: v.vendedor_id,
      nome: v.vendedor_nome,
      slug: v.vendedor_slug
    },
    planos: {
      id: v.plano_id,
      nome: v.plano_nome
    },
    valor: Number(v.valor_plano || 0),
    valor_plano: Number(v.valor_plano || 0),
    valor_adicionais: Number(v.valor_adicionais || 0),
    valor_total: Number(v.valor_total || 0)
  }));
}

async function loadVendasOutrasFiliais(de, ate) {
  let query = window._supabase
    .from('vendas_outras_filiais_publicas')
    .select('*')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .order('data_venda', { ascending: false });
  if (de) query = query.gte('data_venda', de);
  if (ate) query = query.lt('data_venda', fimDoDiaExclusivo(ate));
  const { data, error } = await query;
  if (error) { console.error('[loadVendasOutrasFiliais]', error); return []; }
  return data;
}

async function loadVendaMaisRecente() {
  const { data, error } = await window._supabase
    .from('vendas_ranking_publicas')
    .select('data_venda, vendedor_nome, vendedor_slug')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .order('data_venda', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[loadVendaMaisRecente]', error);
    return null;
  }
  if (!data) return null;
  return {
    data_venda: data.data_venda,
    vendedores: {
      nome: data.vendedor_nome,
      slug: data.vendedor_slug
    }
  };
}

// ================================================================
// RELATÓRIO DE VENDAS (Relatórios → Relatório de Vendas)
// Reaproveita _cache (vendasMes, vendasFiliais, vendedores, planos)
// sempre que o período filtrado já está coberto pelo mês carregado;
// só chama loadVendas()/loadVendasOutrasFiliais() (funções já
// existentes, não duplicadas) quando o período pedido sai do cache.
// ================================================================
let _relatorioState = {
  linhas: [],
  paginaAtual: 1,
  porPagina: 20,
};

let _mesExclusaoConferido = null;

function invalidarConferenciaExclusaoMes() {
  _mesExclusaoConferido = null;
  const botao = document.getElementById('rel-limpeza-excluir');
  const resumo = document.getElementById('rel-limpeza-resumo');
  if (botao) { botao.disabled = true; botao.style.opacity = '0.55'; botao.style.cursor = 'not-allowed'; }
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
    if (botao) { botao.disabled = false; botao.style.opacity = '1'; botao.style.cursor = 'pointer'; }
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
    if (botao) { botao.disabled = true; botao.style.opacity = '0.55'; botao.style.cursor = 'not-allowed'; }
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
  const { data, error } = await window._supabase
    .from('venda_adicionais')
    .select('venda_id, quantidade, valor_unitario, produtos_adicionais(nome)')
    .in('venda_id', vendaIds);
  if (error) { console.error('[loadAdicionaisPorVendas]', error); return {}; }
  const mapa = {};
  (data || []).forEach(a => {
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

  // O cache público não contém cliente nem observação. O relatório
  // administrativo consulta sua view própria, protegida por RLS.
  let vendasBase, filiaisBase;
  try {
    [vendasBase, filiaisBase] = await Promise.all([
      loadVendasAdmin(dataIni, dataFim),
      loadVendasOutrasFiliais(dataIni, dataFim),
    ]);

    const vendaIds = vendasBase.map(v => v.id).filter(Boolean);
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
      const acoesTxt = `<button type="button" class="adm-btn-excluir" onclick="handleExcluirVenda('${l.id}', '${l.tipoLinha}')" title="Excluir esta venda">🗑️</button>`;
      return `<tr>
        <td>${dataFmt}</td><td>${l.hora || '—'}</td><td>${vendedorTxt}</td><td>${tipoTxt}</td>
        <td>${l.cliente || '—'}</td><td>${l.planoNome}</td><td>${veloc}</td>
        <td>${adicionaisTxt}</td><td><strong>${valorFmt}</strong></td><td>${origemTxt}</td>
        <td>${acoesTxt}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">Nenhuma venda encontrada para os filtros selecionados.</td></tr>';
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
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal').length;
  const vendasForaFilial = linhas.filter(l => l.tipoLinha === 'fora_filial').length;
  const vendasOutrasFiliais = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
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
      { v: l.tipoLinha === 'outra_filial' ? 'Outra filial' : (l.foraFilial ? 'Fora da filial' : 'Nossa filial') },
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
  const vendasEquipe = linhas.filter(l => l.tipoLinha === 'normal').length;
  const vendasOutras = linhas.filter(l => l.tipoLinha === 'outra_filial').length;
  const { porVendedor, porPlano, porAdicional } = calcularResumosRelatorio(linhas);
  const fmt = n => 'R$ ' + n.toFixed(2).replace('.', ',');

  let y = 80;
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('RESUMO', 14, y); y += 6;
  doc.autoTable({
    startY: y, theme: 'grid', styles: { fontSize: 9 }, headStyles: { fillColor: corAccent2 },
    head: [ocultarFinanceiro
      ? ['Total de Vendas', 'Vendas da Equipe', 'Outras Filiais']
      : ['Total de Vendas', 'Valor Total', 'Ticket Médio', 'Vendas da Equipe', 'Outras Filiais']],
    body: [ocultarFinanceiro
      ? [totalVendas, vendasEquipe, vendasOutras]
      : [totalVendas, fmt(valorTotal), fmt(ticketMedio), vendasEquipe, vendasOutras]],
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

  if (y > 240) { doc.addPage(); desenharFundoRelatorioPDF(doc); y = 20; }
  doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...corAccent2);
  doc.text('DETALHAMENTO DAS VENDAS', 14, y); y += 6;
  // Tabela de detalhamento pode quebrar em várias páginas sozinha
  // (linhas demais para caber na página atual). O jspdf-autotable
  // chama willDrawPage a cada página nova ANTES de desenhar o
  // cabeçalho/linhas daquela página — por isso usamos esse hook (e
  // não o didDrawPage, que só dispara DEPOIS que a página já foi
  // desenhada: usá-lo aqui pintava o fundo em cima das linhas recém
  // desenhadas e "sumia" com elas, que era exatamente o bug relatado
  // — a página 2 em diante ficava só com o fundo, sem nenhuma linha).
  // A 1ª página já tem o fundo desenhado manualmente acima (antes do
  // título "DETALHAMENTO DAS VENDAS"), então pulamos ela aqui pra não
  // cobrir o que já foi escrito nela (Resumo, Vendas por Vendedor etc.).
  let _primeiraPaginaDetalhamento = true;
  doc.autoTable({
    startY: y, theme: 'grid', styles: { fontSize: 7.5, cellPadding: 2, overflow: 'linebreak', valign: 'top' }, headStyles: { fillColor: corAccent2 },
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
        l.tipoLinha === 'outra_filial' ? ('🏢 ' + l.filialOrigem) : l.vendedorNome,
        l.cliente || '—',
        l.planoNome + (l.velocidade ? ' - ' + l.velocidade + ' Mbps' : ''),
        l.adicionaisNomes.join(', ') || '—',
      ];
      if (!ocultarFinanceiro) linha.push(fmt(l.valorTotal));
      return linha;
    }),
    margin: { left: 14, right: 14, top: 20, bottom: 20 },
    willDrawPage: () => {
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

// ── Saves ────────────────────────────────────────────────────────
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
  document.getElementById('adm-email').value = '';
  document.getElementById('adm-password').value = '';
}

function adm_hideLogin() {
  document.getElementById('adm-login-overlay').classList.remove('active');
  adm_unlockBackgroundScrollIfClosed();
}

// Bibliotecas e fontes usadas só pelo ADM (exportar Excel/PDF, gerar imagens/GIF).
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
    addScript(CDN + 'gif.js@0.2.0/dist/gif.min.js'),
  ]).catch(err => { console.error('[carregarLibsAdmin]', err); _libsAdminPromise = null; });
  return _libsAdminPromise;
}

async function adm_showPanel() {
  adm_lockBackgroundScroll();
  const painelOverlay = document.getElementById('adm-panel-overlay');
  painelOverlay.scrollTop = 0;
  painelOverlay.classList.add('active');
  requestAnimationFrame(() => painelOverlay.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  carregarLibsAdmin();
  // popular fotos na tabela de vendedores
  ['gabriella','lorena','lohayne','ian','william'].forEach(id => {
    const el = document.getElementById('vt-foto-' + id);
    if (el && PHOTOS[id]) el.src = PHOTOS[id];
  });
  // data padrão no formulário = hoje
  const hoje = new Date().toISOString().split('T')[0];
  const dataEl = document.getElementById('venda-data');
  if (dataEl && !dataEl.value) dataEl.value = hoje;

  try {
    const vendedoresTodasFiliais = await loadVendedoresTodasFiliais();
    popularSelectVendedoresTodasFiliais(vendedoresTodasFiliais);
  } catch (err) {
    console.error('[adm_showPanel] vendedores por regional', err);
    showToast(err.message || 'Não foi possível carregar vendedores por regional.', 'error');
  }
}

function adm_hidePanel() {
  document.getElementById('adm-panel-overlay').classList.remove('active');
  adm_unlockBackgroundScrollIfClosed();
}

function adm_navigateTo(sectionId) {
  document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.adm-section').forEach(s => s.classList.remove('active'));
  document.querySelector(`.adm-nav-item[data-section="${sectionId}"]`)?.classList.add('active');
  document.getElementById('sec-' + sectionId)?.classList.add('active');
  // volta pro topo ao trocar de seção — sem isso, a rolagem da seção
  // anterior ficava "presa", escondendo filtros/cabeçalho da nova seção
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
  if (!vendedor_id || !plano_id) { showToast('Selecione o vendedor e o plano.', 'warning'); return; }
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
    const venda = await saveVenda({ vendedor_id, filial_origem_id: window.FILIAL_ATUAL_ID, filial_destino_id: window.FILIAL_ATUAL_ID, plano_id, data_venda: data_venda_timestamp, valor: parseFloat(planoValorStr), cliente: cliente, numero_venda, observacao: observacaoFinal, fora_filial: foraFilial });
    if (adicionaisParaSalvar.length > 0) await saveVendaAdicionais(venda.id, adicionaisParaSalvar);
    await carregarDados();
    resetVendaForm();
    showToast('Venda registrada com sucesso!', 'success');
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

// Sequência de dias seguidos com pelo menos 1 venda, olhando as vendas
// do mês corrente já carregadas em cache (não faz nova consulta ao
// Supabase). Conta a partir do dia mais recente com venda pra trás,
// dia a dia, parando no primeiro buraco.
function calcularSequenciaDias(vendasDoVendedor) {
  const dias = new Set();
  vendasDoVendedor.forEach(v => {
    const dataStr = String(v.data_venda || '').slice(0, 10);
    if (dataStr) dias.add(dataStr);
  });
  if (dias.size === 0) return 0;
  const datasOrdenadas = [...dias].sort().reverse(); // mais recente primeiro
  let sequencia = 1;
  let anterior = new Date(datasOrdenadas[0] + 'T12:00:00');
  for (let i = 1; i < datasOrdenadas.length; i++) {
    const atual = new Date(datasOrdenadas[i] + 'T12:00:00');
    const diffDias = Math.round((anterior - atual) / 86400000);
    if (diffDias === 1) { sequencia++; anterior = atual; }
    else break;
  }
  return sequencia;
}

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

// Pool de frases sobre constância — a escolha é determinística
// (baseada na sequência de dias + vendas do mês), não aleatória, pra
// gerar o mesmo card duas vezes seguidas sem ficar trocando de frase.
const SC_FRASES_ALTA = [
  'Constância que vira resultado — siga nesse ritmo.',
  'Sinal forte e estável. Assim se fecha o mês.',
  'Todo dia gerando conexão nova. Excelente ritmo.',
];
const SC_FRASES_MEDIA = [
  'Cada venda é mais uma conexão. Siga transmitindo.',
  'Ritmo bom, constância crescendo. Bora manter.',
  'A rede tá crescendo — continue nessa frequência.',
];
const SC_FRASES_BAIXA = [
  'Toda grande rede começa com a primeira conexão.',
  'Hora de retomar o sinal. Bora fechar mais vendas.',
  'O próximo passo é reconectar o ritmo da semana.',
];

async function gerarStatusVendedor(slug, evt) {
  const d = _ultimoProcessado;
  if (!d) { showToast('Ainda não há dados carregados para gerar o card.', 'warning'); return; }

  const vendedorSemana = [...d.intSem, ...d.extSem].find(v => v.slug === slug);
  const vendedorMes = [...d.intMes, ...d.extMes].find(v => v.slug === slug);
  if (!vendedorSemana || !vendedorMes) { showToast('Vendedor não encontrado.', 'error'); return; }

  const vendedorCadastro = (_cache.vendedores || []).find(v => (v.slug || v.id) === slug);
  const tipo = vendedorSemana.tipo;

  // sequência: precisa das vendas do próprio vendedor no mês (já em cache)
  const vendasDoVendedor = vendedorCadastro
    ? (_cache.vendasMes || []).filter(v => v.vendedor_id === vendedorCadastro.id)
    : [];
  const sequencia = calcularSequenciaDias(vendasDoVendedor);

  const posicao = calcularPosicaoRanking(slug, tipo, d);
  const barrasAcesas = posicao === 1 ? 4 : posicao !== null && posicao <= 3 ? 3 : posicao !== null && posicao <= 5 ? 2 : posicao !== null ? 1 : 0;
  const labelSinal = posicao === null ? 'SEM VENDAS NA SEMANA' : `${ordinal(posicao)} NA SEMANA`;

  const ticketMedio = vendedorMes.vendas ? (vendedorMes.valor / vendedorMes.vendas) : 0;

  // "Meta Atual" = meta individual do mês (a mais pessoal e acionável
  // pra mostrar num card individual). Sem meta cadastrada = mostra
  // aviso claro em vez de inventar um número.
  const mesNome = (d.mes && d.mes.mesNome) ? (d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1)) : CONFIG.mesReferencia;
  const temMeta = !!vendedorMes.meta;
  const pctMeta = temMeta ? Math.min(100, Math.round((vendedorMes.vendas / vendedorMes.meta) * 100)) : 0;
  const faltam = temMeta ? Math.max(0, vendedorMes.meta - vendedorMes.vendas) : null;

  // frase de constância: combina sequência + posição pra escolher a faixa
  const pontuacaoConstancia = sequencia + (posicao ? (6 - Math.min(5, posicao)) : 0);
  const poolFrases = pontuacaoConstancia >= 7 ? SC_FRASES_ALTA : pontuacaoConstancia >= 3 ? SC_FRASES_MEDIA : SC_FRASES_BAIXA;
  const frase = poolFrases[vendedorMes.vendas % poolFrases.length];

  // ── Preenche o template oculto ──────────────────────────────────
  const foto = PHOTOS[slug];
  const avatarEl = document.getElementById('sc-avatar');
  avatarEl.innerHTML = foto ? `<img src="${foto}" alt="">` : vendedorSemana.nome.charAt(0).toUpperCase();

  document.getElementById('sc-name').textContent = vendedorSemana.nome;
  document.getElementById('sc-role').textContent = (tipo === 'interno' ? 'VENDEDOR(A) · INTERNO' : 'VENDEDOR(A) · EXTERNO');

  const barrasEls = document.querySelectorAll('#sc-signal-bars span');
  barrasEls.forEach((el, i) => el.classList.toggle('on', i < barrasAcesas));
  document.getElementById('sc-signal-label').textContent = labelSinal;

  document.getElementById('sc-hero-goal').textContent = `Meta Individual — ${mesNome}`;
  document.getElementById('sc-hero-bar').style.width = pctMeta + '%';
  document.getElementById('sc-hero-pct').textContent = temMeta ? (pctMeta + '%') : '—';
  document.getElementById('sc-hero-sub').innerHTML = !temMeta
    ? 'Sem meta individual cadastrada este mês'
    : faltam > 0
      ? `Faltam <b>${faltam} ${faltam === 1 ? 'venda' : 'vendas'}</b> para bater a meta do mês`
      : 'Meta do mês batida! 🎉';

  // Selos: acendem só com dados reais — meta individual do mês
  // (vendedorMes) e as 3 metas SEMANAIS da filial (mf.semanal_m1/2/3
  // vs. d.totalSemana, os mesmos números do card "Metas da Filial —
  // Semana" da página pública). Sem meta cadastrada = o selo nem
  // aparece (não inventa threshold nenhum).
  const mf2 = d.metasFilial;
  const badges = [];
  if (temMeta) badges.push({ label: 'Destaque', on: vendedorMes.vendas >= vendedorMes.meta });
  if (mf2 && mf2.semanal_m1) badges.push({ label: 'M1', on: d.totalSemana >= mf2.semanal_m1 });
  if (mf2 && mf2.semanal_m2) badges.push({ label: 'M2', on: d.totalSemana >= mf2.semanal_m2 });
  if (mf2 && mf2.semanal_m3) badges.push({ label: 'M3', on: d.totalSemana >= mf2.semanal_m3 });
  const badgesSection = document.getElementById('sc-badges-section');
  if (badges.length) {
    badgesSection.style.display = '';
    document.getElementById('sc-badges-row').innerHTML = badges.map(b =>
      `<div class="sc-badge ${b.on ? 'on' : ''}"><span class="sc-badge-check">${b.on ? '✓' : '—'}</span>${b.label}</div>`
    ).join('');
  } else {
    badgesSection.style.display = 'none';
  }

  document.getElementById('sc-stat-vendas').textContent = vendedorMes.vendas;
  document.getElementById('sc-stat-ticket').textContent = ticketMedio ? ('R$' + ticketMedio.toFixed(0)) : '—';
  document.getElementById('sc-stat-dias').innerHTML = `${sequencia}<span class="sc-unit"> ${sequencia === 1 ? 'dia' : 'dias'}</span>`;

  document.getElementById('sc-phrase').textContent = `"${frase}"`;
  document.getElementById('sc-data-geracao').textContent = 'UNI INTERNET · GERADO EM ' + new Date().toLocaleDateString('pt-BR');

  // ── Fotografa o template e baixa como PNG ───────────────────────
  const btn = evt ? evt.target.closest('button') : null;
  const textoOriginalBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando...'; }
  try {
    if (typeof html2canvas === 'undefined') { carregarLibsAdmin(); showToast('Biblioteca de imagem ainda carregando — aguarde alguns segundos e tente de novo.', 'error'); return; }
    const canvas = await html2canvas(document.getElementById('sc-card'), { backgroundColor: null, scale: 2 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Status_${vendedorSemana.nome}_${new Date().toISOString().split('T')[0]}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Card gerado com sucesso!', 'success');
  } catch (err) {
    console.error('[gerarStatusVendedor]', err);
    showToast('Não foi possível gerar o card.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn; }
  }
}

// ================================================================
// ABA "CELEBRAÇÕES" — GIF animado de meta batida (M1/M2/M3 da filial
// na semana, ou meta individual do mês). Só oferece pra celebrar
// metas que o vendedor bateu DE VERDADE (mesmos números de
// gerarStatusVendedor); nunca inventa uma meta batida.
// ================================================================

// Lista as metas que ESSE vendedor bateu agora, cada uma já com o
// rótulo pra mostrar e qual é "a próxima" (pra seção "O que vem aí"
// do card). M1→M2→M3→Meta Global é a progressão natural da filial;
// a meta individual não tem "próxima" (é renovada todo mês).
function metasBatidasDoVendedor(slug) {
  const d = _ultimoProcessado;
  if (!d) return [];
  const vendedorMes = [...d.intMes, ...d.extMes].find(v => v.slug === slug);
  if (!vendedorMes) return [];
  const mf = d.metasFilial;
  const resultado = [];
  if (vendedorMes.meta && vendedorMes.vendas >= vendedorMes.meta) {
    resultado.push({ value: 'individual', label: 'Meta Individual do Mês', proxima: null });
  }
  if (mf && mf.semanal_m1 && d.totalSemana >= mf.semanal_m1) {
    resultado.push({ value: 'm1', label: 'M1 — Meta Semanal', proxima: 'M2 — Meta Semanal da Filial' });
  }
  if (mf && mf.semanal_m2 && d.totalSemana >= mf.semanal_m2) {
    resultado.push({ value: 'm2', label: 'M2 — Meta Semanal', proxima: 'M3 — Meta Semanal da Filial' });
  }
  if (mf && mf.semanal_m3 && d.totalSemana >= mf.semanal_m3) {
    resultado.push({ value: 'm3', label: 'M3 — Meta Semanal', proxima: 'Meta Global do Mês' });
  }
  return resultado;
}

// Chamada pelo <select> de vendedor na aba Celebrações — repopula o
// <select> de metas só com as que essa pessoa bateu de verdade.
function atualizarMetasCelebraveis() {
  const slug = document.getElementById('cel-vendedor').value;
  const metaSelect = document.getElementById('cel-meta');
  const infoEl = document.getElementById('cel-preview-info');
  if (!slug) {
    metaSelect.innerHTML = '<option value="">Selecione o vendedor primeiro</option>';
    infoEl.textContent = '';
    return;
  }
  const metas = metasBatidasDoVendedor(slug);
  if (!metas.length) {
    metaSelect.innerHTML = '<option value="">Nenhuma meta batida no momento</option>';
    infoEl.textContent = 'Esse vendedor ainda não bateu nenhuma meta disponível pra celebrar (individual do mês ou M1/M2/M3 da semana).';
    return;
  }
  metaSelect.innerHTML = metas.map(m => `<option value="${m.value}">${m.label}</option>`).join('');
  infoEl.textContent = '';
}

async function gerarGifCelebracao() {
  const slug = document.getElementById('cel-vendedor').value;
  const metaValue = document.getElementById('cel-meta').value;
  if (!slug || !metaValue) { showToast('Selecione o vendedor e a meta batida.', 'warning'); return; }

  const d = _ultimoProcessado;
  if (!d) { showToast('Ainda não há dados carregados.', 'warning'); return; }

  const metas = metasBatidasDoVendedor(slug);
  const metaInfo = metas.find(m => m.value === metaValue);
  if (!metaInfo) { showToast('Essa meta não está mais disponível pra esse vendedor.', 'error'); return; }

  const vendedorSemana = [...d.intSem, ...d.extSem].find(v => v.slug === slug);
  if (!vendedorSemana) { showToast('Vendedor não encontrado.', 'error'); return; }

  // ── Preenche o template oculto ──────────────────────────────────
  const foto = PHOTOS[slug];
  document.getElementById('gf-avatar').innerHTML = foto ? `<img src="${foto}" alt="">` : vendedorSemana.nome.charAt(0).toUpperCase();
  document.getElementById('gf-nome').textContent = vendedorSemana.nome;
  document.getElementById('gf-meta-label').textContent = metaInfo.label;
  document.getElementById('gf-congrats').textContent = `Parabéns, ${vendedorSemana.nome}!`;
  document.getElementById('gf-proxima').textContent = metaInfo.proxima
    ? `Próxima meta: ${metaInfo.proxima}`
    : 'Continue somando vendas pra ir além este mês!';

  const btn = document.getElementById('cel-gerar-btn');
  const textoOriginalBtn = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Gerando GIF... (leva alguns segundos)';

  try {
    if (typeof html2canvas === 'undefined' || typeof GIF === 'undefined') {
      carregarLibsAdmin(); showToast('Bibliotecas de imagem/GIF ainda carregando — aguarde alguns segundos e tente de novo.', 'error');
      btn.disabled = false;
      btn.textContent = textoOriginalBtn;
      return;
    }

    // fotografa o card "parado" — essa imagem vira o fundo de TODOS
    // os frames do gif; a animação por cima é só sinal/conexão (anéis
    // tipo "ping" saindo do selo + partículas de sinal subindo),
    // sempre nas cores da marca — nada de confete.
    const SCALE = 1.5;
    const badgeEl = document.getElementById('gf-badge-wrap');
    const cardEl = document.getElementById('gf-card');
    const bRect = badgeEl.getBoundingClientRect();
    const cRect = cardEl.getBoundingClientRect();
    const cx = (bRect.left - cRect.left + bRect.width / 2) * SCALE;
    const cy = (bRect.top - cRect.top + bRect.height / 2) * SCALE;

    const baseCanvas = await html2canvas(cardEl, { backgroundColor: '#05070d', scale: SCALE });
    const W = baseCanvas.width, H = baseCanvas.height;

    // anéis de "ping" (tipo sinal de wifi/sonar) expandindo e sumindo
    // a partir do selo — posição determinística por frame, sem estado
    const NUM_ANEIS = 3;
    const CICLO_ANEL = 26; // frames que um anel leva pra nascer, crescer e sumir

    // partículas de sinal subindo devagar com leve oscilação lateral e
    // brilho (glow) — como "pacotes de dados" transmitindo, não confete
    const CICLO_ALTURA = H + 60;
    const particulasSinal = Array.from({ length: 24 }, () => ({
      x: Math.random() * W,
      offsetY: Math.random() * CICLO_ALTURA,
      vy: (0.6 + Math.random() * 0.7) * SCALE,
      amplitude: (8 + Math.random() * 16) * SCALE,
      freq: 0.03 + Math.random() * 0.04,
      fase: Math.random() * Math.PI * 2,
      raio: (1.6 + Math.random() * 2.2) * SCALE,
      cor: Math.random() > 0.5 ? '94,234,255' : '124,140,255',
    }));

    const workerBlob = await fetch('https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js').then(r => {
      if (!r.ok) throw new Error('Não foi possível carregar o worker do gif.js');
      return r.blob();
    });

    const gif = new GIF({
      workers: 2,
      quality: 8,
      workerScript: URL.createObjectURL(workerBlob),
      width: W,
      height: H,
      background: '#05070d',
      repeat: 0, // looping infinito
    });

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = W;
    frameCanvas.height = H;
    const ctx = frameCanvas.getContext('2d');

    const TOTAL_FRAMES = 36;
    for (let f = 0; f < TOTAL_FRAMES; f++) {
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(baseCanvas, 0, 0);

      // anéis de ping saindo do selo, defasados entre si
      for (let i = 0; i < NUM_ANEIS; i++) {
        const t = ((f + i * (CICLO_ANEL / NUM_ANEIS)) % CICLO_ANEL) / CICLO_ANEL; // 0..1
        const raio = (46 + t * 92) * SCALE;
        const alpha = (1 - t) * 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, raio, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(94,234,255,${alpha.toFixed(3)})`;
        ctx.lineWidth = 2.5 * SCALE;
        ctx.stroke();
      }

      // partículas de sinal subindo, com brilho, nascendo/sumindo suave
      particulasSinal.forEach(p => {
        const posInCycle = ((f * p.vy + p.offsetY) % CICLO_ALTURA) / CICLO_ALTURA;
        const y = H - posInCycle * CICLO_ALTURA;
        const x = p.x + Math.sin(f * p.freq + p.fase) * p.amplitude;
        const alpha = Math.max(0.05, Math.sin(Math.PI * posInCycle));
        ctx.save();
        ctx.shadowColor = `rgba(${p.cor},0.9)`;
        ctx.shadowBlur = 9 * SCALE;
        ctx.beginPath();
        ctx.arc(x, y, p.raio, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.cor},${alpha.toFixed(3)})`;
        ctx.fill();
        ctx.restore();
      });

      gif.addFrame(ctx, { copy: true, delay: 55 });
    }

    gif.on('finished', (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Comemoracao_${vendedorSemana.nome}_${metaValue}_${new Date().toISOString().split('T')[0]}.gif`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('GIF de comemoração gerado com sucesso!', 'success');
      btn.disabled = false;
      btn.textContent = textoOriginalBtn;
    });
    gif.render();
  } catch (err) {
    console.error('[gerarGifCelebracao]', err);
    showToast('Não foi possível gerar o GIF.', 'error');
    btn.disabled = false;
    btn.textContent = textoOriginalBtn;
  }
}

// ================================================================
// ARTE "DESTAQUE DO MÊS" — peça exclusiva pra quem é o destaque do
// mês (diferente do card de meta individual). Reaproveita o mesmo
// sistema de metas M1/M2/M3 (calcularTiersIndividuais) pra mostrar
// qual foi a melhor meta batida, e a posição real no ranking mensal
// pro selo "Nº_ em vendas" — nada aqui é inventado.
// ================================================================

// (a contagem dos números agora acontece DENTRO do vídeo, desenhada em
// canvas — veja gerarDestaqueDoMes; não precisa mais animar no DOM,
// nem popular partículas de CSS: as partículas do vídeo também são
// desenhadas em canvas, quadro a quadro, dentro da mesma função.)

// Medalhas pré-renderizadas (números 1 a 5) — geradas como imagem
// pronta porque a biblioteca que tira a "foto" do card (html2canvas)
// não desenha bem gradientes de SVG; como PNG, funciona sempre.
const DM_MEDALHAS = {
  1: 'data:image/webp;base64,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',
  2: 'data:image/webp;base64,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',
  3: 'data:image/webp;base64,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',
  4: 'data:image/webp;base64,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',
  5: 'data:image/webp;base64,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',
};

const DM_FRASES = [
  'Seu foco, comprometimento e dedicação são inspiração para todo o time. Continue assim.',
  'Resultado de quem não abre mão da constância. Parabéns pelo mês!',
  'Um exemplo de dedicação para toda a equipe seguir. Continue nesse ritmo.',
  'Consistência que vira resultado, mês após mês. Muito bem!',
];

async function gerarDestaqueDoMes(slug, evt) {
  if (!slug) { showToast('Selecione o vendedor destaque.', 'warning'); return; }
  const d = _ultimoProcessado;
  if (!d) { showToast('Ainda não há dados carregados.', 'warning'); return; }

  const vendedorMes = [...d.intMes, ...d.extMes].find(v => v.slug === slug);
  if (!vendedorMes) { showToast('Vendedor não encontrado.', 'error'); return; }

  // posição real no ranking MENSAL, dentro do próprio grupo (interno/externo)
  // — vira o número dentro da medalha. Mesmo critério de desempate:
  // em caso de empate no número de vendas, maior valor total decide.
  const grupo = (vendedorMes.tipo === 'interno' ? d.intMes : d.extMes).slice().sort((a, b) => (b.vendas - a.vendas) || ((b.valor || 0) - (a.valor || 0)));
  const posicao = grupo.findIndex(v => v.slug === slug) + 1;

  const mesNome = (d.mes && d.mes.mesNome) ? (d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1)) : CONFIG.mesReferencia;
  const ano = (d.mes && d.mes.ano) || CONFIG.ano;

  const pessoa = PESSOAS[slug] || {};
  const nomeCompleto = pessoa.sobrenome ? `${vendedorMes.nome} ${pessoa.sobrenome}` : vendedorMes.nome;
  const cargo = vendedorMes.tipo === 'interno' ? 'Consultor(a) de Vendas Interno' : 'Consultor(a) de Vendas Externo';

  // ── Preenche o template oculto ──────────────────────────────────
  document.getElementById('dm-mes-pill').textContent = mesNome;
  document.getElementById('dm-local').textContent = CONFIG.filialLocalizacao;
  document.getElementById('dm-photo').src = PHOTOS[slug] || '';
  document.getElementById('dm-medalha-img').src = DM_MEDALHAS[Math.min(posicao, 5)] || DM_MEDALHAS[5];
  document.getElementById('dm-name').textContent = nomeCompleto;
  document.getElementById('dm-role2').textContent = cargo;
  document.getElementById('dm-quote').textContent = DM_FRASES[vendedorMes.vendas % DM_FRASES.length];

  const btn = evt ? evt.target.closest('button') : null;
  const textoOriginalBtn = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = 'Gerando imagem...'; }
  try {
    if (typeof html2canvas === 'undefined') {
      carregarLibsAdmin(); showToast('Biblioteca de imagem ainda carregando — aguarde alguns segundos e tente de novo.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn; }
      return;
    }

    const cardEl = document.getElementById('dm-card');
    const canvas = await html2canvas(cardEl, { backgroundColor: '#000fe3', scale: 3 });
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DestaqueDoMes_${nomeCompleto.replace(/\s+/g, '_')}_${mesNome}${ano}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast('Imagem de Destaque do Mês gerada com sucesso!', 'success');
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn; }
  } catch (err) {
    console.error('[gerarDestaqueDoMes]', err);
    showToast('Não foi possível gerar a imagem.', 'error');
    if (btn) { btn.disabled = false; btn.textContent = textoOriginalBtn; }
  }
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
  const periodoEls = [document.getElementById('cfg-fil-periodo'), document.getElementById('cfg-ind-periodo'), document.getElementById('cfg-renov-periodo'), document.getElementById('cfg-cancel-periodo')];
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

  // Renovações e Cancelamentos do mês (manuais, sem cálculo — só o
  // que já estiver salvo em _cache.metasRenovCancel)
  const rc = cache.metasRenovCancel;
  setVal('cfg-renov-m3', rc ? rc.renovacoes_m3 : null);
  setVal('cfg-renov-m2', rc ? rc.renovacoes_m2 : null);
  setVal('cfg-renov-m1', rc ? rc.renovacoes_m1 : null);
  setVal('cfg-renov-atual', rc ? rc.renovacoes_atual : null);
  setVal('cfg-cancel-m3', rc ? rc.cancelamentos_m3 : null);
  setVal('cfg-cancel-m2', rc ? rc.cancelamentos_m2 : null);
  setVal('cfg-cancel-m1', rc ? rc.cancelamentos_m1 : null);
  setVal('cfg-cancel-atual', rc ? rc.cancelamentos_atual : null);

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
    // As colunas de metas_filial são NOT NULL no Supabase: campo em branco
    // vai como 0 (o site já trata 0 como "meta não definida" e mostra "—").
    meta_semanal_m3: dados.semanal_m3 ?? 0,
    meta_semanal_m2: dados.semanal_m2 ?? 0,
    meta_semanal_m1: dados.semanal_m1 ?? 0,
    meta_mensal_m3: dados.mensal_m3 ?? 0,
    meta_mensal_m2: dados.mensal_m2 ?? 0,
    meta_mensal_m1: dados.mensal_m1 ?? 0,
  };
  const existente = _cache.metasFilial;
  if (existente && existente.id) {
    const { error } = await window._supabase.from('metas_filial').update(dadosSupabase).eq('id', existente.id);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível salvar a meta da filial: ' + error.message); }
  } else {
    const payload = { filial_id: window.FILIAL_ATUAL_ID, mes: _cache.mes.mesNum, ano: _cache.mes.ano, ...dadosSupabase };
    const { error } = await window._supabase.from('metas_filial').insert([payload]);
    if (error) { console.error('[salvarMetaFilial]', error); throw new Error('Não foi possível criar a meta da filial: ' + error.message); }
  }
}

// Salva/atualiza a meta individual de um vendedor no mês/ano atual (metas).
// Mesma lógica de UPDATE-ou-INSERT (equivalente a upsert) do item acima.
async function salvarMetaVendedor(vendedor_id, dados) {
  const payload = { vendedor_id, mes: _cache.mes.mesNum, ano: _cache.mes.ano, ...dados };
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

// Salva/atualiza Renovações + Cancelamentos do mês (metas M1/M2/M3 e o
// "atual" de cada um) — tudo numa linha só por mes/ano, sem depender de
// nenhuma venda lançada (é o admin quem digita os números).
async function salvarMetaRenovCancel(dados) {
  const dadosSupabase = {
    renovacoes_meta_m3: dados.renovacoes_m3,
    renovacoes_meta_m2: dados.renovacoes_m2,
    renovacoes_meta_m1: dados.renovacoes_m1,
    renovacoes_atual: dados.renovacoes_atual ?? 0,
    cancelamentos_meta_m3: dados.cancelamentos_m3,
    cancelamentos_meta_m2: dados.cancelamentos_m2,
    cancelamentos_meta_m1: dados.cancelamentos_m1,
    cancelamentos_atual: dados.cancelamentos_atual ?? 0,
  };
  const existente = _cache.metasRenovCancel;
  if (existente && existente.id) {
    const { error } = await window._supabase.from('metas_renovacao_cancelamento').update(dadosSupabase).eq('id', existente.id);
    if (error) { console.error('[salvarMetaRenovCancel]', error); throw new Error('Não foi possível salvar as metas de renovação/cancelamento: ' + error.message); }
  } else {
    const payload = { filial_id: window.FILIAL_ATUAL_ID, mes: _cache.mes.mesNum, ano: _cache.mes.ano, ...dadosSupabase };
    const { error } = await window._supabase.from('metas_renovacao_cancelamento').insert([payload]);
    if (error) { console.error('[salvarMetaRenovCancel]', error); throw new Error('Não foi possível criar as metas de renovação/cancelamento: ' + error.message); }
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

  // 3) Ler e validar Renovações e Cancelamentos do mês
  const camposRenovCancel = ['cfg-renov-m3', 'cfg-renov-m2', 'cfg-renov-m1', 'cfg-renov-atual',
                             'cfg-cancel-m3', 'cfg-cancel-m2', 'cfg-cancel-m1', 'cfg-cancel-atual'];
  const leiturasRenovCancel = camposRenovCancel.map(lerMetaInput);
  if (leiturasRenovCancel.some(l => !l.ok)) {
    showToast('Preencha Renovações/Cancelamentos com números inteiros maiores ou iguais a zero (ou deixe em branco).', 'warning');
    return;
  }
  const dadosRenovCancel = {
    renovacoes_m3: leiturasRenovCancel[0].valor, renovacoes_m2: leiturasRenovCancel[1].valor, renovacoes_m1: leiturasRenovCancel[2].valor, renovacoes_atual: leiturasRenovCancel[3].valor,
    cancelamentos_m3: leiturasRenovCancel[4].valor, cancelamentos_m2: leiturasRenovCancel[5].valor, cancelamentos_m1: leiturasRenovCancel[6].valor, cancelamentos_atual: leiturasRenovCancel[7].valor,
  };

  // 4) Só depois de validar tudo, gravar no Supabase
  try {
    await salvarMetaFilial(dadosFilial);
    for (const v of vendedoresParaSalvar) {
      await salvarMetaVendedor(v.vendedor_id, v.dados);
    }
    await salvarMetaRenovCancel(dadosRenovCancel);
    // 5) Só depois de tudo salvo com sucesso, recarregar os dados reais
    await carregarDados();
    showToast('Metas atualizadas com sucesso!', 'success');
  } catch (err) {
    console.error('[handleSalvarMetas]', err);
    showToast((err && err.message) ? err.message : 'Não foi possível salvar as metas. Verifique a conexão com o Supabase.', 'error');
  }
}

// ── Inicializar totalizador quando a seção for aberta ────────────
// (chamado pelo adm_navigateTo, veja listener abaixo)


document.addEventListener('DOMContentLoaded', function() {

document.getElementById('adm-trigger').addEventListener('click', adm_showLogin);

document.getElementById('adm-login-back').addEventListener('click', adm_hideLogin);

document.getElementById('adm-login-btn').addEventListener('click', async () => {
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
    adm_hideLogin();
    await adm_showPanel();
    document.getElementById('adm-user-info').textContent = '👤 ' + email;
  } catch (err) {
    errEl.textContent = err.message.includes('permissão')
      ? err.message
      : err.message.includes('não inicializado')
        ? '⚠️ Preencha SUPABASE_URL e SUPABASE_ANON_KEY no código antes de usar o login.'
        : 'E-mail ou senha incorretos.';
    errEl.classList.add('visible');
  } finally {
    btn.textContent = 'Entrar';
    btn.classList.remove('adm-loading');
  }
});

// Enter no campo de senha faz login
document.getElementById('adm-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('adm-login-btn').click();
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
      a.title = 'Apresentação automática para a TV da loja'; a.textContent = '📺 Modo TV';
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
    meta: porId('metaCardSection'), destaques: secaoDe('destaquesGrid'),
    rankSemanal: document.querySelector('[data-tab-panel="semanal"]'),
    rankMensal: document.querySelector('[data-tab-panel="mensal"]'),
    filial: porId('metasFilialSection'), churn: document.querySelector('.churn-dash'),
    murais: document.querySelector('.murais-duo'), evolucao: secaoDe('evolucaoChart'),
    planos: secaoDe('donutChart'), conquistas: secaoDe('conquistasGrid'),
  };
  const slides = [
    { titulo: 'Meta da Semana e Destaques', tab: 'semanal', show: ['meta', 'destaques'] },
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
