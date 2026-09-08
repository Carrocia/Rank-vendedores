// ═══════════════════════════════════════════════════════════════
// SUPABASE-CLIENT.JS — única camada que fala com o Supabase
// Credenciais (SUPABASE_URL/SUPABASE_ANON_KEY — chave pública,
// protegida por RLS no banco, seguro expor no front), login/
// logout do ADM, e todos os load*()/save*() (leitura e escrita
// de vendas, metas, planos, filiais, adicionais).
// ═══════════════════════════════════════════════════════════════

// ================================================================
// ÁREA ADMINISTRATIVA — JavaScript
// Tudo prefixado com adm_ para não conflitar com o ranking público
// ================================================================

// ── Esqueletos para Supabase (implementar após configuração) ─────
// ================================================================
// CONFIGURAÇÃO SUPABASE
// Preencha SUPABASE_URL e SUPABASE_ANON_KEY antes de usar.
// Nunca use service_role key no frontend.
// ================================================================
const SUPABASE_URL = 'https://xmpurrxwfgzhnrqhrzyt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_HGi_8HXwyr4SEzoIKunMiA_cmWsFI8U';

function initSupabase() {
  if (!SUPABASE_URL || SUPABASE_URL === 'COLOCAR_URL_DO_PROJETO') {
    console.warn('[Supabase] URL não configurada.');
    return false;
  }
  const { createClient } = supabase;
  window._supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return true;
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
    .eq('ativo', true)
    .order('nome');
  if (error) { console.error('[loadVendedores]', error); return []; }
  return data;
}

async function loadPlanos() {
  const { data, error } = await window._supabase
    .from('planos')
    .select('*')
    .eq('ativo', true)
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

async function loadMetas(mes, ano) {
  const { data, error } = await window._supabase
    .from('metas')
    .select('*')
    .eq('mes', mes)
    .eq('ano', ano);
  if (error) { console.error('[loadMetas]', error); return []; }
  return data;
}

async function loadMetasFilial(mes, ano) {
  const { data, error } = await window._supabase
    .from('metas_filial')
    .select('*')
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

async function loadVendas(de, ate) {
  const { data, error } = await window._supabase
    .from('vendas_publicas')
    .select('*')
    .gte('data_venda', de)
    .lte('data_venda', ate)
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

async function loadVendasOutrasFiliais(de, ate) {
  let query = window._supabase
    .from('vendas_outras_filiais_publicas')
    .select('*')
    .order('data_venda', { ascending: false });
  if (de) query = query.gte('data_venda', de);
  if (ate) query = query.lte('data_venda', ate);
  const { data, error } = await query;
  if (error) { console.error('[loadVendasOutrasFiliais]', error); return []; }
  return data;
}

async function loadVendaMaisRecente() {
  const { data, error } = await window._supabase
    .from('vendas_publicas')
    .select('data_venda, vendedor_nome, vendedor_slug')
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


// ── Saves ────────────────────────────────────────────────────────
async function saveVenda(dados) {
  // dados: { vendedor_id, plano_id, data_venda, valor, observacao }
  // valor = preço praticado NO MOMENTO DA VENDA (não recalcular depois)
  const { data, error } = await window._supabase
    .from('vendas')
    .insert([{
      vendedor_id: dados.vendedor_id,
      plano_id: dados.plano_id,
      data_venda: dados.data_venda,
      valor: dados.valor,          // snapshot do preço no momento
      cliente: dados.cliente || null,
      observacao: dados.observacao || null,
      fora_filial: dados.fora_filial === true,
    }])
    .select()
    .single();
  if (error) { console.error('[saveVenda]', error); throw new Error('Não foi possível registrar a venda.'); }
  return data;
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

