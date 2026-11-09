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
window.ADMIN_FILIAL_ID = null;
window.ADMIN_AUTENTICADO = false;
let _vendedoresTodasFiliais = [];
let _vendedoresVisaoGlobal = [];
let _vendedoresVisaoGlobalPagina = 1;
let _carreiraRanksSchemaDisponivel = false;
const VENDEDORES_GLOBAIS_POR_PAGINA = 15;
let _vendedorFotoPreviewUrl = null;
let _vendedoresGerenciamento = [];
let _filialGerenciadaEmEdicaoId = null;
let _dashboardRedeDados = null;
const EDGE_FN_GERENCIAR_ADMINS = 'rapid-task';
const BUCKET_FOTOS_VENDEDORES = 'vendedor-fotos';

function conferirEscopoAdmin(adminData) {
  if (adminData?.is_superadmin === true) {
    window.ADMIN_FILIAL_ID = null;
    window.ADMIN_AUTENTICADO = true;
    return true;
  }
  const filialAdminId = adminData?.filial_id == null ? null : Number(adminData.filial_id);
  if (filialAdminId === null || filialAdminId !== Number(window.FILIAL_ATUAL_ID)) {
    window.ADMIN_FILIAL_ID = null;
    window.ADMIN_AUTENTICADO = false;
    return false;
  }
  window.ADMIN_FILIAL_ID = filialAdminId;
  window.ADMIN_AUTENTICADO = true;
  return true;
}

function initSupabase() {
  if (window._supabase) return true;
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

function atualizarSeletorRegionalADM(filiais) {
  const wrap = document.getElementById('adm-region-switch-wrap');
  const select = document.getElementById('adm-region-switch');
  if (!wrap || !select) return;
  const disponivel = window.ADMIN_AUTENTICADO && window.ADMIN_FILIAL_ID == null;
  wrap.hidden = !disponivel;
  if (!disponivel) return;

  const regionais = (filiais || []).filter(f => f.ativo !== false && f.site_habilitado === true);
  select.replaceChildren(...regionais.map(f => new Option(f.nome, String(f.id))));
  select.value = String(window.FILIAL_ATUAL_ID);
  if (select.dataset.bound) return;
  select.dataset.bound = 'true';
  select.addEventListener('change', async () => {
    if (!ehSuperAdminAtual()) return;
    const filial = (_cache.filiais || regionais).find(f => f.ativo !== false && f.site_habilitado === true && Number(f.id) === Number(select.value));
    if (!filial || Number(filial.id) === Number(window.FILIAL_ATUAL_ID)) return;
    const filialAnterior = window.FILIAL_ATUAL;
    const url = new URL(window.location.href);
    url.searchParams.set('filial', filial.slug);
    window.history.replaceState({}, '', url.toString());
    select.disabled = true;
    document.getElementById('adm-panel')?.setAttribute('aria-busy', 'true');
    try {
      await carregarDados();
      if (!_dadosCarregados || Number(window.FILIAL_ATUAL_ID) !== Number(filial.id)) throw new Error('A regional não carregou.');
      showToast(`Regional alterada para ${filial.nome}.`, 'success');
    } catch (err) {
      console.error('[trocaRegionalADM]', err);
      if (filialAnterior?.slug) {
        const urlAnterior = new URL(window.location.href);
        urlAnterior.searchParams.set('filial', filialAnterior.slug);
        window.history.replaceState({}, '', urlAnterior.toString());
        await carregarDados();
      }
      showToast('Não foi possível carregar essa regional.', 'error');
    } finally {
      select.disabled = false;
      document.getElementById('adm-panel')?.removeAttribute('aria-busy');
      select.value = String(window.FILIAL_ATUAL_ID);
    }
  });
}

function abrirFilialSite(slug) {
  if (!slug || !window.FILIAL_ATUAL || slug === window.FILIAL_ATUAL.slug) return;
  if (document.documentElement.classList.contains('filial-page-exiting')) return;
  const url = new URL(window.location.href);
  url.searchParams.set('filial', slug);
  const reduzirMovimento = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
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
  if (!window._supabase) { window.ADMIN_AUTENTICADO = false; return null; }
  const { data: { session } } = await window._supabase.auth.getSession();
  if (!session) {
    window.ADMIN_FILIAL_ID = null;
    window.ADMIN_AUTENTICADO = false;
    return null;
  }
  // Verificar se o usuário está em admin_usuarios com ativo = true
  const { data, error } = await window._supabase
    .from('admin_usuarios')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('ativo', true)
    .single();
  if (error || !data) {
    window.ADMIN_FILIAL_ID = null;
    window.ADMIN_AUTENTICADO = false;
    await window._supabase.auth.signOut();
    return null;
  }
  if (!conferirEscopoAdmin(data)) {
    await window._supabase.auth.signOut();
    return null;
  }
  return session;
}

async function loginAdmin(email, password) {
  if (!window._supabase) throw new Error('Supabase não inicializado.');
  const { data, error } = await window._supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  // Verificar se é admin
  const { data: adminData, error: adminError } = await window._supabase
    .from('admin_usuarios')
    .select('*')
    .eq('user_id', data.user.id)
    .eq('ativo', true)
    .single();
  if (adminError || !adminData) {
    window.ADMIN_FILIAL_ID = null;
    window.ADMIN_AUTENTICADO = false;
    await window._supabase.auth.signOut();
    throw new Error('Usuário sem permissão administrativa.');
  }
  if (!conferirEscopoAdmin(adminData)) {
    await window._supabase.auth.signOut();
    throw new Error('Usuário sem permissão administrativa para a regional selecionada.');
  }
  return data;
}

async function logoutAdmin() {
  if (!window._supabase) return;
  await window._supabase.auth.signOut();
  window.ADMIN_FILIAL_ID = null;
  window.ADMIN_AUTENTICADO = false;
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

function prepararCadastroVendedor() {
  const form = document.getElementById('adm-vendedor-form');
  const filialSelect = document.getElementById('adm-vendedor-filial');
  const filialField = document.getElementById('adm-vendedor-filial-field');
  const hint = document.getElementById('adm-vendedor-escopo-hint');
  if (!form || !filialSelect) return;

  const filiais = (_cache.filiais || []).filter(f => f.ativo !== false);
  const isSuperAdmin = window.ADMIN_AUTENTICADO && window.ADMIN_FILIAL_ID == null;
  const filialDoAdmin = isSuperAdmin
    ? null
    : filiais.find(f => Number(f.id) === Number(window.ADMIN_FILIAL_ID));

  filialSelect.replaceChildren();
  if (isSuperAdmin) {
    filiais.forEach(filial => {
      const option = new Option(filial.nome, String(filial.id));
      filialSelect.add(option);
    });
    filialSelect.disabled = false;
    filialSelect.required = true;
    filialSelect.value = String(window.FILIAL_ATUAL_ID);
    if (filialField) filialField.hidden = false;
    if (hint) hint.textContent = 'Como superadministrador, você pode escolher a regional do novo vendedor.';
  } else if (filialDoAdmin) {
    filialSelect.add(new Option(filialDoAdmin.nome, String(filialDoAdmin.id)));
    filialSelect.value = String(filialDoAdmin.id);
    filialSelect.disabled = true;
    filialSelect.required = false;
    if (filialField) filialField.hidden = false;
    if (hint) hint.textContent = `Este acesso cadastra vendedores somente em ${filialDoAdmin.nome}.`;
  } else {
    filialSelect.add(new Option('Filial não disponível para este acesso', ''));
    filialSelect.disabled = true;
    filialSelect.required = false;
    if (filialField) filialField.hidden = false;
    if (hint) hint.textContent = 'Não foi possível confirmar a regional deste acesso.';
  }
  const vendedorEmEdicao = buscarVendedorGerenciado(document.getElementById('adm-vendedor-edit-id')?.value);
  if (vendedorEmEdicao) {
    filialSelect.value = String(vendedorEmEdicao.filial_id);
    filialSelect.disabled = true;
  }
}

function buscarVendedorGerenciado(id) {
  const numeroId = Number(id);
  if (!numeroId) return null;
  return _vendedoresGerenciamento.find(v => Number(v.id) === numeroId)
    || _vendedoresVisaoGlobal.find(v => Number(v.id) === numeroId)
    // A tabela de desempenho usa os vendedores já carregados no dashboard.
    // As listas de gerenciamento são carregadas sob demanda e podem ainda
    // estar vazias quando o superadministrador clica em "Editar" nessa tabela.
    || (typeof _cache !== 'undefined' ? (_cache.vendedores || []).find(v => Number(v.id) === numeroId) : null)
    || null;
}

function limparEstadoEdicaoVendedor() {
  const idEl = document.getElementById('adm-vendedor-edit-id');
  const titulo = document.getElementById('adm-vendedor-form-title');
  const botao = document.getElementById('adm-vendedor-submit');
  const cancelar = document.getElementById('adm-vendedor-cancel-edit');
  const filialSelect = document.getElementById('adm-vendedor-filial');
  if (idEl) idEl.value = '';
  if (titulo) titulo.textContent = 'Cadastrar vendedor';
  if (botao) botao.textContent = 'Cadastrar vendedor';
  if (cancelar) cancelar.hidden = true;
  if (filialSelect) filialSelect.disabled = window.ADMIN_FILIAL_ID != null;
}

function cancelarEdicaoVendedor() {
  const form = document.getElementById('adm-vendedor-form');
  form?.reset();
  limparFotoVendedor();
  limparEstadoEdicaoVendedor();
  prepararCadastroVendedor();
}

function iniciarEdicaoVendedor(id) {
  if (!ehSuperAdminAtual()) {
    showToast('Somente o superadministrador pode editar vendedores.', 'error');
    return;
  }
  const vendedor = buscarVendedorGerenciado(id);
  if (!vendedor || !vendedor.ativo) {
    showToast('Este vendedor não está disponível para edição.', 'warning');
    return;
  }
  if (window.ADMIN_FILIAL_ID != null && Number(vendedor.filial_id) !== Number(window.ADMIN_FILIAL_ID)) {
    showToast('Este acesso só pode editar vendedores da própria regional.', 'error');
    return;
  }

  const form = document.getElementById('adm-vendedor-form');
  document.getElementById('adm-vendedor-edit-id').value = String(vendedor.id);
  document.getElementById('adm-vendedor-nome').value = vendedor.nome || '';
  document.getElementById('adm-vendedor-tipo').value = vendedor.tipo || '';
  document.getElementById('adm-vendedor-ixc-id').value = vendedor.ixc_vendedor_id || '';
  document.getElementById('adm-vendedor-participa-ranking').checked = vendedor.participa_ranking !== false;
  const filialSelect = document.getElementById('adm-vendedor-filial');
  if (filialSelect) {
    filialSelect.value = String(vendedor.filial_id);
    filialSelect.disabled = true;
  }
  document.getElementById('adm-vendedor-form-title').textContent = `Editar vendedor — ${vendedor.nome}`;
  document.getElementById('adm-vendedor-submit').textContent = 'Salvar alterações';
  document.getElementById('adm-vendedor-cancel-edit').hidden = false;

  limparFotoVendedor();
  const fotoAtual = vendedor.foto_url || PHOTOS[vendedor.slug] || '';
  if (fotoAtual) {
    document.getElementById('adm-vendedor-foto-preview-img').src = fotoAtual;
    document.getElementById('adm-vendedor-foto-preview-nome').textContent = 'Foto atual (escolha outra para substituir)';
    document.getElementById('adm-vendedor-foto-preview').hidden = false;
  }
  form?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function carregarVendedoresGerenciamento() {
  const tbody = document.getElementById('adm-vendedores-inativos-tbody');
  if (!tbody || !window._supabase || !window.FILIAL_ATUAL_ID) return;
  const { data, error } = await window._supabase
    .from('vendedores')
    .select('id, nome, tipo, slug, filial_id, ativo, foto_url, ixc_vendedor_id, participa_ranking')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .order('nome');
  if (error) {
    console.error('[carregarVendedoresGerenciamento]', error);
    tbody.innerHTML = '<tr><td colspan="3" class="adm-empty-state">Não foi possível carregar os vendedores desativados.</td></tr>';
    return;
  }
  _vendedoresGerenciamento = data || [];
  const inativos = _vendedoresGerenciamento.filter(v => !v.ativo);
  tbody.replaceChildren();
  if (!inativos.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.className = 'adm-empty-state';
    td.textContent = 'Nenhum vendedor desativado nesta regional.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  inativos.forEach(v => {
    const tr = document.createElement('tr');
    const nome = document.createElement('td');
    nome.textContent = v.nome;
    const tipo = document.createElement('td');
    tipo.textContent = v.tipo === 'interno' ? 'Interno' : 'Externo';
    const situacao = document.createElement('td');
    if (ehSuperAdminAtual()) {
      const reativar = document.createElement('button');
      reativar.type = 'button';
      reativar.className = 'adm-btn adm-btn-small';
      reativar.textContent = 'Reativar';
      reativar.addEventListener('click', () => alterarStatusVendedor(v.id, true));
      situacao.appendChild(reativar);
    } else {
      situacao.textContent = 'Desativado';
    }
    tr.append(nome, tipo, situacao);
    tbody.appendChild(tr);
  });
}

function renderizarVendedoresVisaoGlobal() {
  const tbody = document.getElementById('adm-vendedores-global-tbody');
  const filtro = document.getElementById('adm-vendedores-global-filial');
  const busca = document.getElementById('adm-vendedores-global-busca');
  const paginacao = document.getElementById('adm-vendedores-global-paginacao');
  if (!tbody || !filtro) return;
  const filialPorId = new Map((_cache.filiais || []).map(f => [String(f.id), f.nome]));
  const filialEscolhida = filtro.value || 'todas';
  const termo = String(busca?.value || '').trim().toLocaleLowerCase('pt-BR');
  const vendedores = _vendedoresVisaoGlobal.filter(v => {
    if (filialEscolhida !== 'todas' && String(v.filial_id) !== filialEscolhida) return false;
    const filialNome = filialPorId.get(String(v.filial_id)) || '';
    const texto = `${v.nome || ''} ${filialNome} ${v.tipo || ''} ${v.ativo ? 'ativo' : 'desativado'} ${v.participa_ranking === false ? 'somente relatórios matriz supervisão' : 'participa ranking'}`.toLocaleLowerCase('pt-BR');
    return !termo || texto.includes(termo);
  });
  const totalPaginas = Math.max(1, Math.ceil(vendedores.length / VENDEDORES_GLOBAIS_POR_PAGINA));
  _vendedoresVisaoGlobalPagina = Math.min(Math.max(1, _vendedoresVisaoGlobalPagina), totalPaginas);
  const inicio = (_vendedoresVisaoGlobalPagina - 1) * VENDEDORES_GLOBAIS_POR_PAGINA;
  const vendedoresPagina = vendedores.slice(inicio, inicio + VENDEDORES_GLOBAIS_POR_PAGINA);
  tbody.replaceChildren();
  if (!vendedores.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'adm-empty-state';
    td.textContent = 'Nenhum vendedor cadastrado para esta seleção.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    if (paginacao) paginacao.replaceChildren();
    return;
  }
  const quantidadePorIdentidade = new Map();
  _vendedoresVisaoGlobal.forEach(item => {
    const chave = String(item.carreira_pessoa_id || item.id);
    quantidadePorIdentidade.set(chave, (quantidadePorIdentidade.get(chave) || 0) + 1);
  });
  vendedoresPagina.forEach(v => {
    const tr = document.createElement('tr');
    const nome = document.createElement('td');
    nome.textContent = v.nome || '—';
    const tipo = document.createElement('td');
    tipo.textContent = v.tipo === 'interno' ? 'Interno' : 'Externo';
    const filial = document.createElement('td');
    filial.textContent = filialPorId.get(String(v.filial_id)) || 'Regional não identificada';
    const status = document.createElement('td');
    status.textContent = `${v.ativo ? 'Ativo' : 'Desativado'}${v.participa_ranking === false ? ' · Somente relatórios' : ''}`;
    const identidade = document.createElement('td');
    identidade.className = 'adm-carreira-identidade';
    const membros = quantidadePorIdentidade.get(String(v.carreira_pessoa_id || v.id)) || 1;
    identidade.textContent = membros > 1 ? `Vinculada · ${membros} cadastros` : 'Cadastro individual';
    const acoes = document.createElement('td');
    acoes.className = 'adm-vendedor-actions';
    const criarBotao = (texto, classe, acao) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = `adm-btn adm-btn-small ${classe || ''}`.trim();
      botao.textContent = texto;
      botao.addEventListener('click', acao);
      return botao;
    };
    if (v.ativo) acoes.appendChild(criarBotao('Editar', '', () => iniciarEdicaoVendedor(v.id)));
    acoes.appendChild(criarBotao(v.ativo ? 'Desativar' : 'Reativar', v.ativo ? 'adm-btn-danger' : '', () => alterarStatusVendedor(v.id, !v.ativo)));
    acoes.appendChild(criarBotao('Excluir', 'adm-btn-danger', () => excluirVendedorGlobal(v.id)));
    tr.append(nome, tipo, filial, status, identidade, acoes);
    tbody.appendChild(tr);
  });
  if (paginacao) {
    paginacao.replaceChildren();
    if (totalPaginas > 1) {
      const anterior = document.createElement('button');
      anterior.type = 'button'; anterior.className = 'adm-btn adm-btn-secondary';
      anterior.textContent = '← Anterior'; anterior.disabled = _vendedoresVisaoGlobalPagina <= 1;
      anterior.addEventListener('click', () => mudarPaginaVendedoresVisaoGlobal(-1));
      const textoPagina = document.createElement('span');
      textoPagina.textContent = `Página ${_vendedoresVisaoGlobalPagina} de ${totalPaginas} · ${vendedores.length} vendedores`;
      const proxima = document.createElement('button');
      proxima.type = 'button'; proxima.className = 'adm-btn adm-btn-secondary';
      proxima.textContent = 'Próxima →'; proxima.disabled = _vendedoresVisaoGlobalPagina >= totalPaginas;
      proxima.addEventListener('click', () => mudarPaginaVendedoresVisaoGlobal(1));
      paginacao.append(anterior, textoPagina, proxima);
    } else {
      const textoPagina = document.createElement('span');
      textoPagina.textContent = `${vendedores.length} vendedor${vendedores.length === 1 ? '' : 'es'}`;
      paginacao.appendChild(textoPagina);
    }
  }
}

function mudarPaginaVendedoresVisaoGlobal(delta) {
  _vendedoresVisaoGlobalPagina += delta;
  renderizarVendedoresVisaoGlobal();
}

async function carregarVendedoresVisaoGlobal() {
  const tbody = document.getElementById('adm-vendedores-global-tbody');
  if (!ehSuperAdminAtual() || !window._supabase || !tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" class="adm-inline-status">Carregando vendedores de todas as regionais…</td></tr>';
  let { data, error } = await window._supabase
    .from('vendedores')
    .select('id, nome, tipo, slug, filial_id, ativo, foto_url, ixc_vendedor_id, participa_ranking, carreira_pessoa_id')
    .order('filial_id')
    .order('nome');
  if (error) {
    if (/carreira_pessoa_id|schema cache|column/i.test(error.message || '')) {
      _carreiraRanksSchemaDisponivel = false;
      const status = document.getElementById('adm-carreira-vinculo-status');
      if (status) status.textContent = 'Aplique uma vez supabase/progressao-ranks-carreira.sql no Supabase para ativar os vínculos.';
      ({ data, error } = await window._supabase
        .from('vendedores')
        .select('id, nome, tipo, slug, filial_id, ativo, foto_url, ixc_vendedor_id, participa_ranking')
        .order('filial_id')
        .order('nome'));
    } else {
      console.error('[carregarVendedoresVisaoGlobal]', error);
      tbody.innerHTML = '<tr><td colspan="6" class="adm-empty-state">Não foi possível carregar os vendedores de todas as regionais.</td></tr>';
      return;
    }
  } else {
    _carreiraRanksSchemaDisponivel = true;
    const status = document.getElementById('adm-carreira-vinculo-status');
    if (status) status.textContent = 'A identidade só precisa ser vinculada uma vez quando houver transferência. Os resultados mensais virão das importações habituais.';
  }
  if (error) {
    console.error('[carregarVendedoresVisaoGlobal]', error);
    tbody.innerHTML = '<tr><td colspan="6" class="adm-empty-state">Não foi possível carregar os vendedores de todas as regionais.</td></tr>';
    return;
  }
  _vendedoresVisaoGlobal = data || [];
  _vendedoresVisaoGlobalPagina = 1;
  popularSeletoresVinculoCarreira();
  renderizarVendedoresVisaoGlobal();
}

function popularSeletoresVinculoCarreira() {
  const novoSelect = document.getElementById('adm-carreira-vendedor-novo');
  const referenciaSelect = document.getElementById('adm-carreira-vendedor-referencia');
  if (!novoSelect || !referenciaSelect) return;
  novoSelect.disabled = !_carreiraRanksSchemaDisponivel;
  referenciaSelect.disabled = !_carreiraRanksSchemaDisponivel;
  const identidadePorId = new Map(_vendedoresVisaoGlobal.map(v => [String(v.id), String(v.carreira_pessoa_id || v.id)]));
  const formatar = v => {
    const filial = (_cache.filiais || []).find(f => Number(f.id) === Number(v.filial_id))?.nome || `Regional ${v.filial_id}`;
    return `${v.nome} · ${filial} · cadastro ${v.id}${v.ativo ? '' : ' · desativado'}`;
  };
  const preencher = (select, placeholder, valorAtual) => {
    select.replaceChildren(new Option(placeholder, ''));
    _vendedoresVisaoGlobal.forEach(v => select.add(new Option(formatar(v), String(v.id))));
    if (valorAtual && _vendedoresVisaoGlobal.some(v => String(v.id) === valorAtual)) select.value = valorAtual;
  };
  preencher(novoSelect, 'Selecione o cadastro novo', novoSelect.value);
  preencher(referenciaSelect, 'Selecione o cadastro anterior', referenciaSelect.value);
  const atualizarReferenciasDisponiveis = () => {
    const novoId = novoSelect.value;
    Array.from(referenciaSelect.options).forEach(option => {
      if (!option.value) return;
      option.disabled = option.value === novoId
        || (novoId && identidadePorId.get(option.value) === identidadePorId.get(novoId));
    });
    if (referenciaSelect.selectedOptions[0]?.disabled) referenciaSelect.value = '';
  };
  atualizarReferenciasDisponiveis();
  if (!novoSelect.dataset.listenerRegistrado) {
    novoSelect.addEventListener('change', atualizarReferenciasDisponiveis);
    novoSelect.dataset.listenerRegistrado = 'true';
  }
  const botao = document.getElementById('adm-carreira-vincular-btn');
  if (botao) {
    botao.disabled = !_carreiraRanksSchemaDisponivel;
    if (!botao.dataset.listenerRegistrado) {
      botao.addEventListener('click', vincularIdentidadeCarreira);
      botao.dataset.listenerRegistrado = 'true';
    }
  }
}

async function vincularIdentidadeCarreira() {
  const novoSelect = document.getElementById('adm-carreira-vendedor-novo');
  const referenciaSelect = document.getElementById('adm-carreira-vendedor-referencia');
  const botao = document.getElementById('adm-carreira-vincular-btn');
  const novoId = Number(novoSelect?.value || 0);
  const referenciaId = Number(referenciaSelect?.value || 0);
  if (!_carreiraRanksSchemaDisponivel || !ehSuperAdminAtual() || !novoId || !referenciaId || novoId === referenciaId) {
    showToast('Selecione o cadastro novo e o cadastro anterior da mesma pessoa.', 'warning');
    return;
  }
  const novo = _vendedoresVisaoGlobal.find(v => Number(v.id) === novoId);
  const referencia = _vendedoresVisaoGlobal.find(v => Number(v.id) === referenciaId);
  if (!novo || !referencia) {
    showToast('Confira os cadastros selecionados.', 'warning');
    return;
  }
  if (!confirm(`Vincular “${novo.nome}” (${(_cache.filiais || []).find(f => Number(f.id) === Number(novo.filial_id))?.nome || 'nova regional'}) ao histórico de “${referencia.nome}” (${(_cache.filiais || []).find(f => Number(f.id) === Number(referencia.filial_id))?.nome || 'regional anterior'})?`)) return;
  if (botao) { botao.disabled = true; botao.textContent = 'Vinculando…'; }
  try {
    const { error } = await window._supabase.rpc('vincular_identidade_carreira', {
      p_vendedor_novo: novoId,
      p_vendedor_referencia: referenciaId,
    });
    if (error) throw error;
    showToast('Identidade vinculada. A carreira continuará pelo cadastro anterior.', 'success');
    if (novoSelect) novoSelect.value = '';
    if (referenciaSelect) referenciaSelect.value = '';
    await carregarVendedoresVisaoGlobal();
  } catch (error) {
    console.error('[vincularIdentidadeCarreira]', error);
    showToast(error.message || 'Não foi possível vincular os cadastros.', 'error');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = 'Vincular identidade'; }
  }
}

async function alterarStatusVendedor(id, ativo) {
  if (!ehSuperAdminAtual()) {
    showToast('Somente o superadministrador pode alterar o status de vendedores.', 'error');
    return;
  }
  const vendedor = buscarVendedorGerenciado(id);
  if (!vendedor) return;
  if (!ativo && !confirm(`Desativar ${vendedor.nome}? O histórico de vendas será preservado.`)) return;
  try {
    const { data, error } = await window._supabase
      .from('vendedores')
      .update({ ativo })
      .eq('id', vendedor.id)
      .eq('filial_id', vendedor.filial_id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('O banco não autorizou a alteração para esta regional.');
    showToast(ativo ? `${vendedor.nome} foi reativado.` : `${vendedor.nome} foi desativado.`, 'success');
    if (Number(vendedor.filial_id) === Number(window.FILIAL_ATUAL_ID)) {
      await carregarDados();
      await carregarVendedoresGerenciamento();
    }
    const vendedoresTodasFiliais = await loadVendedoresTodasFiliais();
    popularSelectVendedoresTodasFiliais(vendedoresTodasFiliais);
    await carregarVendedoresVisaoGlobal();
  } catch (error) {
    console.error('[alterarStatusVendedor]', error);
    showToast(error.message || 'Não foi possível alterar o status do vendedor.', 'error');
  }
}

async function excluirVendedorGlobal(id) {
  if (!ehSuperAdminAtual() || !window._supabase) {
    showToast('Somente o superadministrador pode excluir vendedores.', 'error');
    return;
  }
  const vendedor = buscarVendedorGerenciado(id);
  if (!vendedor) return;
  if (!confirm(`Excluir permanentemente ${vendedor.nome} de ${(_cache.filiais || []).find(f => Number(f.id) === Number(vendedor.filial_id))?.nome || 'sua regional'}? A exclusão só será permitida quando não houver vendas ou dados vinculados.`)) return;

  try {
    const referencias = await Promise.all([
      window._supabase.from('vendas').select('id', { count: 'exact', head: true }).eq('vendedor_id', vendedor.id),
      window._supabase.from('metas').select('id', { count: 'exact', head: true }).eq('vendedor_id', vendedor.id),
      window._supabase.from('adicionais_avulsos').select('id', { count: 'exact', head: true }).eq('vendedor_id', vendedor.id),
    ]);
    const erroReferencia = referencias.find(resultado => resultado.error)?.error;
    if (erroReferencia) throw erroReferencia;
    const [vendas, metas, adicionais] = referencias.map(resultado => resultado.count || 0);
    if (vendas || metas || adicionais) {
      showToast(`Não é possível excluir: há ${vendas} venda(s), ${metas} meta(s) e ${adicionais} adicional(is) vinculados. Desative o vendedor para preservar o histórico.`, 'warning');
      return;
    }

    const { data, error } = await window._supabase.from('vendedores')
      .delete()
      .eq('id', vendedor.id)
      .eq('filial_id', vendedor.filial_id)
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('O Supabase não autorizou a exclusão deste vendedor.');

    await window._supabase.storage.from(BUCKET_FOTOS_VENDEDORES)
      .remove([`${vendedor.filial_id}/${vendedor.id}/avatar`]);
    showToast(`${vendedor.nome} foi excluído.`, 'success');
    if (Number(vendedor.filial_id) === Number(window.FILIAL_ATUAL_ID)) {
      await carregarDados();
      await carregarVendedoresGerenciamento();
    }
    const vendedoresTodasFiliais = await loadVendedoresTodasFiliais();
    popularSelectVendedoresTodasFiliais(vendedoresTodasFiliais);
    await carregarVendedoresVisaoGlobal();
  } catch (error) {
    console.error('[excluirVendedorGlobal]', error);
    showToast(error.code === '23503'
      ? 'Este vendedor possui registros vinculados. Desative-o para preservar o histórico.'
      : error.message || 'Não foi possível excluir o vendedor.', 'error');
  }
}

function slugVendedor(nome, filial) {
  const normalizar = valor => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return [normalizar(nome), normalizar(filial?.slug || filial?.nome)]
    .filter(Boolean)
    .join('-');
}

function limparFotoVendedor() {
  if (_vendedorFotoPreviewUrl) URL.revokeObjectURL(_vendedorFotoPreviewUrl);
  _vendedorFotoPreviewUrl = null;
  const input = document.getElementById('adm-vendedor-foto');
  const preview = document.getElementById('adm-vendedor-foto-preview');
  const img = document.getElementById('adm-vendedor-foto-preview-img');
  const nome = document.getElementById('adm-vendedor-foto-preview-nome');
  if (input) input.value = '';
  if (img) img.removeAttribute('src');
  if (nome) nome.textContent = '';
  if (preview) preview.hidden = true;
}

function previewFotoVendedor(event) {
  const input = event.currentTarget;
  const arquivo = input.files?.[0];
  if (!arquivo) return;
  const tiposAceitos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposAceitos.includes(arquivo.type)) {
    limparFotoVendedor();
    showToast('Escolha uma foto JPG, PNG ou WebP.', 'warning');
    return;
  }
  if (arquivo.size > 2 * 1024 * 1024) {
    limparFotoVendedor();
    showToast('A foto deve ter no máximo 2 MB.', 'warning');
    return;
  }
  if (_vendedorFotoPreviewUrl) URL.revokeObjectURL(_vendedorFotoPreviewUrl);
  _vendedorFotoPreviewUrl = URL.createObjectURL(arquivo);
  const img = document.getElementById('adm-vendedor-foto-preview-img');
  const nome = document.getElementById('adm-vendedor-foto-preview-nome');
  const preview = document.getElementById('adm-vendedor-foto-preview');
  if (img) img.src = _vendedorFotoPreviewUrl;
  if (nome) nome.textContent = arquivo.name;
  if (preview) preview.hidden = false;
}

async function cadastrarVendedor(event) {
  event.preventDefault();
  const form = document.getElementById('adm-vendedor-form');
  const botao = document.getElementById('adm-vendedor-submit');
  const editId = Number(document.getElementById('adm-vendedor-edit-id')?.value || 0) || null;
  if (!ehSuperAdminAtual() || !window._supabase) {
    showToast('Somente o superadministrador pode cadastrar ou editar vendedores.', 'error');
    return;
  }

  const nome = document.getElementById('adm-vendedor-nome').value.trim();
  const tipo = document.getElementById('adm-vendedor-tipo').value;
  const ixcIdRaw = document.getElementById('adm-vendedor-ixc-id').value.trim();
  const ixcVendedorId = ixcIdRaw || null;
  const participaRanking = document.getElementById('adm-vendedor-participa-ranking').checked;
  const arquivoFoto = document.getElementById('adm-vendedor-foto')?.files?.[0] || null;
  const isSuperAdmin = ehSuperAdminAtual();
  const vendedorExistente = editId ? buscarVendedorGerenciado(editId) : null;
  const filialId = vendedorExistente
    ? Number(vendedorExistente.filial_id)
    : isSuperAdmin
    ? Number(document.getElementById('adm-vendedor-filial').value)
    : Number(window.ADMIN_FILIAL_ID);
  const filial = (_cache.filiais || []).find(f => Number(f.id) === filialId);
  if (!nome || !['interno', 'externo'].includes(tipo) || !filial || (ixcVendedorId && !/^\d+$/.test(ixcVendedorId))) {
    showToast('Informe um nome, tipo e regional válidos.', 'warning');
    return;
  }

  if (!isSuperAdmin && filialId !== Number(window.ADMIN_FILIAL_ID)) {
    showToast('Este acesso só pode gerenciar vendedores da própria regional.', 'error');
    return;
  }
  if (editId && (!vendedorExistente || !vendedorExistente.ativo)) {
    showToast('O vendedor não está mais ativo para edição. Atualize a página.', 'warning');
    return;
  }

  botao.disabled = true;
  botao.textContent = editId ? 'Salvando…' : 'Cadastrando…';
  try {
    let erroFoto = null;
    let vendedorId = editId || null;
    let urlFotoSalva = null;

    if (!editId) {
      const { data: vendedor, error } = await window._supabase.from('vendedores').insert([{
        nome,
        tipo,
        ativo: true,
        filial_id: filialId,
        ixc_vendedor_id: ixcVendedorId,
        participa_ranking: participaRanking,
        slug: slugVendedor(nome, filial),
      }]).select('id').single();
      if (error) {
        if (error.code === '23505') throw new Error('Já existe um vendedor com esse nome ou identificador nesta regional.');
        if (error.code === '42501') throw new Error('O banco recusou o cadastro para esta regional. Confira o vínculo do administrador.');
        throw error;
      }
      vendedorId = vendedor.id;
      if (tipo === 'interno') {
        const periodoAtual = calcularPeriodoMes();
        try {
          await sincronizarMetaRenovacaoVendedor(vendedorId, filialId, periodoAtual.mesNum, periodoAtual.ano);
        } catch (erroMetasRenovacao) {
          console.warn('[cadastrarVendedor] não foi possível aplicar as metas de renovação compartilhadas:', erroMetasRenovacao);
          showToast('Vendedor cadastrado, mas as metas compartilhadas de renovação não foram sincronizadas. Salve novamente as metas da equipe.', 'warning', 9000);
        }
      }
    }

    if (arquivoFoto && vendedorId) {
      const caminhoFoto = `${filialId}/${vendedorId}/avatar`;
      const { error: erroUpload } = await window._supabase.storage
        .from(BUCKET_FOTOS_VENDEDORES)
        .upload(caminhoFoto, arquivoFoto, {
          cacheControl: '3600',
          contentType: arquivoFoto.type,
          upsert: true,
        });
      if (erroUpload) {
        erroFoto = erroUpload;
      } else {
        const { data: urlFoto } = window._supabase.storage
          .from(BUCKET_FOTOS_VENDEDORES)
          .getPublicUrl(caminhoFoto);
        urlFotoSalva = `${urlFoto.publicUrl}${urlFoto.publicUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
      }
    }

    if (editId) {
      if (erroFoto) throw new Error(`Não foi possível enviar a nova foto: ${erroFoto.message}`);
      const alteracoes = { nome, tipo, ixc_vendedor_id: ixcVendedorId, participa_ranking: participaRanking };
      if (urlFotoSalva) alteracoes.foto_url = urlFotoSalva;
      const { data, error } = await window._supabase.from('vendedores')
        .update(alteracoes)
        .eq('id', vendedorId)
        .eq('filial_id', filialId)
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') throw new Error('Já existe outro vendedor com esse nome nesta regional.');
        if (error.code === '42501') throw new Error('O banco recusou a edição. Aplique a permissão de gerenciamento de vendedores no Supabase.');
        throw error;
      }
      if (!data) throw new Error('O banco não autorizou a edição deste vendedor. Confira a regional da conta.');
    } else if (urlFotoSalva) {
      const { error } = await window._supabase.from('vendedores')
        .update({ foto_url: urlFotoSalva })
        .eq('id', vendedorId)
        .eq('filial_id', filialId);
      if (error) erroFoto = error;
    }

    form.reset();
    limparFotoVendedor();
    limparEstadoEdicaoVendedor();
    prepararCadastroVendedor();
    showToast(
      erroFoto
        ? `Vendedor salvo em ${filial.nome}, mas a foto não foi vinculada. Confira a configuração do Storage.`
      : editId ? `${nome} atualizado${participaRanking ? ' e mantido nos rankings' : ' e ocultado dos rankings (continua nos relatórios)'}.` : `Vendedor cadastrado em ${filial.nome}.`,
      erroFoto ? 'warning' : 'success'
    );
    try {
      const vendedoresTodasFiliais = await loadVendedoresTodasFiliais();
      popularSelectVendedoresTodasFiliais(vendedoresTodasFiliais);
      if (filialId === Number(window.FILIAL_ATUAL_ID)) {
        await carregarDados();
        await carregarVendedoresGerenciamento();
      }
      if (ehSuperAdminAtual()) await carregarVendedoresVisaoGlobal();
    } catch (reloadError) {
      console.error('[cadastrarVendedor] alteração salva, mas não foi possível atualizar as listas:', reloadError);
      showToast('Alteração salva. Atualize a página para atualizar as listas.', 'warning');
    }
  } catch (error) {
    console.error('[cadastrarVendedor]', error);
    showToast(error.message || 'Não foi possível cadastrar o vendedor.', 'error');
  } finally {
    botao.disabled = false;
    botao.textContent = document.getElementById('adm-vendedor-edit-id')?.value ? 'Salvar alterações' : 'Cadastrar vendedor';
  }
}

// O formulário de vendas recebidas de outra filial pode registrar vendedores
// de qualquer regional. Esta lista só é carregada quando o ADM abre, depois do
// login, e não altera a lista local usada em Nova Venda ou nos rankings.
async function loadVendedoresTodasFiliais() {
  // Contas regionais não carregam nem mantêm em memória cadastros de outras
  // equipes. Vendas recebidas ainda podem ser registradas sem identificar um
  // vendedor; o superadministrador continua podendo associar qualquer equipe.
  if (!ehSuperAdminAtual()) {
    _vendedoresTodasFiliais = [];
    return _vendedoresTodasFiliais;
  }
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
  _vendedoresTodasFiliais = data || [];
  return _vendedoresTodasFiliais;
}

let _limpezaVendedorConferida = null;

function limitesMesLimpezaVendedor(mes) {
  const [ano, numeroMes] = String(mes || '').split('-').map(Number);
  if (!ano || !numeroMes || numeroMes < 1 || numeroMes > 12) return null;
  const proximoMes = numeroMes === 12 ? `${ano + 1}-01` : `${ano}-${String(numeroMes + 1).padStart(2, '0')}`;
  return {
    inicio: new Date(`${mes}-01T00:00:00-04:00`).toISOString(),
    fim: new Date(`${proximoMes}-01T00:00:00-04:00`).toISOString(),
  };
}

async function carregarVendedoresParaLimpezaSuperadmin() {
  const card = document.getElementById('rel-limpeza-vendedor-card');
  const select = document.getElementById('rel-limpeza-vendedor');
  if (!card || !select || !ehSuperAdminAtual() || !window._supabase) return;
  card.hidden = false;
  select.replaceChildren(new Option('Selecione um vendedor', ''));
  const { data, error } = await window._supabase
    .from('vendedores')
    .select('id, nome, filial_id, ativo')
    .order('nome');
  if (error) {
    console.error('[carregarVendedoresParaLimpezaSuperadmin]', error);
    showToast('Não foi possível carregar os vendedores para a limpeza.', 'error');
    return;
  }
  const nomeFilial = id => (_cache.filiais || []).find(f => Number(f.id) === Number(id))?.nome || `Filial ${id}`;
  (data || []).forEach(v => {
    const inativo = v.ativo === false ? ' — inativo' : '';
    select.add(new Option(`${v.nome} — ${nomeFilial(v.filial_id)}${inativo}`, String(v.id)));
  });
  const mes = document.getElementById('rel-limpeza-vendedor-mes');
  if (mes && !mes.value) {
    const agora = new Date();
    mes.value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  }
}

function invalidarConferenciaExclusaoVendedor() {
  _limpezaVendedorConferida = null;
  const botao = document.getElementById('rel-limpeza-vendedor-excluir');
  const resumo = document.getElementById('rel-limpeza-vendedor-resumo');
  if (botao) botao.disabled = true;
  if (resumo) resumo.textContent = 'Confira novamente os registros para o vendedor e mês selecionados.';
}

async function conferirExclusaoVendedorMes() {
  if (!ehSuperAdminAtual()) { showToast('Somente o superadministrador pode excluir vendas por vendedor.', 'error'); return; }
  const selectVendedor = document.getElementById('rel-limpeza-vendedor');
  const vendedorId = selectVendedor?.value;
  const mes = document.getElementById('rel-limpeza-vendedor-mes')?.value;
  const resumo = document.getElementById('rel-limpeza-vendedor-resumo');
  const excluir = document.getElementById('rel-limpeza-vendedor-excluir');
  invalidarConferenciaExclusaoVendedor();
  if (!vendedorId || !mes) { showToast('Selecione o vendedor e o mês.', 'warning'); return; }
  const limites = limitesMesLimpezaVendedor(mes);
  if (!limites) { showToast('Selecione um mês válido.', 'warning'); return; }
  const nomeVendedor = selectVendedor.selectedOptions[0]?.textContent || 'vendedor';
  if (resumo) resumo.textContent = 'Conferindo vendas em todas as filiais…';
  try {
    const vendas = await carregarTodasPaginas(() => window._supabase
      .from('vendas')
      .select('id, filial_destino_id')
      .eq('vendedor_id', Number(vendedorId))
      .gte('data_venda', limites.inicio)
      .lt('data_venda', limites.fim)
      .order('id', { ascending: true }), 'vendas para limpeza do vendedor');
    const { count: avulsos, error } = await window._supabase
      .from('adicionais_avulsos')
      .select('id', { count: 'exact', head: true })
      .eq('vendedor_id', Number(vendedorId))
      .gte('data_venda', limites.inicio)
      .lt('data_venda', limites.fim);
    if (error) throw error;
    const destinos = new Map();
    vendas.forEach(v => destinos.set(v.filial_destino_id, (destinos.get(v.filial_destino_id) || 0) + 1));
    const resumoDestinos = [...destinos.entries()].map(([id, quantidade]) => {
      const nome = (_cache.filiais || []).find(f => Number(f.id) === Number(id))?.nome || `Filial ${id}`;
      return `${nome}: ${quantidade}`;
    }).join(' · ');
    _limpezaVendedorConferida = {
      vendedorId: Number(vendedorId), mes, nomeVendedor,
      vendas: vendas.length, adicionaisAvulsos: avulsos || 0,
    };
    if (resumo) resumo.textContent = `${nomeVendedor}: ${vendas.length} venda(s) em ${destinos.size} filial(is)${resumoDestinos ? ` (${resumoDestinos})` : ''} e ${avulsos || 0} adicional(is) avulso(s) em ${mes}. A exclusão também remove os adicionais vinculados e pendências de conferência relacionadas.`;
    if (excluir) excluir.disabled = vendas.length + (avulsos || 0) === 0;
    if (!vendas.length && !(avulsos || 0)) showToast('Não há registros desse vendedor no mês selecionado.', 'warning');
  } catch (err) {
    console.error('[conferirExclusaoVendedorMes]', err);
    if (resumo) resumo.textContent = 'Não foi possível consultar os registros. Verifique a conexão e as permissões do Supabase.';
    showToast(err.message || 'Não foi possível conferir as vendas.', 'error');
  }
}

async function excluirVendasVendedorMesConferido() {
  const conferencia = _limpezaVendedorConferida;
  if (!ehSuperAdminAtual()) { showToast('Somente o superadministrador pode excluir vendas por vendedor.', 'error'); return; }
  if (!conferencia) { showToast('Confira os registros novamente antes de excluir.', 'warning'); return; }
  const total = conferencia.vendas + conferencia.adicionaisAvulsos;
  if (!total) { showToast('Não há registros para excluir.', 'warning'); return; }
  const confirmado = window.confirm(`EXCLUSÃO PERMANENTE\n\nApagar ${conferencia.vendas} venda(s) de ${conferencia.nomeVendedor} em todas as filiais de destino e ${conferencia.adicionaisAvulsos} adicional(is) avulso(s) de ${conferencia.mes}? Os adicionais vinculados às vendas e as pendências de conferência também serão removidos. Esta ação não pode ser desfeita.`);
  if (!confirmado) return;
  const botao = document.getElementById('rel-limpeza-vendedor-excluir');
  if (botao) { botao.disabled = true; botao.textContent = 'Excluindo…'; }
  try {
    const { data, error } = await window._supabase.rpc('apagar_vendas_vendedor_mes', {
      p_vendedor_id: conferencia.vendedorId,
      p_mes: `${conferencia.mes}-01`,
    });
    if (error) throw error;
    const resultado = Array.isArray(data) ? data[0] : data;
    _limpezaVendedorConferida = null;
    const resumo = document.getElementById('rel-limpeza-vendedor-resumo');
    if (resumo) resumo.textContent = `Limpeza concluída para ${conferencia.nomeVendedor} em ${conferencia.mes}: ${resultado?.vendas_apagadas ?? conferencia.vendas} venda(s), ${resultado?.adicionais_avulsos_apagados ?? conferencia.adicionaisAvulsos} adicional(is) avulso(s), adicionais vinculados e pendências relacionadas removidas.`;
    showToast('Vendas do vendedor removidas em todas as filiais.', 'success');
    await carregarDados();
    if (typeof aplicarFiltrosRelatorio === 'function') await aplicarFiltrosRelatorio();
  } catch (err) {
    console.error('[excluirVendasVendedorMesConferido]', err);
    showToast(err.message || 'Não foi possível excluir as vendas. Confira se a função SQL foi instalada no Supabase.', 'error');
  } finally {
    if (botao) { botao.textContent = 'Excluir vendas deste vendedor no mês'; botao.disabled = !_limpezaVendedorConferida; }
  }
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
          option.dataset.filialId = v.filial_id == null ? '' : String(v.filial_id);
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

async function loadCategoriasPlanos() {
  const { data, error } = await window._supabase
    .from('categorias_planos')
    .select('id, nome, ativo')
    .order('nome');
  window._erroLoadCategoriasPlanos = error?.message || '';
  if (error) { console.error('[loadCategoriasPlanos]', error); return []; }
  return data || [];
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

// As metas gerais antigas de renovações/cancelamentos continuam lidas para
// compatibilidade; a produção mensal de renovações vem dos registros importados.
async function loadMetasRenovCancel(mes, ano) {
  const { data, error } = await window._supabase
    .from('metas_renovacao_cancelamento')
    .select('*')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle();
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

async function loadMetasRenovacaoFilial(mes, ano) {
  const { data, error } = await window._supabase.from('metas_renovacao_filial')
    .select('id,filial_id,mes,ano,meta_m3,meta_m2,meta_m1')
    .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', ano).maybeSingle();
  if (error) { console.warn('[loadMetasRenovacaoFilial] usando metas antigas até aplicar a migração:', error.message); return null; }
  return data || null;
}

async function sincronizarMetaRenovacaoVendedor(vendedorId, filialId, mes, ano) {
  const { data: metas, error: erroMetas } = await window._supabase.from('metas_renovacao_filial')
    .select('meta_m3,meta_m2,meta_m1')
    .eq('filial_id', filialId).eq('mes', mes).eq('ano', ano).maybeSingle();
  if (erroMetas) throw erroMetas;
  if (!metas) return;
  const { error } = await window._supabase.from('metas_renovacao_individual').upsert({
    filial_id: filialId,
    vendedor_id: vendedorId,
    mes,
    ano,
    meta_m3: metas.meta_m3,
    meta_m2: metas.meta_m2,
    meta_m1: metas.meta_m1,
    atualizado_em: new Date().toISOString(),
  }, { onConflict: 'vendedor_id,mes,ano' });
  if (error) throw error;
}

async function loadRenovacoesMensais(mes, ano) {
  const { data: sessao } = await window._supabase.auth.getSession();
  if (!sessao?.session) return null;
  const { data, error } = await window._supabase.from('renovacoes_mensais')
    .select('id,filial_id,vendedor_id,mes,ano,quantidade,arquivo_origem,importado_em')
    .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', ano);
  if (error) { console.warn('[loadRenovacoesMensais] aplique supabase/renovacoes-mensais.sql:', error.message); return null; }
  return data || [];
}

let _rankMensalErro = null;

async function loadRankMensalFilial(mes, ano) {
  if (!window.ADMIN_AUTENTICADO || !window._supabase) return [];
  const { data, error } = await window._supabase.rpc('calcular_rank_mensal_filial', {
    p_filial_id: Number(window.FILIAL_ATUAL_ID),
    p_mes: Number(mes),
    p_ano: Number(ano),
  });
  if (error) {
    _rankMensalErro = error.message || 'Erro desconhecido ao calcular o rank.';
    console.error('[loadRankMensalFilial]', _rankMensalErro);
    return [];
  }
  _rankMensalErro = null;
  return data || [];
}

async function atualizarAcaoFechamentoRank() {
  const area = document.getElementById('adm-rank-fechamento');
  const botao = document.getElementById('adm-rank-fechamento-btn');
  const info = document.getElementById('adm-rank-fechamento-info');
  if (!area || !botao || !info) return false;
  const hoje = new Date();
  const mesAnterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const inicioProjeto = new Date(2026, 9, 1);
  area.hidden = !window.ADMIN_AUTENTICADO || !window.FILIAL_ATUAL_ID || mesAnterior < inicioProjeto;
  if (area.hidden) return false;
  const mes = mesAnterior.getMonth() + 1;
  const ano = mesAnterior.getFullYear();
  const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(mesAnterior);
  botao.dataset.mes = String(mes);
  botao.dataset.ano = String(ano);
  botao.disabled = true;
  botao.textContent = `Verificando ${nomeMes}…`;
  botao.dataset.rankFechado = 'false';
  const { data: fechamento, error: erroFechamento } = await window._supabase
    .from('ranks_carreira_periodos_fechados')
    .select('filial_id')
    .eq('filial_id', Number(window.FILIAL_ATUAL_ID))
    .eq('mes', mes)
    .eq('ano', ano)
    .maybeSingle();
  if (erroFechamento) {
    botao.textContent = `Fechamento de ${nomeMes}`;
    info.textContent = 'Não foi possível consultar se este mês já foi consolidado. Atualize a página antes de tentar novamente.';
    return false;
  }
  botao.dataset.rankFechado = fechamento ? 'true' : 'false';

  if (fechamento) {
    const { data: periodosXp, error: erroXp } = await window._supabase
      .from('xp_comercial_periodos')
      .select('status')
      .eq('filial_id', Number(window.FILIAL_ATUAL_ID))
      .eq('mes', mes)
      .eq('ano', ano);
    if (erroXp) {
      botao.textContent = `Rank de ${nomeMes} consolidado`;
      info.textContent = 'O rank já está fechado, mas não foi possível verificar o fechamento do XP. Atualize a página para conferir.';
      return false;
    }
    const xpPendente = (periodosXp || []).some(periodo => periodo.status !== 'fechado');
    if (xpPendente) {
      botao.disabled = false;
      botao.textContent = `Concluir XP de ${nomeMes}`;
      info.textContent = `O rank de ${nomeMes} já está consolidado. Use esta ação apenas para concluir os períodos de XP que ficaram pendentes.`;
      return true;
    }
    botao.textContent = `${nomeMes} consolidado`;
    info.textContent = `O rank e o XP de ${nomeMes} já foram consolidados. Este fechamento não pode ser repetido.`;
    return true;
  }

  botao.disabled = false;
  botao.textContent = `Consolidar ${nomeMes}`;
  info.textContent = `Você pode consolidar ${nomeMes} quando quiser, depois de conferir as importações finais. Se ficar pendente, o sistema fará a consolidação automática a partir do dia 8 do mês seguinte.`;
  return true;
}

async function fecharRankMesAnteriorFilial() {
  const botao = document.getElementById('adm-rank-fechamento-btn');
  if (!botao || botao.disabled || !window.ADMIN_AUTENTICADO || !window.FILIAL_ATUAL_ID) return;
  const mes = Number(botao.dataset.mes);
  const ano = Number(botao.dataset.ano);
  const nomeMes = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
    .format(new Date(ano, mes - 1, 1));
  const rankFechado = botao.dataset.rankFechado === 'true';
  const confirmacao = rankFechado
    ? `O rank de ${nomeMes} já está fechado. Tentar concluir agora apenas os períodos de XP que ainda estiverem pendentes?`
    : `Consolidar agora o rank e o XP de ${nomeMes}? Confira se já importou os relatórios finais de vendas e renovações. A consolidação registra um retrato do mês; alterações posteriores não atualizam esse fechamento automaticamente. Se preferir, cancele e deixe a consolidação automática para depois do dia 7 do mês seguinte.`;
  if (!confirm(confirmacao)) return;
  botao.disabled = true;
  botao.textContent = 'Consolidando…';
  let rankConsolidado = false;
  try {
    const { data, error } = await window._supabase.rpc('consolidar_rank_mensal_filial', {
      p_filial_id: Number(window.FILIAL_ATUAL_ID),
      p_mes: mes,
      p_ano: ano,
    });
    if (error) throw error;
    rankConsolidado = true;
    const { data: xpData, error: xpError } = await window._supabase.rpc('consolidar_xp_comercial_filial', {
      p_filial_id: Number(window.FILIAL_ATUAL_ID),
      p_mes: mes,
      p_ano: ano,
    });
    if (xpError) throw xpError;
    showToast(rankFechado
      ? `Períodos de XP pendentes de ${nomeMes} concluídos.`
      : `Rank e XP de ${nomeMes} consolidados. ${Number(data || 0)} ranks e ${Number(xpData || 0)} períodos de XP.`, 'success');
    await carregarDados();
  } catch (error) {
    console.error('[fecharRankMesAnteriorFilial]', error);
    showToast(rankConsolidado
      ? `O rank foi consolidado, mas o XP não. Aplique a migração de XP e tente consolidar novamente: ${error.message || 'erro no fechamento de XP.'}`
      : (error.message || 'Não foi possível consolidar o mês.'), 'error');
  } finally {
    await atualizarAcaoFechamentoRank();
  }
}

async function carregarRelatorioResumoRenovacoes() {
  const wrap = document.getElementById('renov-relatorio-resumo-vendedores');
  const exportar = document.getElementById('renov-relatorio-exportar');
  const periodoInput = document.getElementById('renov-relatorio-mes');
  if (!wrap) return;
  if (periodoInput && !periodoInput.value) {
    const hoje = new Date();
    periodoInput.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  }
  if (periodoInput) window.atualizarSeletorMesADM?.(periodoInput);
  const periodo = periodoInput?.value || '';
  if (!periodo) return;
  const [ano, mes] = periodo.split('-').map(Number);
  wrap.innerHTML = '<p class="adm-muted-copy">Carregando relatório por vendedor…</p>';
  if (!window.ADMIN_AUTENTICADO || !window._supabase) { wrap.innerHTML = ''; if (exportar) exportar.hidden = true; return; }
  if (!window._vendedoresRenovacaoGlobal) {
    const { data: vendedoresGlobais } = await window._supabase.from('vendedores')
      .select('id,nome,tipo,filial_id,ixc_vendedor_id,ativo').eq('ativo', true).order('filial_id').order('nome');
    window._vendedoresRenovacaoGlobal = vendedoresGlobais || _cache.vendedores || [];
  }
  const { data, error } = await window._supabase.from('renovacoes_registros')
    .select('vendedor_id,contrato,cliente,plano,valor,data_renovacao')
    .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', ano);
  if (error) {
    wrap.innerHTML = `<p class="adm-muted-copy">Aplique a atualização de banco de dados para consultar o detalhamento: ${escapeHtmlText(error.message)}</p>`;
    if (exportar) exportar.hidden = true;
    return;
  }
  const vendedores = window._vendedoresRenovacaoGlobal || _cache.vendedores || [];
  const grupos = new Map();
  (data || []).forEach(registro => {
    const id = String(registro.vendedor_id);
    if (!grupos.has(id)) grupos.set(id, { vendedor_id: Number(id), vendedor: vendedores.find(v => String(v.id) === id)?.nome || 'Vendedor sem cadastro', quantidade: 0, valor: 0 });
    const g = grupos.get(id); g.quantidade++; g.valor += Number(registro.valor || 0);
  });
  const linhas = [...grupos.values()].sort((a, b) => b.quantidade - a.quantidade || a.vendedor.localeCompare(b.vendedor, 'pt-BR'));
  window._relatorioResumoRenovacoes = { periodo, linhas };
  if (exportar) exportar.hidden = linhas.length === 0;
  wrap.innerHTML = linhas.length
    ? `<table class="adm-table"><thead><tr><th>Vendedor</th><th>Renovações</th><th>Valor total</th></tr></thead><tbody>${linhas.map(l => `<tr><td>${escapeHtmlText(l.vendedor)}</td><td>${l.quantidade}</td><td>R$ ${l.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join('')}</tbody></table>`
    : '<p class="adm-muted-copy">Ainda não há registros detalhados importados para este mês.</p>';
  await carregarPendenciasRenovacao();
}

async function carregarPendenciasRenovacao() {
  const corpo = document.getElementById('renov-conferencia-body');
  const periodo = document.getElementById('renov-relatorio-mes')?.value || '';
  if (!corpo || !window.ADMIN_AUTENTICADO || !window._supabase) return;
  if (!_cache.planos?.length) _cache.planos = await loadPlanos();
  const [ano, mes] = /^\d{4}-\d{2}$/.test(periodo)
    ? periodo.split('-').map(Number)
    : [new Date().getFullYear(), new Date().getMonth() + 1];
  corpo.innerHTML = '<tr><td colspan="8">Carregando pendências…</td></tr>';
  const { data, error } = await window._supabase.from('renovacoes_registros')
    .select('id,vendedor_id,contrato,cliente,plano,plano_id,valor,data_renovacao,vendedores(nome)')
    .eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', ano)
    .eq('conferencia_pendente', true).order('data_renovacao', { ascending: false });
  if (error) {
    corpo.innerHTML = `<tr><td colspan="8">Não foi possível carregar a conferência. Aplique a versão atualizada de supabase/renovacoes-mensais.sql. ${escapeHtmlText(error.message)}</td></tr>`;
    return;
  }
  if (!data?.length) {
    corpo.innerHTML = '<tr><td colspan="8" class="adm-empty-state">Nenhuma renovação pendente de conferência neste mês.</td></tr>';
    return;
  }
  const escapar = valor => escapeHtmlText(String(valor ?? ''));
  corpo.innerHTML = data.map(item => `<tr data-renov-id="${Number(item.id)}">
    <td>${escapar(dataLocalStr(item.data_renovacao) || item.data_renovacao)}</td>
    <td>${escapar(item.contrato)}</td><td>${escapar(item.cliente)}</td>
    <td>${escapar(item.vendedores?.nome || window._vendedoresRenovacaoGlobal?.find(v => String(v.id) === String(item.vendedor_id))?.nome || '—')}</td>
    <td>${escapar(item.plano)}</td>
    <td><select data-renov-plano aria-label="Plano correspondente"><option value="">Selecione o plano</option>${(_cache.planos || []).map(p => `<option value="${Number(p.id)}" ${String(p.id) === String(item.plano_id || '') ? 'selected' : ''}>${escapar(p.nome)}${p.velocidade_mb ? ` · ${escapar(p.velocidade_mb)} Mbps` : ''}</option>`).join('')}</select></td>
    <td><input data-renov-valor type="number" min="0" step="0.01" value="${Number(item.valor || 0).toFixed(2)}" aria-label="Valor da renovação"></td>
    <td><button type="button" class="adm-btn adm-btn-primary adm-btn-small" data-renov-salvar>Salvar conferência</button></td>
  </tr>`).join('');
  corpo.querySelectorAll('[data-renov-salvar]').forEach(button => button.addEventListener('click', () => resolverConferenciaRenovacao(button)));
}

async function resolverConferenciaRenovacao(button) {
  const row = button?.closest('[data-renov-id]');
  if (!row || !window._supabase) return;
  const planoId = Number(row.querySelector('[data-renov-plano]')?.value);
  const valor = Number(row.querySelector('[data-renov-valor]')?.value);
  const plano = (_cache.planos || []).find(item => Number(item.id) === planoId);
  if (!plano) { showToast('Selecione o plano correspondente no catálogo.', 'warning'); return; }
  if (!Number.isFinite(valor) || valor < 0) { showToast('Informe um valor válido. R$ 0,00 também é permitido.', 'warning'); return; }
  button.disabled = true;
  try {
    const { error } = await window._supabase.rpc('resolver_conferencia_renovacao', {
      p_registro_id: Number(row.dataset.renovId), p_plano_id: planoId, p_plano: plano.nome, p_valor: valor,
    });
    if (error) throw error;
    showToast('Renovação conferida; a contagem foi mantida.', 'success');
    await carregarPendenciasRenovacao();
    await carregarRelatorioResumoRenovacoes();
  } catch (error) {
    console.error('[resolverConferenciaRenovacao]', error);
    showToast(error.code === 'PGRST202'
      ? 'A função de conferência ainda não está no Supabase. Execute a versão atualizada de supabase/renovacoes-mensais.sql.'
      : error.message || 'Não foi possível salvar a conferência.', 'error');
  } finally { button.disabled = false; }
}

function exportarResumoRenovacoes() {
  const relatorio = window._relatorioResumoRenovacoes;
  if (!relatorio?.linhas?.length) return;
  const csv = ['Vendedor;Quantidade de renovações;Valor total (R$)', ...relatorio.linhas.map(l => `${String(l.vendedor).replace(/;/g, ',')};${l.quantidade};${l.valor.toFixed(2).replace('.', ',')}`)].join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `Relatorio_Renovacoes_${relatorio.periodo}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadTotalRenovacoesPublico(mes, ano) {
  if (!window.FILIAL_ATUAL_ID) return null;
  const { data, error } = await window._supabase.rpc('total_renovacoes_mensais', {
    p_filial_id: window.FILIAL_ATUAL_ID, p_mes: mes, p_ano: ano,
  });
  if (error) { console.warn('[loadTotalRenovacoesPublico] aplique supabase/renovacoes-mensais.sql:', error.message); return null; }
  return data == null ? null : Number(data);
}

async function loadDestaquesRenovacoesPublico(mes, ano) {
  if (!window.FILIAL_ATUAL_ID) return null;
  const { data, error } = await window._supabase.rpc('destaques_renovacoes_mensais', {
    p_filial_id: Number(window.FILIAL_ATUAL_ID), p_mes: Number(mes), p_ano: Number(ano),
  });
  if (error) { console.warn('[loadDestaquesRenovacoesPublico] aplique supabase/destaques-renovacoes-publico.sql:', error.message); return null; }
  return data || [];
}

let _relatorioRenovacao = null;
function normalizarChaveRenovacao(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ');
}

function separarCsvRenovacao(texto) {
  const primeiraLinha = String(texto).replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0] || '';
  const delimitador = [';', ',', '\t'].sort((a, b) => primeiraLinha.split(b).length - primeiraLinha.split(a).length)[0];
  const matriz = [];
  let linha = [], celula = '', aspas = false;
  const input = String(texto).replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"' && aspas && input[i + 1] === '"') { celula += '"'; i++; }
    else if (ch === '"') aspas = !aspas;
    else if (ch === delimitador && !aspas) { linha.push(celula); celula = ''; }
    else if ((ch === '\n' || ch === '\r') && !aspas) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      linha.push(celula); matriz.push(linha); linha = []; celula = '';
    } else celula += ch;
  }
  if (celula.length || linha.length) { linha.push(celula); matriz.push(linha); }
  return matriz;
}

async function lerArquivoRelatorioRenovacao(file) {
  const extensao = file.name.split('.').pop().toLowerCase();
  let matriz;
  if (extensao === 'csv') matriz = separarCsvRenovacao(await file.text());
  else if (extensao === 'xlsx') {
    await carregarLibsAdmin();
    if (typeof ExcelJS === 'undefined') throw new Error('Não foi possível carregar a biblioteca para ler Excel. Salve o relatório como CSV e tente novamente.');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('A planilha não tem uma aba para leitura.');
    matriz = [];
    ws.eachRow({ includeEmpty: false }, row => matriz.push((row.values || []).slice(1).map(v => v && typeof v === 'object' && 'text' in v ? v.text : v)));
  } else throw new Error('Formato não suportado. Use CSV ou XLSX.');

  const headers = (matriz.shift() || []).map((h, i) => String(h ?? '').trim() || `Coluna ${i + 1}`);
  const rows = matriz.filter(row => row.some(value => String(value ?? '').trim() !== ''));
  if (headers.length < 2 || !rows.length) throw new Error('O arquivo não contém cabeçalho e linhas de dados suficientes.');
  return { headers, rows, filename: file.name };
}

function normalizarIdIxcRenovacao(valor) {
  return String(valor ?? '').trim().replace(/^=\s*"?/, '').replace(/"?$/, '').replace(/^"|"$/g, '').trim();
}

function normalizarContratoRenovacao(valor) {
  return normalizarIdIxcRenovacao(valor).replace(/\s+/g, '');
}

function valorMoedaRenovacao(valor) {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  let raw = String(valor ?? '').trim().replace(/R\$|\s/gi, '');
  if (!raw) return null;
  if (raw.includes(',')) raw = raw.replace(/\./g, '').replace(',', '.');
  const numero = Number(raw);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) / 100 : null;
}

function dataIsoRenovacao(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const raw = String(valor ?? '').trim();
  let m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

// O importador de renovações usa colunas identificadas automaticamente,
// prévia por linha e vínculo de vendedor pelo cadastro IXC (sem mapeamento manual).
function analisarCamposRelatorioRenovacao(dados) {
  const chaves = dados.headers.map(normalizarChaveRenovacao);
  const coluna = (aliases, regex) => {
    const exata = chaves.findIndex(h => aliases.includes(h));
    return exata >= 0 ? exata : chaves.findIndex(h => regex.test(h));
  };
  return {
    contrato: coluna(['id', 'contrato', 'numero contrato', 'numero do contrato', 'contrato renovado', 'id contrato'], /^(id|numero contrato|contrato|contrato renovado)$/),
    cliente: coluna(['cliente', 'nome cliente', 'assinante'], /cliente|assinante/),
    plano: coluna(['plano', 'descricao', 'descricao plano', 'plano renovado', 'novo plano'], /plano|descricao|produto/),
    vendedor: coluna(['vendedor', 'id vendedor', 'codigo vendedor', 'consultor'], /vendedor|consultor|responsavel/),
    valor: coluna(['valor', 'valor plano', 'mensalidade', 'preco', 'valor mensal'], /valor|mensalidade|preco/),
    data: coluna(['data renovacao', 'data da renovacao', 'data de renovacao', 'data evento', 'data do evento', 'data'], /data (?:(?:da|de) )?renova|data do evento|data evento/),
  };
}

async function analisarLinhasRelatorioRenovacao() {
  const dados = _relatorioRenovacao;
  const preview = document.getElementById('renov-relatorio-preview');
  const wrapper = document.getElementById('renov-relatorio-preview-wrap');
  const corpo = document.getElementById('renov-relatorio-preview-body');
  const botao = document.getElementById('renov-relatorio-importar');
  if (!dados || !preview || !wrapper || !corpo || !botao) return;
  botao.disabled = true;
  window._previewRenovacaoImport = null;

  const idx = analisarCamposRelatorioRenovacao(dados);
  const statusAtivoSnapshot = dados.headers.some(h => normalizarChaveRenovacao(h) === 'status contrato')
    && !dados.headers.some(h => /data (?:(?:da|de) )?renova/.test(normalizarChaveRenovacao(h)));
  if (statusAtivoSnapshot) {
    wrapper.hidden = true;
    preview.textContent = 'Este arquivo parece uma lista de contratos ativos, não um relatório de renovações. Envie o relatório de eventos de renovação para que cada linha tenha a data correta.';
    return;
  }
  const obrigatorias = ['contrato', 'cliente', 'plano', 'vendedor', 'data'];
  const faltantes = obrigatorias.filter(key => idx[key] < 0);
  if (faltantes.length) {
    wrapper.hidden = true;
    preview.textContent = 'Não reconheci todas as colunas necessárias no relatório de renovações. Preciso de contrato, cliente, plano, vendedor e data da renovação. Revise o formato exportado do IXC.';
    return;
  }

  const mes = document.getElementById('renov-relatorio-mes')?.value || '';
  const mesOk = /^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  const [anoRel, mesRel] = mes.split('-').map(Number);
  const filialId = Number(window.FILIAL_ATUAL_ID);
  let contratosJaImportados = new Set();
  if (mesOk && Number.isInteger(filialId) && filialId > 0) {
    let existentes;
    try {
      existentes = await carregarTodasPaginas(() => window._supabase.from('renovacoes_registros')
        .select('contrato')
        .eq('filial_id', filialId)
        .eq('mes', mesRel)
        .eq('ano', anoRel), 'renovações já importadas');
    } catch (error) {
      wrapper.hidden = true;
      preview.textContent = `Não foi possível conferir as renovações já importadas: ${error.message}`;
      return;
    }
    contratosJaImportados = new Set((existentes || []).map(item => normalizarContratoRenovacao(item.contrato)).filter(Boolean));
  }
  let vendedores = [];
  try {
    const { data, error } = await window._supabase.from('vendedores')
      .select('id,nome,tipo,filial_id,ixc_vendedor_id,ativo').eq('ativo', true)
      .order('filial_id').order('nome');
    if (error) throw error;
    vendedores = data || [];
  } catch (error) {
    console.warn('[analisarLinhasRelatorioRenovacao] usando vendedores da filial atual:', error.message);
    vendedores = _cache.vendedores || [];
  }
  window._vendedoresRenovacaoGlobal = vendedores;
  const idsIxc = new Map();
  vendedores.forEach(v => {
    const id = normalizarIdIxcRenovacao(v.ixc_vendedor_id);
    if (!id) return;
    const arr = idsIxc.get(id) || []; arr.push(v); idsIxc.set(id, arr);
  });
  const vendedoresPorNome = new Map();
  vendedores.forEach(v => {
    const chave = normalizarChaveRenovacao(v.nome);
    const encontrados = vendedoresPorNome.get(chave) || [];
    encontrados.push(v); vendedoresPorNome.set(chave, encontrados);
  });
  const vistos = new Set();
  const linhas = dados.rows.map((row, n) => {
    const vendedorCampo = normalizarIdIxcRenovacao(row[idx.vendedor]);
    const candidatos = idsIxc.get(vendedorCampo) || [];
    const porNome = vendedoresPorNome.get(normalizarChaveRenovacao(vendedorCampo)) || [];
    const vendedor = candidatos.length === 1 ? candidatos[0] : (candidatos.length === 0 && porNome.length === 1 ? porNome[0] : null);
    const contrato = normalizarContratoRenovacao(row[idx.contrato]);
    const cliente = String(row[idx.cliente] ?? '').trim();
    const descricaoPlano = String(row[idx.plano] ?? '').trim();
    const data = dataIsoRenovacao(row[idx.data]);
    const dataPartes = data.split('-').map(Number);
    const dataDoMes = dataPartes.length === 3 && dataPartes[0] === anoRel && dataPartes[1] === mesRel;
    const planoCatalogo = descricaoPlano && typeof resolverPlanoIxc === 'function'
      ? resolverPlanoIxc(descricaoPlano, _cache.planos || []) : null;
    const valorInformado = idx.valor >= 0 ? valorMoedaRenovacao(row[idx.valor]) : null;
    const valorEncontrado = valorInformado ?? (typeof obterValorExplicitoRelatorioIxc === 'function' ? obterValorExplicitoRelatorioIxc(descricaoPlano) : null)
      ?? (typeof obterValorPlanoIxc === 'function' ? obterValorPlanoIxc(planoCatalogo) : null);
    const planoVariavel = typeof tipoPlanoValorVariavelIxc === 'function' && Boolean(tipoPlanoValorVariavelIxc(descricaoPlano, planoCatalogo));
    const requerConferencia = !planoCatalogo || valorEncontrado == null || valorEncontrado === 0 || planoVariavel;
    const valor = valorEncontrado ?? 0;
    const erro = !contrato ? 'Contrato não identificado'
      : !cliente ? 'Cliente não identificado'
      : !descricaoPlano ? 'Plano não identificado'
      : !vendedor ? (candidatos.length > 1 || porNome.length > 1 ? 'Vendedor associado a mais de um cadastro' : `ID/nome de vendedor sem cadastro correspondente: ${vendedorCampo || 'vazio'}`)
      : !data ? 'Data da renovação inválida'
      : !dataDoMes ? 'Data fora do mês selecionado'
      : '';
    const chave = contrato;
    const jaImportada = Boolean(chave && contratosJaImportados.has(chave));
    const repetidaNoArquivo = Boolean(chave && vistos.has(chave));
    const duplicada = jaImportada || repetidaNoArquivo;
    if (chave) vistos.add(chave);
    const motivoDuplicada = jaImportada
      ? 'Esta renovação já foi importada para a filial e o mês; duplicado ignorado'
      : 'Contrato repetido no relatório; duplicado ignorado';
    return {
      linha: n + 2, vendedor_id: vendedor?.id || null, vendedor_nome: vendedor?.nome || '',
      contrato, cliente, plano: planoCatalogo?.nome || descricaoPlano, plano_id: planoCatalogo?.id || null, valor, data,
      conferencia_pendente: requerConferencia,
      duplicada, erro: duplicada ? motivoDuplicada : erro,
      podeImportar: !erro && !duplicada, incluir: !erro && !duplicada,
    };
  });
  window._linhasRelatorioRenovacao = linhas;
  renderizarPreviaRenovacao();
}

function renderizarPreviaRenovacao() {
  const dados = _relatorioRenovacao;
  const linhas = window._linhasRelatorioRenovacao || [];
  const preview = document.getElementById('renov-relatorio-preview');
  const wrapper = document.getElementById('renov-relatorio-preview-wrap');
  const corpo = document.getElementById('renov-relatorio-preview-body');
  const botao = document.getElementById('renov-relatorio-importar');
  if (!dados || !preview || !wrapper || !corpo || !botao) return;
  const validas = linhas.filter(l => l.podeImportar);
  const invalidas = linhas.filter(l => !l.podeImportar && !l.duplicada);
  const duplicadas = linhas.filter(l => l.duplicada);
  const selecionadas = validas.filter(l => l.incluir);
  const encaminhadas = validas.filter(l => l.incluir && l.conferencia_pendente).length;
  preview.textContent = `${selecionadas.length} renovação(ões) selecionada(s) para importar · ${encaminhadas} irão para conferência de plano/valor · ${duplicadas.length} duplicada(s) ignorada(s) · ${invalidas.length} linha(s) precisam de correção. Vendedores reconhecidos em todas as filiais pelo ID IXC ou nome único.`;
  corpo.innerHTML = linhas.map((l, i) => {
    const valor = l.valor == null ? '—' : `R$ ${Number(l.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const status = l.duplicada ? l.erro : l.erro || (l.conferencia_pendente ? 'Importar e revisar plano/valor' : 'Pronta para importar');
    const controle = l.podeImportar
      ? `<label><input type="checkbox" data-renov-linha="${i}" ${l.incluir ? 'checked' : ''}> ${escapeHtmlText(status)}</label>`
      : l.erro?.startsWith('ID/nome de vendedor sem cadastro') || l.erro === 'Vendedor associado a mais de um cadastro'
        ? `<select data-renov-vendedor="${i}" aria-label="Vincular vendedor"><option value="">Vincular vendedor cadastrado…</option>${(window._vendedoresRenovacaoGlobal || []).map(v => `<option value="${Number(v.id)}">${escapeHtmlText(v.nome)} · ${escapeHtmlText(v.ixc_vendedor_id || `Filial ${v.filial_id}`)}</option>`).join('')}</select><div>${escapeHtmlText(status)}</div>`
        : escapeHtmlText(status);
    return `<tr><td>${escapeHtmlText(l.contrato || '—')}</td><td>${escapeHtmlText(l.cliente || '—')}</td><td>${escapeHtmlText(l.plano || '—')}</td><td>${valor}</td><td>${escapeHtmlText(l.vendedor_nome || '—')}</td><td>${escapeHtmlText(dataLocalStr(l.data) || '—')}</td><td>${controle}</td></tr>`;
  }).join('');
  corpo.querySelectorAll('[data-renov-linha]').forEach(input => input.addEventListener('change', () => {
    linhas[Number(input.dataset.renovLinha)].incluir = input.checked;
    renderizarPreviaRenovacao();
  }));
  corpo.querySelectorAll('[data-renov-vendedor]').forEach(select => select.addEventListener('change', () => {
    const linha = linhas[Number(select.dataset.renovVendedor)];
    const vendedor = (window._vendedoresRenovacaoGlobal || []).find(item => String(item.id) === select.value);
    if (!linha || !vendedor) return;
    linha.vendedor_id = vendedor.id; linha.vendedor_nome = vendedor.nome;
    linha.erro = ''; linha.podeImportar = true; linha.incluir = true;
    renderizarPreviaRenovacao();
  }));
  wrapper.hidden = false;
  const mes = document.getElementById('renov-relatorio-mes')?.value || '';
  botao.disabled = !selecionadas.length || invalidas.length > 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes);
  window._previewRenovacaoImport = {
    registros: selecionadas.map(({ vendedor_id, contrato, cliente, plano, plano_id, valor, data, conferencia_pendente }) => ({ vendedor_id: Number(vendedor_id), contrato, cliente, plano, plano_id, valor, data, conferencia_pendente })),
    total: selecionadas.length, mes, invalidas: invalidas.length, duplicadas: duplicadas.length,
  };
}

async function prepararRelatorioRenovacao(file) {
  const preview = document.getElementById('renov-relatorio-preview');
  const wrapper = document.getElementById('renov-relatorio-preview-wrap');
  const btn = document.getElementById('renov-relatorio-importar');
  const limpar = document.getElementById('renov-relatorio-limpar');
  if (!file || !preview || !wrapper || !btn) return;
  if (limpar) limpar.disabled = false;
  window._previewRenovacaoImport = null;
  window._linhasRelatorioRenovacao = [];
  btn.disabled = true; wrapper.hidden = true; preview.textContent = 'Lendo e analisando o relatório…';
  try {
    _relatorioRenovacao = await lerArquivoRelatorioRenovacao(file);
    const mesEl = document.getElementById('renov-relatorio-mes');
    if (!mesEl.value) {
      const hoje = new Date();
      mesEl.value = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    }
    if (!_cache.planos?.length) _cache.planos = await loadPlanos();
    if (!_cache.vendedores?.length) _cache.vendedores = await loadVendedores();
    await analisarLinhasRelatorioRenovacao();
  } catch (err) {
    _relatorioRenovacao = null;
    preview.textContent = err.message || 'Não foi possível ler este relatório.';
  }
}

function limparRelatorioRenovacoes() {
  const arquivo = document.getElementById('renov-relatorio-arquivo');
  const preview = document.getElementById('renov-relatorio-preview');
  const wrapper = document.getElementById('renov-relatorio-preview-wrap');
  const corpo = document.getElementById('renov-relatorio-preview-body');
  const importar = document.getElementById('renov-relatorio-importar');
  const limpar = document.getElementById('renov-relatorio-limpar');
  if (arquivo) arquivo.value = '';
  if (preview) preview.textContent = 'Selecione o mês e o arquivo para analisar as renovações e conferir o vendedor, plano e valor reconhecidos.';
  if (wrapper) wrapper.hidden = true;
  if (corpo) corpo.replaceChildren();
  if (importar) importar.disabled = true;
  if (limpar) limpar.disabled = true;
  _relatorioRenovacao = null;
  window._linhasRelatorioRenovacao = [];
  window._previewRenovacaoImport = null;
}

async function importarRelatorioRenovacoes() {
  const resumo = window._previewRenovacaoImport;
  if (!resumo || !resumo.mes || resumo.invalidas || !resumo.registros.length) {
    showToast('Corrija as linhas pendentes e confira as renovações antes de importar.', 'warning'); return;
  }
  const [ano, mes] = resumo.mes.split('-').map(Number);
  const filialNome = window.FILIAL_ATUAL?.nome || 'filial atual';
  if (!confirm(`Importar ${resumo.total.toLocaleString('pt-BR')} renovações novas de ${mes}/${ano} para ${filialNome}? As que já existem serão ignoradas, e os registros anteriores serão preservados.`)) return;
  try {
    const { data: sessao } = await window._supabase.auth.getSession();
    if (!sessao?.session) throw new Error('Entre no painel administrativo para importar relatórios.');
    const { data, error } = await window._supabase.rpc('substituir_registros_renovacao', {
      p_filial_id: window.FILIAL_ATUAL_ID, p_mes: mes, p_ano: ano,
      p_arquivo: _relatorioRenovacao.filename, p_linhas: resumo.registros,
    });
    if (error) throw error;
    await carregarDados();
    await carregarRelatorioResumoRenovacoes();
    const importadas = Number(data || 0);
    const ignoradas = Number(resumo.duplicadas || 0) + Math.max(0, Number(resumo.total || 0) - importadas);
    showToast(`Importação concluída: ${importadas} renovação(ões) nova(s)${ignoradas ? `; ${ignoradas} já existente(s)/duplicada(s) ignorada(s)` : ''}. Os itens sem plano ou preço reconhecido foram enviados à conferência.`, 'success');
  } catch (err) {
    console.error('[importarRelatorioRenovacoes]', err);
    const msg = String((err && err.message) || err);
    const erroSchema = /schema cache|could not find the function public\.substituir_registros_renovacao|function public\.substituir_registros_renovacao.*does not exist/i.test(msg);
    showToast(erroSchema
      ? `O Supabase ainda não reconheceu a função de importação. Como o SQL já foi executado, atualize o schema da API com NOTIFY pgrst, 'reload schema'; e recarregue a página. Detalhe: ${msg}`
      : `Não foi possível importar: ${msg}`, 'error', 12000);
  }
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

// O PostgREST limita cada resposta (normalmente a 1.000 linhas). Percorre
// páginas ordenadas até terminar, sem deixar dashboard e relatórios
// contabilizarem silenciosamente apenas a primeira página.
const SUPABASE_PAGE_SIZE = 1000;
const SUPABASE_QUERY_MAX_ROWS = 100000;
async function carregarTodasPaginas(criarConsulta, descricao = 'consulta') {
  const registros = [];
  for (let offset = 0; offset < SUPABASE_QUERY_MAX_ROWS; offset += SUPABASE_PAGE_SIZE) {
    const { data, error } = await criarConsulta()
      .range(offset, offset + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const pagina = data || [];
    registros.push(...pagina);
    if (pagina.length < SUPABASE_PAGE_SIZE) return registros;
  }

  // Uma leitura de uma linha verifica se o limite foi atingido exatamente ou
  // se ainda existem dados. Nunca retorna um conjunto truncado como completo.
  const { data, error } = await criarConsulta()
    .range(SUPABASE_QUERY_MAX_ROWS, SUPABASE_QUERY_MAX_ROWS);
  if (error) throw error;
  if (data?.length) {
    throw new Error(`A consulta de dados (${descricao}) excedeu ${SUPABASE_QUERY_MAX_ROWS.toLocaleString('pt-BR')} registros. Reduza o período para carregar os dados com segurança.`);
  }
  return registros;
}

async function loadVendas(de, ate) {
  const viewVendas = window.ADMIN_AUTENTICADO ? 'vendas_admin' : 'vendas_ranking_publicas';
  const data = await carregarTodasPaginas(() => window._supabase
    .from(viewVendas)
    .select('*')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .gte('data_venda', de)
    .lt('data_venda', fimDoDiaExclusivo(ate))
    .order('data_venda', { ascending: false })
    .order('id', { ascending: false }), 'vendas da filial');
  return data.map(v => ({
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

// Retorna agregados de vendas interregionais originadas na filial atual,
// sem cliente, contrato ou observação.
async function loadVendasOrigem(de, ate) {
  const [ano, mes, dia] = String(de).slice(0, 10).split('-').map(Number);
  if (!ano || !mes || !dia || !window._supabase) return [];
  const inicio = new Date(ano, mes - 1, dia, 0, 0, 0, 0).toISOString();
  const fim = fimDoDiaExclusivo(ate);
  const data = await carregarTodasPaginas(() => window._supabase.rpc('ranking_vendas_por_origem', {
    p_filial_origem_id: window.FILIAL_ATUAL_ID,
    p_inicio: inicio,
    p_fim: fim,
  }).order('dia', { ascending: true }).order('vendedor_id', { ascending: true }).order('tipo', { ascending: true }), 'vendas feitas pela equipe em outras filiais');
  return data.map(item => ({
    vendedor_id: Number(item.vendedor_id),
    tipo: String(item.tipo || ''),
    dia: String(item.dia || '').slice(0, 10),
    vendas: Number(item.vendas || 0),
    valor: Number(item.valor || 0),
  }));
}

// Detalhes identificáveis da venda são consultados apenas pelo relatório
// administrativo. A view vendas_admin deve usar security_invoker e depender
// das políticas de administrador nas tabelas vendas e venda_adicionais.
async function loadVendasAdmin(de, ate) {
  const data = await carregarTodasPaginas(() => window._supabase
    .from('vendas_admin')
    .select('*')
    .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .gte('data_venda', de)
    .lt('data_venda', fimDoDiaExclusivo(ate))
    .order('data_venda', { ascending: false })
    .order('id', { ascending: false }), 'relatório de vendas');
  return data.map(v => ({
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

// Vendas feitas pelos vendedores da filial atual com destino em outra filial.
// A política regional de vendas permite que a filial de origem consulte esses
// registros, mantendo edição e exclusão sob responsabilidade do destino.
async function loadVendasEquipeEmOutrasFiliais(de, ate) {
  const data = await carregarTodasPaginas(() => window._supabase
    .from('vendas_admin')
    .select('*')
    .eq('filial_origem_id', window.FILIAL_ATUAL_ID)
    .neq('filial_destino_id', window.FILIAL_ATUAL_ID)
    .gte('data_venda', de)
    .lt('data_venda', fimDoDiaExclusivo(ate))
    .order('data_venda', { ascending: false })
    .order('id', { ascending: false }), 'vendas da equipe em outras filiais');
  return data.map(v => ({
    ...v,
    vendedores: { id: v.vendedor_id, nome: v.vendedor_nome, slug: v.vendedor_slug },
    planos: { id: v.plano_id, nome: v.plano_nome },
    valor: Number(v.valor_plano || 0),
    valor_plano: Number(v.valor_plano || 0),
    valor_adicionais: Number(v.valor_adicionais || 0),
    valor_total: Number(v.valor_total || 0),
  }));
}

async function loadVendasOutrasFiliais(de, ate) {
  const viewVendas = window.ADMIN_AUTENTICADO
    ? 'vendas_outras_filiais_admin'
    : 'vendas_outras_filiais_publicas';
  const data = await carregarTodasPaginas(() => {
    let query = window._supabase
      .from(viewVendas)
      .select('*')
      .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
      .order('data_venda', { ascending: false })
      .order('id', { ascending: false });
    if (de) query = query.gte('data_venda', de);
    if (ate) query = query.lt('data_venda', fimDoDiaExclusivo(ate));
    return query;
  }, 'vendas recebidas de outras filiais');
  return data;
}

async function loadVendaMaisRecente() {
  const viewVendas = window.ADMIN_AUTENTICADO ? 'vendas_admin' : 'vendas_ranking_publicas';
  const { data, error } = await window._supabase
    .from(viewVendas)
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
