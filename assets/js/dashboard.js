// ritmo do mes: compara a % da meta de cada vendedor com o % de
// dias do mes que ja passaram (CONFIG.mesRitmo)
function escapeHtmlText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function computeRitmo(pct) {
  const { diaAtual, diasNoMes } = calcularPeriodoMes();
  const esperado = (diaAtual / diasNoMes) * 100;
  if (pct >= esperado + 5) return { classe: 'verde',    label: 'Acima do ritmo',  icon: '🟢' };
  if (pct >= esperado - 5) return { classe: 'amarelo',  label: 'No ritmo',        icon: '🟡' };
  return { classe: 'vermelho', label: 'Abaixo do ritmo', icon: '🔴' };
}

// Calcula 2 coisas pra cada vendedor, sempre a partir das metas
// individuais reais (meta_m1/m2/m3 pra interno, meta_vendas pra
// externo — os mesmos campos de detectarConquistasIndividuais/
// renderConfigMetas):
//  - ringTier: nível visual do ANEL — "liga" a partir de 60% do
//    caminho até cada meta (dá o feedback antes de bater 100%).
//  - badgeTier: a ÚNICA meta REALMENTE batida (100%, a mais alta) —
//    nunca mostra mais de uma ao mesmo tempo, nunca inventa.
function calcularTiersIndividuais(vendedorId, tipo, metasIndividuais, vendasMesPorId) {
  const vazio = { ringTier: null, badgeTier: null };
  const linha = (metasIndividuais || []).find(m => m.vendedor_id === vendedorId);
  if (!linha) return vazio;
  const vendasMes = vendasMesPorId[vendedorId] || 0;

  if (tipo === 'interno') {
    const tiers = [
      { tier: 'm3', label: 'M3', meta: linha.meta_m3 },
      { tier: 'm2', label: 'M2', meta: linha.meta_m2 },
      { tier: 'm1', label: 'M1', meta: linha.meta_m1 },
    ].filter(t => t.meta); // só considera níveis com meta cadastrada
    if (!tiers.length) return vazio;

    let badgeTier = null, ringTier = null;
    tiers.forEach(t => {
      if (vendasMes >= t.meta) badgeTier = t;             // meta batida de verdade (100%)
      if (vendasMes >= t.meta * 0.6) ringTier = t.tier;    // anel liga a partir de 60%
    });

    return { ringTier, badgeTier };
  }

  // Externo: só uma meta (sem níveis) — o anel liga a partir de 60%
  // do caminho até ela; o selo só aparece quando bate de verdade.
  if (!linha.meta_vendas) return vazio;
  const bateu = vendasMes >= linha.meta_vendas;
  const proximo = vendasMes >= linha.meta_vendas * 0.6;
  return {
    ringTier: bateu ? 'meta' : (proximo ? 'meta' : null),
    badgeTier: bateu ? { tier: 'meta', label: 'Meta' } : null,
  };
}

// mode: 'semanal' mostra vendas + meta + %  |  'mensal' mostra so % + barra + ritmo
function renderPodium(containerId, entries, options = {}) {
  const mode = options.mode || 'semanal';
  const metasIndividuais = options.metasIndividuais;
  const vendasMesPorId = options.vendasMesPorId || {};
  // Critério de desempate: quando duas pessoas têm o MESMO número de
  // vendas, quem tem maior valor total de vendas fica na frente.
  const sorted = [...entries].sort((a, b) => (b.vendas - a.vendas) || ((b.valor || 0) - (a.valor || 0))).slice(0, 3);
  const container = document.getElementById(containerId);
  container.innerHTML = sorted.map((e, idx) => {
    const rank = idx + 1;
    const style = RANK_STYLE[rank] || RANK_STYLE[3];
    const pessoa = PESSOAS[e.slug] || PESSOAS[e.id] || {};
    const photo = e.foto_url || pessoa.foto || '';
    const nome = e.nome || pessoa.nome || e.id;
    const nomeSeguro = escapeHtmlText(nome);
    const avatarHTML = photo
      ? `<img class="podium-photo" src="${photo}" alt="${nomeSeguro}">`
      : `<div class="podium-photo podium-photo-fallback" aria-label="${nomeSeguro}">${escapeHtmlText(String(nome || '?').trim().charAt(0).toUpperCase())}</div>`;
    const pct = e.meta ? Math.min(100, Math.round((e.vendas / e.meta) * 100)) : 0;
    const crownHTML = style.crown
      ? '<span class="crown" aria-hidden="true">👑</span><span class="sparkle s1" aria-hidden="true">✨</span><span class="sparkle s2" aria-hidden="true">✨</span>'
      : '';

    const tiers = metasIndividuais ? calcularTiersIndividuais(e.id, e.tipo, metasIndividuais, vendasMesPorId) : { ringTier: null, badgeTier: null };
    const tierAttr = tiers.ringTier || '';
    // Só UM selo — a maior meta já batida (M3 sozinha conta, assim como M2 e M1).
    const badgesHTML = tiers.badgeTier
      ? `<div class="podium-tier-badges">
          <span class="podium-tier-badge tier-${tiers.badgeTier.tier}">${tiers.badgeTier.label}</span>
        </div>`
      : '';

    let subHTML;
    if (mode === 'semanal') {
      subHTML = `<span class="podium-value" data-target="${e.vendas}" style="margin-bottom:10px;">0 vendas</span>`;
    } else {
      const ritmo = computeRitmo(pct);
      subHTML = `
        <div class="podium-sub podium-sub-mensal">
          <span class="podium-sub-pct-big" data-target="${pct}">0% da meta</span>
          <div class="podium-mini-bar"><div class="podium-mini-bar-fill" data-width="${pct}"></div></div>
          <span class="ritmo-badge ritmo-${ritmo.classe}">${ritmo.icon} ${ritmo.label}</span>
        </div>`;
    }

    const shimmerDelay = rank === 1 ? '0s' : rank === 2 ? '0.4s' : '0.8s';
    const tooltipVendas = mode === 'semanal' ? formatVendas(e.vendas) : '';
    const tooltipMeta = e.meta ? `${Math.min(100,Math.round((e.vendas/e.meta)*100))}% da meta mensal` : '';
    const tooltipContent = mode === 'semanal'
      ? `<strong>${nomeSeguro}</strong>${tooltipVendas}`
      : `<strong>${nomeSeguro}</strong>${tooltipMeta}`;
    return `<div class="podium-stand" data-rank="${rank}" style="--rank-color:${style.color};--rank-color-dark:${style.dark};--rank-glow:${style.glow};--gold-c:#ffc94d;">
      <div class="podium-tooltip">${tooltipContent}</div>
      <div class="podium-photo-wrap" data-tier="${tierAttr}">
        ${crownHTML}
        ${avatarHTML}
        ${badgesHTML}
      </div>
      <span class="podium-name" style="margin-bottom:6px;">${nomeSeguro}</span>
      ${subHTML}
      <div class="podium-base" data-final-height="${style.height}" style="--shimmer-delay:${shimmerDelay}">
        <span class="rank-number">${rank}º</span>
      </div>
    </div>`;
  }).join('');

  const delayByRank = { 1: 260, 2: 0, 3: 520 }; // 2º sobe primeiro, depois 1º (com fanfarra), depois 3º
  container.querySelectorAll('.podium-stand').forEach(stand => {
    const rank = Number(stand.dataset.rank);
    const base = stand.querySelector('.podium-base');
    const valueEl = stand.querySelector('.podium-value');
    const pctBigEl = stand.querySelector('.podium-sub-pct-big');
    const barFillEl = stand.querySelector('.podium-mini-bar-fill');
    setTimeout(() => {
      base.style.height = base.dataset.finalHeight + 'px';
      if (valueEl) animateNumber(valueEl, Number(valueEl.dataset.target), { suffixFn: formatVendas });
      if (pctBigEl) animateNumber(pctBigEl, Number(pctBigEl.dataset.target), { suffixFn: v => v + '% da meta' });
      if (barFillEl) barFillEl.style.width = barFillEl.dataset.width + '%';
    }, reduceMotion ? 0 : delayByRank[rank] || 0);
  });
}

function renderListaClassificacao(containerId, entries, mode) {
  const lista = document.getElementById(containerId);
  if (!lista) return;
  const ordenados = [...(entries || [])].sort((a, b) =>
    (Number(b.vendas || 0) - Number(a.vendas || 0)) || (Number(b.valor || 0) - Number(a.valor || 0))
  );
  lista.replaceChildren();
  ordenados.forEach((vendedor, index) => {
    const item = document.createElement('li');
    item.className = 'ranking-full-row';
    const posicao = document.createElement('span');
    posicao.className = 'ranking-full-position';
    posicao.textContent = `${index + 1}º`;
    const nome = document.createElement('span');
    nome.className = 'ranking-full-name';
    nome.textContent = vendedor.nome || 'Vendedor';
    item.append(posicao, nome);
    if (mode === 'semanal') {
      const vendas = document.createElement('span');
      vendas.className = 'ranking-full-numbers';
      vendas.textContent = formatVendas(Number(vendedor.vendas || 0));
      item.appendChild(vendas);
    }
    lista.appendChild(item);
  });
}

function atualizarListaClassificacaoCompleta(periodo, grupos, modo) {
  const painel = document.getElementById(`ranking-lista-${periodo}`);
  const botao = document.querySelector(`[data-ranking-toggle="${periodo}"]`);
  if (!painel || !botao) return;
  const total = grupos.reduce((soma, grupo) => soma + (grupo || []).length, 0);
  botao.hidden = total <= 3;
  if (total <= 3) {
    painel.hidden = true;
    botao.setAttribute('aria-expanded', 'false');
    botao.textContent = '👥 Ver classificação completa';
  }
  grupos.forEach((grupo, index) => renderListaClassificacao(
    `ranking-lista-${periodo}-${index === 0 ? 'externos' : 'internos'}`,
    grupo,
    modo
  ));
}

function renderGoal(containerId, goal) {
  const pct = Math.min(100, Math.round((goal.atual / goal.meta) * 100));
  const el = document.getElementById(containerId);
  const liquid = el.querySelector('.goal-liquid');
  const ringPct = el.querySelector('.goal-ring-pct');
  const currentEl = el.querySelector('.goal-current');
  const targetEl = el.querySelector('.goal-target');

  targetEl.textContent = goal.meta;
  animateNumber(currentEl, goal.atual, { duration: 1300 });

  if (reduceMotion) {
    liquid.style.height = pct + '%';
    ringPct.textContent = pct + '%';
    return;
  }
  const start = performance.now();
  const duration = 1300;
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(pct * eased);
    liquid.style.height = val + '%';
    ringPct.textContent = val + '%';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function renderMuralPerson(person, role, formatador = formatVendas) {
  if (!person) {
    return `
      <div class="mural-winner mural-winner-pending">
        <div class="mural-photo-wrap">
          <div class="mural-photo-pending"><span class="mural-question">?</span></div>
        </div>
        <span class="mural-role">${role}</span>
        <span class="mural-name">A definir</span>
      </div>`;
  }
  const pessoa = PESSOAS[person.id] || {};
  const nome = person.nome || pessoa.nome || person.id || '';
  const nomeSeguro = escapeHtmlText(nome);
  const foto = person.foto_url || pessoa.foto || '';
  return `
    <div class="mural-winner">
      <div class="mural-photo-wrap">
        <span class="mural-crown" aria-hidden="true">👑</span>
        ${foto
          ? `<img class="mural-photo" src="${foto}" alt="${nomeSeguro}">`
          : `<div class="mural-photo mural-photo-fallback" aria-label="${nomeSeguro}">${escapeHtmlText(String(nome || '?').trim().charAt(0).toUpperCase())}</div>`}
      </div>
      <span class="mural-role">${role}</span>
      <span class="mural-name">${nomeSeguro}</span>
      <span class="mural-value">${formatador(person.vendas)}</span>
    </div>`;
}

// ── Destaque do mês fechado, calculado sozinho a partir das vendas ──
function calcularPeriodoMesAnterior(n = 1) {
  const hoje = new Date();
  const ini = new Date(hoje.getFullYear(), hoje.getMonth() - n, 1);
  const fim = new Date(ini.getFullYear(), ini.getMonth() + 1, 0);
  const fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const nome = ini.toLocaleDateString('pt-BR', { month: 'long' });
  return { de: fmt(ini), ate: fmt(fim), mesNome: nome.charAt(0).toUpperCase() + nome.slice(1) };
}

// Mesma regra de contagem do painel: externo "fora da filial" não conta.
function calcularDestaqueMes(periodo, vendas, vendedores, vendasOrigemInternos = []) {
  const vencedor = tipo => {
    const mapa = {};
    (vendedores || []).filter(v => v.tipo === tipo).forEach(v => {
      mapa[v.id] = { id: v.slug || v.id, nome: v.nome, foto_url: v.foto_url || null, vendas: 0, valor: 0 };
    });
    (vendas || []).forEach(v => {
      const e = mapa[v.vendedor_id];
      if (!e) return;
      if (tipo === 'externo' && (v.fora_filial === true || isVendaRecebidaDeOutraFilial(v))) return;
      e.vendas += 1;
      e.valor += Number(v.valor || 0);
    });
    if (tipo === 'interno') (vendasOrigemInternos || []).forEach(v => {
      const e = mapa[v.vendedor_id];
      if (!e) return;
      e.vendas += Number(v.vendas || 0);
      e.valor += Number(v.valor || 0);
    });
    const lista = Object.values(mapa).filter(e => e.vendas > 0)
      .sort((a, b) => (b.vendas - a.vendas) || (b.valor - a.valor));
    return lista.length ? { id: lista[0].id, nome: lista[0].nome, foto_url: lista[0].foto_url, vendas: lista[0].vendas } : null;
  };
  return { mes: periodo.mesNome, interno: vencedor('interno'), externo: vencedor('externo') };
}

// Mural = card "A definir" do mês atual (automático) + últimos meses
// fechados calculados sozinhos + meses antigos digitados à mão em
// HISTORICO_DESTAQUES. Se um mês existe nos dois, vale o digitado à mão.
function historicoCompleto() {
  const chave = h => String(h.mes).toLowerCase();
  const manuais = window.FILIAL_ATUAL_ID === 10
    ? HISTORICO_DESTAQUES.filter(h => h.interno || h.externo)
    : [];
  const autos = (_cache && _cache.destaquesAuto) || [];
  const lista = [];
  autos.forEach(a => {
    if (!(a.interno || a.externo)) return;
    lista.push(manuais.find(m => chave(m) === chave(a)) || a);
  });
  manuais.forEach(m => { if (!lista.some(x => chave(x) === chave(m))) lista.push(m); });

  // card do mês em andamento, sempre no topo, "A definir"
  const nomeAtual = (() => { const n = calcularPeriodoMes().mesNome; return n.charAt(0).toUpperCase() + n.slice(1); })();
  if (!lista.some(x => chave(x) === nomeAtual.toLowerCase())) {
    lista.unshift({ mes: nomeAtual, interno: null, externo: null });
  }
  return lista;
}

function renderHistorico() {
  const container = document.getElementById('muralGrid');
  const historico = historicoCompleto();
  if (!historico.length) {
    container.innerHTML = '<p class="mural-empty">Nenhum destaque registrado ainda.</p>';
    renderMuralRenovacoes();
    return;
  }
  container.innerHTML = historico.map(h => `
    <div class="mural-card">
      <span class="mural-month">${h.mes}</span>
      <div class="mural-pair">
        ${renderMuralPerson(h.interno, 'Interno')}
        ${renderMuralPerson(h.externo, 'Externo')}
      </div>
    </div>
  `).join('');
  renderMuralRenovacoes();
}

// ---------- Mural de Renovações (cadastro manual no ADM) ----------
const NOMES_MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const formatRenovacoes = n => `${n} ${Number(n) === 1 ? 'renovação' : 'renovações'}`;

async function loadDestaquesRenovacao() {
  // Se a tabela ainda não foi criada, não quebra o site: só fica vazio.
  const { data, error } = await window._supabase
    .from('destaques_renovacao')
    .select('*')
    .eq('filial_id', window.FILIAL_ATUAL_ID)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
    .limit(36);
  if (error) { console.warn('[loadDestaquesRenovacao] a tabela destaques_renovacao existe?', error.message); return []; }
  return data || [];
}

// Cor atual de uma variável de tema (gráficos/confete acompanham o tema sazonal)
function corTema(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}

// ---------- Tema do site (escolha do ADM, salva no Supabase) ----------
async function loadConfigSite() {
  // Se a tabela site_config ainda não existe, o site segue o tema automático por data.
  const { data, error } = await window._supabase.from('site_config').select('chave, valor');
  if (error) { console.warn('[loadConfigSite] a tabela site_config existe?', error.message); return {}; }
  const cfg = {};
  (data || []).forEach(r => { cfg[r.chave] = r.valor; });
  return cfg;
}

function aplicarConfigSite(cfg) {
  if (window.__uniTemaFixo) return; // ?tema= na URL tem prioridade
  const escolha = (cfg && cfg.tema_sazonal) || 'auto';
  const fx = !(cfg && cfg.tema_particulas === '0');
  let id = escolha === 'auto' ? window.uniTemaAutomatico(new Date()) : escolha;
  if (id !== 'padrao' && !window.UNI_TEMAS[id]) id = window.uniTemaAutomatico(new Date());
  window.uniAplicarTema(id, fx);
}

let _temaAdm = 'auto';
let _temaPreview = false; // true = há uma prévia não salva; carregarDados() não pode desfazê-la
function popularAdmTema() {
  const grid = document.getElementById('tema-grid');
  if (!grid) return;
  const cfg = _cache.configSite || {};
  _temaAdm = cfg.tema_sazonal || 'auto';
  const fxEl = document.getElementById('tema-fx');
  if (fxEl) fxEl.checked = cfg.tema_particulas !== '0';
  const hojeId = window.uniTemaAutomatico(new Date());
  const itens = [
    { id: 'auto', nome: 'Automático', sub: 'Pela data (hoje: ' + (window.UNI_TEMAS[hojeId] ? window.UNI_TEMAS[hojeId].nome : 'Padrão') + ')', icone: '🗓️', grad: 'linear-gradient(135deg,#21d9ff,#7c5cff)' },
    { id: 'padrao', nome: 'Padrão', sub: 'Visual limpo, sem decoração', icone: '🏢', grad: 'linear-gradient(135deg,#21d9ff,#7c5cff)' },
  ].concat(Object.keys(window.UNI_TEMAS).map(id => {
    const t = window.UNI_TEMAS[id];
    return { id, nome: t.nome, sub: t.periodo, icone: t.icone, grad: `linear-gradient(135deg,${t.d[0]},${t.d[1]})` };
  }));
  grid.innerHTML = itens.map(it => `
    <button type="button" class="tema-opt${it.id === _temaAdm ? ' selected' : ''}" data-tema="${it.id}" onclick="escolherTemaAdm('${it.id}')">
      <span class="tema-chip" style="background:${it.grad}">${it.icone}</span>
      <span><strong>${it.nome}</strong><small>${it.sub}</small></span>
    </button>`).join('');
}

function previaFxAdm() {
  _temaPreview = true;
  const fx = document.getElementById('tema-fx').checked;
  window.uniAplicarTema(_temaAdm === 'auto' ? window.uniTemaAutomatico(new Date()) : _temaAdm, fx);
}

function escolherTemaAdm(id) {
  _temaPreview = true;
  _temaAdm = id;
  document.querySelectorAll('#tema-grid .tema-opt').forEach(b => b.classList.toggle('selected', b.dataset.tema === id));
  const fx = document.getElementById('tema-fx').checked;
  window.uniAplicarTema(id === 'auto' ? window.uniTemaAutomatico(new Date()) : id, fx); // pré-visualização local
}

async function salvarTemaSite() {
  const fx = document.getElementById('tema-fx').checked;
  try {
    for (const [chave, valor] of [['tema_sazonal', _temaAdm], ['tema_particulas', fx ? '1' : '0']]) {
      const { data: ex, error: e1 } = await window._supabase.from('site_config').select('chave').eq('chave', chave).limit(1);
      if (e1) throw e1;
      const { error } = (ex && ex.length)
        ? await window._supabase.from('site_config').update({ valor }).eq('chave', chave)
        : await window._supabase.from('site_config').insert([{ chave, valor }]);
      if (error) throw error;
    }
    _cache.configSite = { tema_sazonal: _temaAdm, tema_particulas: fx ? '1' : '0' };
    _temaPreview = false;
    aplicarConfigSite(_cache.configSite);
    showToast('Tema salvo! O site já está com o novo visual para todos.', 'success');
  } catch (err) {
    console.error('[salvarTemaSite]', err);
    const msg = String((err && err.message) || err);
    if (err && (err.code === 'PGRST205' || /site_config/.test(msg)) && /schema cache|does not exist|permission denied/i.test(msg)) {
      showToast('A tabela site_config não está disponível no Supabase. Rode o SQL de criação (e o "notify pgrst") no SQL Editor e tente de novo.', 'error', 9000);
    } else {
      showToast('Não foi possível salvar o tema: ' + msg, 'error');
    }
  }
}

function renderMuralRenovacoes() {
  const container = document.getElementById('muralRenovGrid');
  if (!container) return;
  const regs = (_cache && _cache.destaquesRenovacao) || [];
  const hoje = new Date();
  const atual = { mes: hoje.getMonth() + 1, ano: hoje.getFullYear() };
  const d = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const anterior = { mes: d.getMonth() + 1, ano: d.getFullYear() };
  const cadastrado = m => regs.some(r => Number(r.mes) === m.mes && Number(r.ano) === m.ano);

  const cards = regs.map(r => ({ mes: Number(r.mes), ano: Number(r.ano), vendedor: r.vendedor, quantidade: Number(r.quantidade) || 0 }));
  if (!cadastrado(anterior)) cards.push({ ...anterior, pendente: true });
  if (!cadastrado(atual)) cards.push({ ...atual, pendente: true });
  cards.sort((a, b) => (b.ano * 12 + b.mes) - (a.ano * 12 + a.mes));

  container.innerHTML = cards.map(c => {
    const rotulo = NOMES_MESES[c.mes - 1] + (c.ano !== atual.ano ? '/' + c.ano : '');
    const pessoa = c.pendente ? null : { id: c.vendedor, vendas: c.quantidade };
    return `
      <div class="mural-card">
        <span class="mural-month">${rotulo}</span>
        <div class="mural-pair">
          ${renderMuralPerson(pessoa, 'Renovações', formatRenovacoes)}
        </div>
      </div>`;
  }).join('');
}

// ---------- ADM: cadastro do destaque de renovações ----------
function popularAdmRenovacoes() {
  const sel = document.getElementById('renov-vendedor');
  if (sel) {
    const atual = sel.value;
    sel.innerHTML = '<option value="">Selecione o vendedor</option>' +
      (_cache.vendedores || []).map(v => `<option value="${v.slug || v.id}">${v.nome}</option>`).join('');
    if (atual) sel.value = atual;
  }
  const mesEl = document.getElementById('renov-mes');
  if (mesEl && !mesEl.value) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1); // mês que acabou de fechar
    mesEl.value = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  const tbody = document.getElementById('renov-destaques-tbody');
  if (!tbody) return;
  const regs = _cache.destaquesRenovacao || [];
  if (!regs.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Nenhum destaque cadastrado ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = regs.map(r => {
    const v = (_cache.vendedores || []).find(x => (x.slug || x.id) === r.vendedor);
    return `<tr>
      <td>${NOMES_MESES[Number(r.mes) - 1]}/${r.ano}</td>
      <td><strong>${v ? v.nome : r.vendedor}</strong></td>
      <td>${r.quantidade}</td>
      <td><button type="button" class="adm-btn-excluir" onclick="excluirDestaqueRenovacao('${r.id}')" title="Excluir" aria-label="Excluir destaque"><svg class="adm-icon adm-icon--small" aria-hidden="true"><use href="#adm-icon-trash"></use></svg></button></td>
    </tr>`;
  }).join('');
}

async function salvarDestaqueRenovacao() {
  const mesVal = document.getElementById('renov-mes').value;      // "YYYY-MM"
  const vendedor = document.getElementById('renov-vendedor').value;
  const qtdRaw = document.getElementById('renov-qtd').value.trim();
  const quantidade = Number(qtdRaw);
  if (!mesVal || !vendedor || qtdRaw === '' || !Number.isInteger(quantidade) || quantidade < 0) {
    showToast('Escolha o mês, o vendedor e informe a quantidade de renovações (número inteiro).', 'warning');
    return;
  }
  const [ano, mes] = mesVal.split('-').map(Number);
  try {
    const { data: existente, error: errBusca } = await window._supabase
      .from('destaques_renovacao').select('id').eq('filial_id', window.FILIAL_ATUAL_ID).eq('mes', mes).eq('ano', ano).limit(1);
    if (errBusca) throw errBusca;
    let error;
    if (existente && existente.length) {
      ({ error } = await window._supabase.from('destaques_renovacao').update({ vendedor, quantidade }).eq('id', existente[0].id));
    } else {
      ({ error } = await window._supabase.from('destaques_renovacao').insert([{ filial_id: window.FILIAL_ATUAL_ID, mes, ano, vendedor, quantidade }]));
    }
    if (error) throw error;
    document.getElementById('renov-qtd').value = '';
    await carregarDados();
    showToast('Destaque de renovações salvo!', 'success');
  } catch (err) {
    console.error('[salvarDestaqueRenovacao]', err);
    showToast('Não foi possível salvar o destaque: ' + (err.message || err), 'error');
  }
}

async function excluirDestaqueRenovacao(id) {
  if (!confirm('Excluir este destaque de renovações?')) return;
  try {
    const { error } = await window._supabase.from('destaques_renovacao').delete().eq('id', id);
    if (error) throw error;
    await carregarDados();
    showToast('Destaque excluído.', 'success');
  } catch (err) {
    console.error('[excluirDestaqueRenovacao]', err);
    showToast('Não foi possível excluir: ' + (err.message || err), 'error');
  }
}

// ---------- Card "Meta da Semana" ----------
function animateCard(pct, atual, barFillEl, ringEl, barPctEl, duration = 1300) {
  const ringWrap = document.getElementById('metaRingWrap');
  if (reduceMotion) {
    ringEl.textContent = pct + '%';
    if (ringWrap) ringWrap.style.setProperty('--ring-pct', pct + '%');
    barFillEl.style.width = pct + '%';
    barPctEl.textContent = pct + '% concluído';
    return;
  }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    const val = Math.round(pct * eased);
    ringEl.textContent = val + '%';
    if (ringWrap) ringWrap.style.setProperty('--ring-pct', val + '%');
    barFillEl.style.width = val + '%';
    barPctEl.textContent = val + '% concluído';
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// renderWeekProgress SEMPRE recebe d real (processado a partir do
// Supabase). Se a meta semanal não estiver cadastrada em metas_filial,
// mostra "—" em vez de simular um número.
function renderWeekProgress(d) {
  const semana = d.semana;
  const metaSemanal = (d.metasFilial && d.metasFilial.semanal_m1) || null;
  const vendas = d.totalSemana;
  const diasCorridos = Math.max(1, diasCalendario(semana.inicio, new Date()));
  const pct = metaSemanal ? Math.min(100, Math.round((vendas / metaSemanal) * 100)) : 0;
  const faltam = metaSemanal ? Math.max(0, metaSemanal - vendas) : '—';
  const media = (vendas / diasCorridos).toFixed(1).replace('.', ',');

  document.getElementById('metaCardTitle').textContent = 'Meta da Semana';
  document.getElementById('metaColTitle').textContent = 'Progresso da semana';
  document.getElementById('metaSubLabel').textContent = 'vendas realizadas / meta da semana';
  document.getElementById('metaPctLabel').textContent = 'Seu desempenho semanal';
  document.getElementById('metaFaltamSuffix').textContent = 'vendas para a meta';
  document.getElementById('metaSideBlock3').style.display = '';
  document.getElementById('weekDataLabel').textContent = semana.label;
  document.getElementById('weekMeta').textContent = metaSemanal || '—';
  document.getElementById('weekFaltam').textContent = faltam;
  document.getElementById('weekMedia').textContent = media;
  document.getElementById('weekBarMetaCaption').textContent = metaSemanal ? ('Meta: ' + metaSemanal + ' vendas') : 'Meta não configurada';
  animateNumber(document.getElementById('weekAtual'), vendas, { duration: 1000 });
  animateCard(pct, vendas,
    document.getElementById('weekBarFill'),
    document.getElementById('weekRingPct'),
    document.getElementById('weekBarPct')
  );
}

// renderMensalProgress SEMPRE recebe d real. Se a meta mensal não
// estiver cadastrada em metas_filial, mostra "—" em vez de simular.
function renderMensalProgress(d) {
  const mes = d.mes;
  const metaMensal = (d.metasFilial && d.metasFilial.mensal_m1) || null;
  const vendas = d.totalMes;
  const faltam = metaMensal ? Math.max(0, metaMensal - vendas) : '—';
  const pct = metaMensal ? Math.min(100, Math.round((vendas / metaMensal) * 100)) : 0;
  const mesNome = mes.mesNome ? (mes.mesNome.charAt(0).toUpperCase() + mes.mesNome.slice(1)) : '—';

  document.getElementById('metaCardTitle').textContent = 'Meta do Mês de ' + mesNome;
  document.getElementById('metaColTitle').textContent = 'Progresso do mês';
  document.getElementById('metaSubLabel').textContent = 'vendas realizadas / meta do mês';
  document.getElementById('metaPctLabel').textContent = 'Desempenho mensal da filial';
  document.getElementById('metaFaltamSuffix').textContent = 'vendas para fechar o mês';
  document.getElementById('metaSideBlock3').style.display = 'none';
  document.getElementById('weekDataLabel').textContent = mesNome + ' de ' + mes.ano;
  document.getElementById('weekBarMetaCaption').textContent = metaMensal ? ('Meta: ' + metaMensal + ' vendas') : 'Meta não configurada';
  document.getElementById('weekMeta').textContent = metaMensal || '—';
  document.getElementById('weekFaltam').textContent = faltam;
  animateNumber(document.getElementById('weekAtual'), vendas, { duration: 1000 });
  animateCard(pct, vendas,
    document.getElementById('weekBarFill'),
    document.getElementById('weekRingPct'),
    document.getElementById('weekBarPct')
  );
}
// renderDestaquesSemana SEMPRE recebe d real (processado a partir do
// Supabase). Líder Externo/Interno, Maior Evolução e Maior % da Meta
// são derivados de d.*; Venda Mais Recente vem de d.vendaRecenteLabel,
// que por sua vez vem de loadVendaMaisRecente() — nada é hard-coded.
function renderDestaquesSemana(d) {
  const nomeDe = id => (PESSOAS[id] || {}).nome || id || '—';
  const fotoDe = id => (PESSOAS[id] || {}).foto || '';

  const liderExterno = d.liderExternoSem || {};
  const liderInterno = d.liderInternoSem || {};
  const maiorEvolucao = d.maiorEvolucao || {};
  const maiorPctMeta = d.maiorPct || {};
  const vendasDestaqueSemana = Number(maiorEvolucao.vendas) || 0;
  const pctMeta = maiorPctMeta.meta ? Math.round((maiorPctMeta.vendas / maiorPctMeta.meta) * 100) : null;

  const cards = [
    { icon: '👑', cor: 'gold',   label: 'Líder Externo', nome: liderExterno.nome || nomeDe(liderExterno.id), foto: fotoDe(liderExterno.id), valor: formatVendas(liderExterno.vendas || 0) },
    { icon: '👑', cor: 'gold',   label: 'Líder Interno', nome: liderInterno.nome || nomeDe(liderInterno.id), foto: fotoDe(liderInterno.id), valor: formatVendas(liderInterno.vendas || 0) },
    { icon: '⚡', cor: 'purple', label: 'Mais Vendas na Semana', nome: maiorEvolucao.nome || nomeDe(maiorEvolucao.id), foto: fotoDe(maiorEvolucao.id), valor: formatVendas(vendasDestaqueSemana) },
    { icon: '🎯', cor: 'red',    label: 'Maior % da Meta', nome: maiorPctMeta.nome || nomeDe(maiorPctMeta.id), foto: fotoDe(maiorPctMeta.id), valor: pctMeta !== null ? (pctMeta + '% da meta') : 'Sem meta cadastrada' },
    { icon: '⏱️', cor: 'blue',   label: 'Venda Mais Recente', nome: '', foto: '', valor: d.vendaRecenteLabel || '—' },
  ];

  document.getElementById('destaquesGrid').innerHTML = cards.map(c => `
    <div class="destaque-card">
      <div class="destaque-icon-badge ${c.cor}">${c.icon}</div>
      <span class="destaque-label">${c.label}</span>
      <div class="destaque-pessoa">
        ${c.foto ? `<img class="destaque-foto" src="${c.foto}" alt="${c.nome}">` : ''}
        ${c.nome ? `<span class="destaque-nome">${c.nome}</span>` : ''}
      </div>
      <span class="destaque-valor">${c.valor}</span>
    </div>
  `).join('');
}

// ---------- Metas da Filial (M1 / M2 / M3) ----------
function renderMetasFilial(periodo = 'semanal', d) {
  if (!d || !d.metasFilial) {
    document.getElementById('metasFilialTitle').textContent = periodo === 'semanal'
      ? '🎯 Metas da Filial — Semana' : '🎯 Metas da Filial';
    document.getElementById('metasFilialGrid').innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';
    return;
  }
  const mf = d.metasFilial;
  const atual = Number(periodo === 'semanal' ? d.totalSemana : d.totalMes) || 0;
  const prefixo = periodo === 'semanal' ? 'semanal' : 'mensal';
  const metas = [
    { label: 'M1', meta: Number(mf[prefixo + '_m1']) || 0 },
    { label: 'M2', meta: Number(mf[prefixo + '_m2']) || 0 },
    { label: 'M3', meta: Number(mf[prefixo + '_m3']) || 0 },
  ].filter(m => m.meta > 0).sort((a, b) => a.meta - b.meta);
  const titulo = periodo === 'semanal'
    ? '🎯 Metas da Filial — Semana'
    : '🎯 Metas da Filial — ' + (d.mes && d.mes.mesNome ? d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1) : CONFIG.mesReferencia);
  document.getElementById('metasFilialTitle').textContent = titulo;

  const proxima = metas.find(m => atual < m.meta);
  const finalizada = metas.length > 0 && !proxima;
  const alvo = proxima || metas[metas.length - 1];
  const pct = alvo ? Math.min(100, Math.round((atual / alvo.meta) * 100)) : 0;
  const pctGeral = metas.length ? Math.min(100, Math.round((atual / metas[metas.length - 1].meta) * 100)) : 0;
  const nomeEtapa = proxima?.label || metas[metas.length - 1]?.label;
  const textoStatus = !metas.length
    ? 'Cadastre as metas M1, M2 ou M3 para acompanhar o progresso.'
    : finalizada
      ? `Todas as metas concluídas · ${pctGeral}% da meta máxima.`
      : `${proxima.label} em andamento · faltam ${(alvo.meta - atual).toLocaleString('pt-BR')} vendas para concluir esta etapa.`;
  const etapas = metas.map((m, indice) => {
    const batida = atual >= m.meta;
    const emAndamento = !batida && m === proxima;
    const nivel = m.label === 'M3' ? 'Base' : (m.label === 'M2' ? 'Intermediária' : 'Avançada');
    return `<span class="milestone-chip${batida ? ' is-done' : (emAndamento ? ' is-current' : '')}">${batida ? '✓' : (emAndamento ? '●' : '○')} <b>${m.label}</b><small>${nivel}</small></span>`;
  }).join('');
  const grid = document.getElementById('metasFilialGrid');
  grid.innerHTML = `
    <article class="meta-filial-card milestone-card${finalizada ? ' is-complete' : ''}">
      <div class="milestone-main">
        <div class="milestone-current"><span class="milestone-eyebrow">${periodo === 'semanal' ? 'VENDAS NESTA SEMANA' : 'VENDAS NESTE MÊS'}</span><strong class="meta-filial-atual" id="metaFilialAtual" data-target="${atual}">0</strong><span class="milestone-unit">vendas realizadas</span></div>
        <div class="milestone-next"><span class="milestone-eyebrow">${finalizada ? 'META MÁXIMA' : 'PRÓXIMA META'}</span><strong>${nomeEtapa || 'Sem metas'}</strong><span>${alvo ? `${alvo.meta.toLocaleString('pt-BR')} vendas` : 'Configure uma meta'}</span></div>
      </div>
      <div class="milestone-track-wrap"><div class="meta-filial-bar-track milestone-track"><div class="meta-filial-bar-fill" id="metaFilialBar" style="width:0%"></div></div><span class="milestone-progress-label">${pct}%</span></div>
      <div class="milestone-message${finalizada ? ' is-complete' : ''}" id="metaFilialPct">${textoStatus}</div>
      <div class="milestone-steps" aria-label="Etapas da meta">${etapas || '<span class="milestone-empty">Nenhuma meta configurada</span>'}</div>
    </article>`;
  const atualEl = document.getElementById('metaFilialAtual');
  if (atualEl) animateNumber(atualEl, atual, { duration: 1100 });
  setTimeout(() => {
    const barEl = document.getElementById('metaFilialBar');
    if (barEl) barEl.style.width = pct + '%';
  }, 50);
}

// ---------- Renovações e Risco de Churn do Mês (sempre mensal) ----------
// Diferente das metas de vendas, aqui nada vem calculado a partir das
// vendas lançadas: tanto as metas M1/M2/M3 quanto o "atual" são
// digitados manualmente pelo admin (ver handleSalvarMetas) e só lidos
// aqui de _cache.metasRenovCancel.
function renderRenovacaoCancelamento(d) {
  const gridRenov = document.getElementById('renovacoesGrid');
  const gridCancel = document.getElementById('cancelamentosGrid');
  if (!gridRenov || !gridCancel) return;
  const rc = d && d.metasRenovCancel;
  if (!rc) {
    gridRenov.className = 'churn-grid';
    gridCancel.className = 'churn-grid is-churn';
    gridRenov.innerHTML = '<div class="sem-dados-msg">Sem dados configurados ainda.</div>';
    gridCancel.innerHTML = '<div class="sem-dados-msg">Sem dados configurados ainda.</div>';
    return;
  }

  // Renovações: quanto mais alto melhor, igual às metas de vendas —
  // M3 é a faixa mais fácil, M1 a mais difícil. Sem estado de alerta
  // aqui (não é uma métrica de risco).
  const renovAtual = rc.renovacoes_atual || 0;
  const renovMetas = [
    { label: 'M1', meta: rc.renovacoes_m1 },
    { label: 'M2', meta: rc.renovacoes_m2 },
    { label: 'M3', meta: rc.renovacoes_m3 },
  ];
  const fmt = valor => Number(valor || 0).toLocaleString('pt-BR');
  const renovMetasOrdenadas = renovMetas.filter(m => Number(m.meta) > 0).sort((a, b) => Number(a.meta) - Number(b.meta));
  const metaRenovMaisProxima = renovMetasOrdenadas.find(m => renovAtual < Number(m.meta));
  const temMetaRenovacao = renovMetas.some(m => Number(m.meta) > 0);
  const renovFinalizada = temMetaRenovacao && !metaRenovMaisProxima;
  const alvoRenovacao = metaRenovMaisProxima || renovMetasOrdenadas[renovMetasOrdenadas.length - 1];
  const renovPct = alvoRenovacao ? Math.min(100, Math.round((renovAtual / Number(alvoRenovacao.meta)) * 100)) : 0;
  const renovEtapas = renovMetasOrdenadas.map(m => {
    const batida = renovAtual >= Number(m.meta);
    const nivel = m.label === 'M3' ? 'Base' : (m.label === 'M2' ? 'Intermediária' : 'Avançada');
    return `<span class="milestone-chip${batida ? ' is-done' : (m === metaRenovMaisProxima ? ' is-current' : '')}">${batida ? '✓' : (m === metaRenovMaisProxima ? '●' : '○')} <b>${m.label}</b><small>${nivel}</small></span>`;
  }).join('');
  gridRenov.innerHTML = `<article class="churn-card churn-card-renov milestone-card${renovFinalizada ? ' is-complete' : ''}">
    <div class="milestone-main">
      <div class="milestone-current"><span class="milestone-eyebrow">RENOVAÇÕES NO MÊS</span><strong class="churn-card-atual">${fmt(renovAtual)}</strong><span class="milestone-unit">realizadas</span></div>
      <div class="milestone-next"><span class="milestone-eyebrow">${renovFinalizada ? 'META MÁXIMA' : 'PRÓXIMA META'}</span><strong>${alvoRenovacao?.label || 'Sem metas'}</strong><span>${alvoRenovacao ? `${fmt(alvoRenovacao.meta)} renovações` : 'Configure uma meta'}</span></div>
    </div>
    <div class="milestone-track-wrap"><div class="churn-bar-track milestone-track"><div class="churn-bar-fill" style="width:0%" data-width="${renovPct}"></div></div><span class="milestone-progress-label">${renovPct}%</span></div>
    <div class="milestone-message${renovFinalizada ? ' is-complete' : ''}">${!temMetaRenovacao ? 'Cadastre as metas M1, M2 ou M3 para acompanhar o progresso.' : renovFinalizada ? 'Todas as metas de renovação foram concluídas.' : `Faltam ${fmt(Number(alvoRenovacao.meta) - renovAtual)} renovações para concluir ${alvoRenovacao.label}.`}</div>
    <div class="milestone-steps" aria-label="Etapas das metas de renovação">${renovEtapas || '<span class="milestone-empty">Nenhuma meta configurada</span>'}</div>
  </article>`;
  setTimeout(() => { const fill = gridRenov.querySelector('.churn-bar-fill'); if (fill) fill.style.width = `${fill.dataset.width}%`; }, 50);
  // Risco de Churn (cancelamentos): é o contrário das outras metas —
  // são TETOS que não podem ser ultrapassados, por isso a ordem visual
  // é M1, M2, M3 (M1 é o teto mais apertado/rígido; M3 o mais
  // largo/tolerante). O percentual usado do limite decide o estado
  // visual do card: >=90% = crítico (vermelho + badge "Ação Imediata
  // Necessária"); 75–89% = alerta (âmbar + badge "Ação Pendente").
  const cancelAtual = rc.cancelamentos_atual || 0;
  const cancelMetas = [
    { label: 'M1', meta: rc.cancelamentos_m1 },
    { label: 'M2', meta: rc.cancelamentos_m2 },
    { label: 'M3', meta: rc.cancelamentos_m3 },
  ];
  const cancelMetasOrdenadas = cancelMetas.filter(m => Number(m.meta) > 0).sort((a, b) => Number(a.meta) - Number(b.meta));
  const limitesUltrapassados = cancelMetasOrdenadas.filter(m => cancelAtual > Number(m.meta));
  const limiteAtual = cancelMetasOrdenadas.find(m => cancelAtual <= Number(m.meta));
  const limiteMaximo = cancelMetasOrdenadas[cancelMetasOrdenadas.length - 1];
  const cancelPct = limiteAtual ? Math.min(100, Math.round((cancelAtual / Number(limiteAtual.meta)) * 100)) : (limiteMaximo ? 100 : 0);
  const cancelCritico = !!limiteAtual && cancelPct >= 90;
  const cancelAlerta = !!limiteAtual && !cancelCritico && cancelPct >= 75;
  const todosLimitesUltrapassados = !!limiteMaximo && !limiteAtual;
  const cancelStatus = cancelCritico ? ' is-critico' : (cancelAlerta ? ' is-alerta' : (todosLimitesUltrapassados ? ' is-ultrapassado' : ''));
  const limiteTexto = limiteAtual
    ? `${limiteAtual.label} em andamento · ${cancelPct}% do limite usado`
    : (limiteMaximo ? `Todos os limites ultrapassados · ${fmt(cancelAtual - Number(limiteMaximo.meta))} acima de ${limiteMaximo.label}` : 'Cadastre os limites M1, M2 ou M3.');
  const cancelEtapas = cancelMetasOrdenadas.map(m => {
    const passou = cancelAtual > Number(m.meta);
    const emAndamento = m === limiteAtual;
    const estado = passou ? 'is-exceeded' : (emAndamento ? (cancelCritico ? 'is-current is-critico' : (cancelAlerta ? 'is-current is-alerta' : 'is-current')) : '');
    const texto = passou ? 'ultrapassado' : (emAndamento ? 'em andamento' : 'próximo');
    return `<span class="milestone-chip ${estado}">${passou ? '!' : (emAndamento ? '●' : '○')} <b>${m.label}</b><small>${texto}</small></span>`;
  }).join('');
  const textoAcima = limiteAtual
    ? `${limitesUltrapassados.length ? `${limitesUltrapassados.map(m => `${m.label} ultrapassado`).join(' · ')} · ` : ''}Restam ${fmt(Number(limiteAtual.meta) - cancelAtual)} cancelamentos até o limite ${limiteAtual.label}.`
    : (limiteMaximo ? `O limite máximo ${limiteMaximo.label} foi ultrapassado em ${fmt(cancelAtual - Number(limiteMaximo.meta))} cancelamentos.` : 'Cadastre os limites para acompanhar o risco.');
  gridCancel.className = `churn-grid is-churn${cancelStatus}`;
  gridCancel.innerHTML = `<article class="churn-card churn-card-cancel milestone-card${cancelStatus}">
    <div class="milestone-main">
      <div class="milestone-current"><span class="milestone-eyebrow">CANCELAMENTOS NO MÊS</span><strong class="churn-card-atual">${fmt(cancelAtual)}</strong><span class="milestone-unit">registrados</span></div>
      <div class="milestone-next"><span class="milestone-eyebrow">LIMITE ACOMPANHADO</span><strong>${limiteAtual?.label || limiteMaximo?.label || 'Sem metas'}</strong><span>${limiteAtual ? `${fmt(limiteAtual.meta)} cancelamentos` : limiteMaximo ? `${fmt(limiteMaximo.meta)} de limite máximo` : 'Configure um limite'}</span></div>
    </div>
    <div class="milestone-track-wrap"><div class="churn-bar-track milestone-track"><div class="churn-bar-fill" style="width:0%" data-width="${cancelPct}"></div></div><span class="milestone-progress-label">${cancelPct}%</span></div>
    <div class="milestone-message${todosLimitesUltrapassados ? ' is-exceeded' : ''}">${limiteTexto}</div>
    <div class="milestone-submessage">${textoAcima}</div>
    <div class="milestone-steps" aria-label="Etapas dos limites de cancelamento">${cancelEtapas || '<span class="milestone-empty">Nenhum limite configurado</span>'}</div>
  </article>`;
  setTimeout(() => { const fill = gridCancel.querySelector('.churn-bar-fill'); if (fill) fill.style.width = `${fill.dataset.width}%`; }, 50);
}

// ---------- Evolução da Semana (barras) ----------
function renderEvolucaoChart(vendasPorDia) {
  const diasLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const diasData = vendasPorDia || diasLabels.map(dia => ({ dia, vendas: 0 }));
  const max = Math.max(1, ...diasData.map(d => d.vendas));
  const W = 100, H = 100;
  const padTop = 14, padBottom = 4;
  const plotH = H - padTop - padBottom;
  const stepX = W / (diasData.length - 1);
  const points = diasData.map((d, i) => ({
    xPct: i * stepX,
    yPct: padTop + plotH - (max ? (d.vendas / max) * plotH : 0),
    d
  }));
  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + p.xPct.toFixed(2) + ',' + p.yPct.toFixed(2)).join(' ');
  const areaPath = linePath + ` L${points[points.length - 1].xPct.toFixed(2)},${H} L${points[0].xPct.toFixed(2)},${H} Z`;
  const pointsHTML = points.map(p => `
    <div class="evo-point-value" style="left:${p.xPct}%; top:${p.yPct}%;">${p.d.vendas}</div>
    <div class="evo-point" style="left:${p.xPct}%; top:${p.yPct}%;"></div>
  `).join('');
  const labelsHTML = points.map(p => `
    <div class="evo-point-label" style="left:${p.xPct}%;">${p.d.dia}</div>
  `).join('');
  document.getElementById('evolucaoChart').innerHTML = `
    <div class="evo-plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="evoAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style="stop-color:var(--accent);stop-opacity:0.35"/>
            <stop offset="100%" style="stop-color:var(--accent);stop-opacity:0"/>
          </linearGradient>
        </defs>
        <path d="${areaPath}" fill="url(#evoAreaGrad)" stroke="none"></path>
        <path class="evo-line-path" d="${linePath}" fill="none" vector-effect="non-scaling-stroke" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
      ${pointsHTML}
    </div>
    ${labelsHTML}`;
}

// ---------- Vendas por Tipo de Plano (donut com dados reais) ----------
function renderDonutChart(vendasPorPlano) {
  const CORES = [corTema('--accent', '#21d9ff'), corTema('--accent2', '#7c5cff'), '#ffc94d','#ff5f6e','#34d399','#f97316','#a78bfa','#fb7185'];
  const planos = vendasPorPlano || [];
  const total = planos.reduce((s, p) => s + p.vendas, 0);
  const divisor = total || 1; // evita divisão por zero no cálculo de %, nunca é exibido
  let acc = 0;
  const stops = planos.length
    ? planos.map((p, i) => {
        const cor = p.cor || CORES[i % CORES.length];
        const pct = (p.vendas / divisor) * 100;
        const from = acc; acc += pct;
        return `${cor} ${from.toFixed(1)}% ${acc.toFixed(1)}%`;
      }).join(', ')
    : 'var(--surface-hover) 0% 100%';
  document.getElementById('donutChart').style.background = `conic-gradient(${stops})`;
  document.getElementById('donutTotal').textContent = total;
  document.getElementById('donutLegend').innerHTML = planos.map((p, i) => {
    const cor = p.cor || CORES[i % CORES.length];
    const pct = Math.round((p.vendas / divisor) * 100);
    return `
    <div class="donut-legend-item">
      <span class="donut-legend-dot" style="background:${cor}"></span>
      <span class="donut-legend-nome">${p.nome}</span>
      <span class="donut-legend-valor">${formatVendas(p.vendas)} · ${pct}%</span>
    </div>`;
  }).join('') || '<div style="font-size:0.78rem;color:var(--text-muted);">Sem dados.</div>';
}

// ---------- Conquistas do mês de todas as filiais ----------
let _conquistasTimer = null;
let _conquistasIndice = 0;
let _conquistasPausado = false;
let _conquistasEventosBound = false;

async function carregarConquistasGlobais() {
  if (!window._supabase) return { lista: [], erro: true };
  const { data, error } = await window._supabase.rpc('conquistas_mensais_globais');
  if (error) {
    console.warn('[carregarConquistasGlobais] aplique supabase/conquistas-mensais-globais.sql:', error.message);
    return { lista: [], erro: true };
  }
  return { lista: data || [], erro: false };
}

async function carregarDestaquesExternosGlobais() {
  if (!window._supabase) return { lista: [], erro: true };
  const { data, error } = await window._supabase.rpc('destaques_externos_globais');
  if (error) {
    console.warn('[carregarDestaquesExternosGlobais] aplique supabase/destaques-externos-globais.sql:', error.message);
    return { lista: [], erro: true };
  }
  return { lista: data || [], erro: false };
}

function renderDestaquesExternosGlobais() {
  const container = document.getElementById('destaquesGrid');
  if (!container) return;
  const estado = _cache.destaquesExternosGlobais || { lista: [], erro: false };
  // Se o RPC ainda não estiver aplicado no Supabase, mantém os destaques
  // locais sem inserir um aviso com aparência de card na grade.
  if (estado.erro) return;

  const destaques = estado.lista || [];
  const semana = destaques.find(item => item.periodo === 'semana');
  const mes = destaques.find(item => item.periodo === 'mes');
  const cards = [
    { periodo: 'semana', item: semana, titulo: 'Mais vendas externas na semana', complemento: 'nesta semana', icone: '⚡' },
    { periodo: 'mes', item: mes, titulo: 'Líder externo do mês', complemento: 'neste mês', icone: '🏆' },
  ];
  container.insertAdjacentHTML('beforeend', cards.map(card => {
    const item = card.item;
    const nome = item?.vendedor_nome || 'Nenhuma venda externa';
    const filial = item?.filial_nome || (item ? 'Filial não informada' : 'Ainda sem vendas neste período');
    const total = item ? `${formatVendas(item.vendas)} ${card.complemento}` : '0 vendas';
    return `<article class="destaque-card destaque-card-rede">
      <div class="destaque-icon-badge ${card.periodo === 'semana' ? 'purple' : 'gold'}" aria-hidden="true">${card.icone}</div>
      <span class="destaque-label">${escapeHtmlText(card.titulo)}</span>
      <div class="destaque-pessoa">
        <div class="destaque-nome">${escapeHtmlText(nome)}</div>
        <span class="destaque-filial-rede">${escapeHtmlText(filial)}</span>
      </div>
      <span class="destaque-valor">${escapeHtmlText(total)}</span>
    </article>`;
  }).join(''));
}

function atualizarCarrosselConquistas(direcao) {
  const trilho = document.querySelector('#conquistasGrid .conquistas-track');
  const pontos = [...document.querySelectorAll('#conquistasGrid [data-conquista-ponto]')];
  if (!trilho || !pontos.length) return;
  _conquistasIndice = (_conquistasIndice + direcao + pontos.length) % pontos.length;
  trilho.style.transform = `translateX(-${_conquistasIndice * 100}%)`;
  pontos.forEach((ponto, indice) => {
    ponto.classList.toggle('ativo', indice === _conquistasIndice);
    ponto.setAttribute('aria-current', indice === _conquistasIndice ? 'true' : 'false');
  });
}

function renderConquistas() {
  const container = document.getElementById('conquistasGrid');
  if (!container) return;
  if (_conquistasTimer) { clearInterval(_conquistasTimer); _conquistasTimer = null; }
  _conquistasIndice = 0;
  const mesEl = document.getElementById('conquistasMes');
  if (mesEl) mesEl.textContent = new Date().toLocaleDateString('pt-BR', { month: 'long' });

  const { lista = [], erro = false } = _cache.conquistasGlobais || {};
  if (!lista.length) {
    container.innerHTML = `<div class="conquistas-vazio">${erro
      ? 'Conquistas de todas as filiais indisponíveis. Aplique a atualização do Supabase para carregar este painel.'
      : 'Nenhuma meta individual foi atingida neste mês.'}</div>`;
    return;
  }

  const esc = escapeHtmlText;
  const medalha = conquista => conquista === 'M1' ? '🥇' : conquista === 'M2' ? '🥈' : conquista === 'M3' ? '🥉' : '🏆';
  container.innerHTML = `
    <div class="conquistas-carousel" role="region" aria-label="Conquistas deste mês de todas as filiais">
      <button type="button" class="conquista-nav" data-conquista-anterior aria-label="Conquista anterior">‹</button>
      <div class="conquistas-viewport" aria-live="polite">
        <div class="conquistas-track">${lista.map(c => `
          <article class="conquista-card">
            <div class="conquista-card-top"><span class="conquista-medalha">${medalha(c.conquista)}</span><span class="conquista-filial">${esc(c.filial_nome || 'Filial')}</span></div>
            <strong class="conquista-vendedor">${esc(c.vendedor_nome || 'Vendedor')}</strong>
            <span class="conquista-texto">atingiu a meta <b>${esc(c.conquista || 'do mês')}</b></span>
            <span class="conquista-quando">${esc(c.vendas)} de ${esc(c.meta)} vendas · neste mês</span>
          </article>`).join('')}
        </div>
      </div>
      <button type="button" class="conquista-nav" data-conquista-proxima aria-label="Próxima conquista">›</button>
    </div>
    <div class="conquistas-pontos" role="tablist" aria-label="Selecionar conquista">${lista.map((_, i) => `<button type="button" data-conquista-ponto="${i}" class="${i === 0 ? 'ativo' : ''}" aria-label="Conquista ${i + 1} de ${lista.length}" aria-current="${i === 0}"></button>`).join('')}</div>`;

  container.querySelector('[data-conquista-anterior]')?.addEventListener('click', () => atualizarCarrosselConquistas(-1));
  container.querySelector('[data-conquista-proxima]')?.addEventListener('click', () => atualizarCarrosselConquistas(1));
  container.querySelectorAll('[data-conquista-ponto]').forEach(ponto => ponto.addEventListener('click', () => {
    const destino = Number(ponto.dataset.conquistaPonto);
    atualizarCarrosselConquistas((destino - _conquistasIndice + lista.length) % lista.length);
  }));

  if (lista.length > 1 && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
    if (!_conquistasEventosBound) {
      container.addEventListener('mouseenter', () => { _conquistasPausado = true; });
      container.addEventListener('mouseleave', () => { _conquistasPausado = false; });
      container.addEventListener('focusin', () => { _conquistasPausado = true; });
      container.addEventListener('focusout', event => {
        if (!container.contains(event.relatedTarget)) _conquistasPausado = false;
      });
      _conquistasEventosBound = true;
    }
    _conquistasTimer = setInterval(() => {
      if (!_conquistasPausado && !document.hidden) atualizarCarrosselConquistas(1);
    }, 6500);
  }
}

// ================================================================
// TOAST — substitui alert() do navegador por uma notificação com a
// mesma identidade visual do resto do sistema. Só apresentação;
// nenhuma função de negócio muda de comportamento por causa disso.
// ================================================================
function showToast(message, type = 'success', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) { alert(message); return; } // fallback de segurança, nunca deve ser usado
  const icons = { success: '✅', error: '⛔', warning: '⚠️', celebration: '🏆' };
  const toast = document.createElement('div');
  toast.className = 'toast ' + type;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.success}</span>
    <span class="toast-msg"></span>
    <button type="button" class="toast-close" aria-label="Fechar">✕</button>
  `;
  toast.querySelector('.toast-msg').textContent = message; // texto via textContent, nunca HTML solto
  container.appendChild(toast);
  const remove = () => {
    toast.classList.add('toast-out');
    setTimeout(() => toast.remove(), 200);
  };
  toast.querySelector('.toast-close').addEventListener('click', remove);
  if (duration > 0) setTimeout(remove, duration);
}

// ================================================================
// DADOS EM MEMÓRIA (cache da sessão, populados por carregarDados)
// ================================================================
const _maisVendidosCache = new Map();
let _cache = {
  vendedores: [], planos: [], categoriasPlanos: [], adicionais: [], filiais: [],
  metasFilial: null, metas: [], metasRenovCancel: null,
  vendasSemana: [], vendasMes: [], vendasFiliais: [], vendasSemanaAnterior: [],
  vendasOrigemSemana: [], vendasOrigemSemanaAnterior: [], vendasOrigemMes: [],
  vendaMaisRecente: null,
  semana: null, mes: null,
  conquistasGlobais: { lista: [], erro: false },
  destaquesExternosGlobais: { lista: [], erro: false },
};
// Último resultado de processarDadosParaRender(), guardado por renderAll()
// para o card "Status do Caçador" reaproveitar (sem recalcular tudo de
// novo) quando o admin clica em "Gerar Status".
let _ultimoProcessado = null;
// true somente após um carregamento bem-sucedido de dados reais do Supabase
let _dadosCarregados = false;
let _dashSemanaOffset = 0;
let _dashSemanaSelecionada = null;
let _dashSemanaRequestId = 0;
let _dashSemanaFilialId = null;

// ================================================================
// FUNÇÃO CENTRAL: carregarDados()
// Chamada ao iniciar e após cada venda registrada
// ================================================================
function showErrorBanner(msg) {
  const banner = document.getElementById('dadosErrorBanner');
  const msgEl = document.getElementById('dadosErrorMsg');
  if (msgEl) msgEl.textContent = msg;
  if (banner) banner.classList.remove('hidden');
}

function hideErrorBanner() {
  const banner = document.getElementById('dadosErrorBanner');
  if (banner) banner.classList.add('hidden');
}

// Estado exibido quando não há dados reais disponíveis (Supabase não
// configurado ou erro de comunicação). NUNCA usa DATA/CONFIG como
// fonte de números atuais — apenas mostra "—" e um aviso claro.
function renderEstadoSemDados() {
  document.getElementById('celebrateBtn').style.display = 'none'; // nunca celebrar com dados que não existem
  renderHistorico();

  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('kpiSemana', '—');
  setText('kpiMensal', '—');
  setText('kpiLider', '—');

  // Card de meta (semanal/mensal) em estado vazio
  document.getElementById('metaCardTitle').textContent = 'Meta da Semana';
  setText('metaColTitle', 'Progresso da semana');
  setText('metaSubLabel', 'vendas realizadas / meta da semana');
  setText('weekDataLabel', '—');
  setText('weekAtual', '—');
  setText('weekMeta', '—');
  setText('weekFaltam', '—');
  setText('weekBarMetaCaption', 'Sem dados disponíveis');
  const ringEl = document.getElementById('weekRingPct');
  if (ringEl) ringEl.textContent = '—';
  const barFillEl = document.getElementById('weekBarFill');
  if (barFillEl) barFillEl.style.width = '0%';
  const barPctEl = document.getElementById('weekBarPct');
  if (barPctEl) barPctEl.textContent = '—';
  const ringWrap = document.getElementById('metaRingWrap');
  if (ringWrap) ringWrap.style.setProperty('--ring-pct', '0%');

  // Destaques da semana
  const destaquesGrid = document.getElementById('destaquesGrid');
  if (destaquesGrid) destaquesGrid.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';

  // Metas da filial
  const metasGrid = document.getElementById('metasFilialGrid');
  if (metasGrid) metasGrid.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';

  // Gráficos
  renderEvolucaoChart(null);
  renderDonutChart(null);
  renderConquistas();

  // Pódios
  ['podium-semanal-externo', 'podium-semanal-interno', 'podium-mensal-externo', 'podium-mensal-interno'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<div class="sem-dados-msg">Sem dados disponíveis no momento.</div>';
  });

  // Totalizador global
  atualizarTotalizadorComDados({ equipe: '—', filiais: '—', total: '—', pct: 0, metaGlobal: '—' });

  // Ranking ADM
  const rankingList = document.getElementById('adm-ranking-list');
  if (rankingList) rankingList.innerHTML = '<div class="adm-form-card" style="opacity:0.65;text-align:center;padding:40px;"><div>Sem dados disponíveis. Verifique a conexão com o Supabase.</div></div>';
}

async function carregarDados() {
  const configurado = initSupabase();
  hideErrorBanner();

  if (!configurado) {
    console.error('[carregarDados] Supabase não configurado — preencha SUPABASE_URL e SUPABASE_ANON_KEY.');
    showErrorBanner('O Supabase ainda não foi configurado. Preencha SUPABASE_URL e SUPABASE_ANON_KEY no código.');
    _dadosCarregados = false;
    renderEstadoSemDados();
    return;
  }

  try {
    _maisVendidosCache.clear();
    // Calcular períodos
    _cache.semana = calcularPeriodoSemana();
    _cache.mes = calcularPeriodoMes();
    const semanaAnterior = calcularPeriodoSemanaAnterior();
    // últimos 3 meses fechados — usados no mural de destaques (automático)
    const mesesFechados = [1, 2, 3].map(n => calcularPeriodoMesAnterior(n));
    // Primeiro resolve a filial do link; as demais consultas dependem dela.
    const filiais = await loadFiliais();
    configurarFilialAtual(filiais);
    if (_dashSemanaFilialId !== window.FILIAL_ATUAL_ID) {
      _dashSemanaOffset = 0;
      _dashSemanaSelecionada = null;
      _dashSemanaFilialId = window.FILIAL_ATUAL_ID;
    }
    _cache.filiais = filiais;
    // Restaura a sessão só depois de resolver a filial da URL para validar
    // o escopo do administrador antes de consultar os dados regionais.
    if (typeof checkAdminSession === 'function') await checkAdminSession();
    const vendedores = await loadVendedores();
    const vendedorIds = vendedores.map(v => v.id);
    const pFechados = Promise.all(mesesFechados.map(m => loadVendas(m.de, m.ate).catch(() => [])));
    const pFechadosOrigem = Promise.all(mesesFechados.map(m => loadVendasOrigem(m.de, m.ate).catch(() => [])));

    // Carregar os dados da filial selecionada em paralelo.
    const [planos, categoriasPlanos, adicionais, metasFilial, metas, metasRenovCancel,
           vendasSemana, vendasMes, vendasFiliais, vendaMaisRecente, vendasSemanaAnterior,
           vendasOrigemSemana, vendasOrigemSemanaAnterior, vendasOrigemMes, destaquesRenovacao, configSite,
           conquistasGlobais, destaquesExternosGlobais] = await Promise.all([
      loadPlanos(),
      loadCategoriasPlanos(),
      loadAdicionais(),
      loadMetasFilial(_cache.mes.mesNum, _cache.mes.ano),
      loadMetas(_cache.mes.mesNum, _cache.mes.ano, vendedorIds),
      loadMetasRenovCancel(_cache.mes.mesNum, _cache.mes.ano),
      loadVendas(_cache.semana.de, _cache.semana.ate),
      loadVendas(_cache.mes.de, _cache.mes.ate),
      loadVendasOutrasFiliais(_cache.mes.de, _cache.mes.ate),
      loadVendaMaisRecente(),
      loadVendas(semanaAnterior.de, semanaAnterior.ate),
      loadVendasOrigem(_cache.semana.de, _cache.semana.ate),
      loadVendasOrigem(semanaAnterior.de, semanaAnterior.ate),
      loadVendasOrigem(_cache.mes.de, _cache.mes.ate),
      loadDestaquesRenovacao(),
      loadConfigSite(),
      carregarConquistasGlobais().catch(err => {
        console.warn('[carregarConquistasGlobais]', err);
        return { lista: [], erro: true };
      }),
      carregarDestaquesExternosGlobais().catch(err => {
        console.warn('[carregarDestaquesExternosGlobais]', err);
        return { lista: [], erro: true };
      }),
    ]);

    _cache.vendedores = vendedores;
    _cache.planos = planos;
    _cache.categoriasPlanos = categoriasPlanos;
    _cache.adicionais = adicionais;
    _cache.metasFilial = metasFilial;
    _cache.metas = metas;
    _cache.metasRenovCancel = metasRenovCancel;
    _cache.vendasSemana = vendasSemana;
    _cache.vendasMes = vendasMes;
    _cache.vendasFiliais = vendasFiliais;
    _cache.vendaMaisRecente = vendaMaisRecente;
    _cache.vendasSemanaAnterior = vendasSemanaAnterior;
    _cache.vendasOrigemSemana = vendasOrigemSemana;
    _cache.vendasOrigemSemanaAnterior = vendasOrigemSemanaAnterior;
    _cache.vendasOrigemMes = vendasOrigemMes;
    _cache.conquistasGlobais = conquistasGlobais;
    _cache.destaquesExternosGlobais = destaquesExternosGlobais;
    const [vendasFechados, vendasFechadosOrigem] = await Promise.all([pFechados, pFechadosOrigem]);
    _cache.destaquesAuto = mesesFechados.map((m, i) => calcularDestaqueMes(
      m, vendasFechados[i], vendedores,
      vendasFechadosOrigem[i].filter(v => v.tipo === 'interno')
    ));
    _cache.destaquesRenovacao = destaquesRenovacao;
    popularAdmRenovacoes();
    _cache.configSite = configSite;
    if (!_temaPreview) { aplicarConfigSite(configSite); popularAdmTema(); }

    // Atualizar formulários ADM com dados reais
    popularSelectVendedores(vendedores);
    popularSelectFiliais(filiais);
    popularSelectPlanos(planos, categoriasPlanos);
    renderTabelaPlanos(planos, categoriasPlanos);
    renderTabelaCategoriasPlanos(categoriasPlanos, planos);
    popularAdicionaisFormulario(adicionais);

    renderAll(_cache);
    _dadosCarregados = true;
  } catch (err) {
    console.error('[carregarDados] Erro ao carregar dados do Supabase:', err);
    showErrorBanner('Não foi possível carregar os dados. Verifique a conexão com o Supabase.');
    _dadosCarregados = false;
    renderEstadoSemDados();
  }
}

// ── Popular selects do formulário ADM com dados do banco ─────────
function popularSelectVendedores(vendedores) {
  // Os formulários de vendas normais e de adicionais só oferecem a equipe
  // da filial atual. O formulário de vendas recebidas é preenchido à parte,
  // já dentro do ADM, com vendedores agrupados por regional. Celebrações e
  // Destaque do Mês também usam apenas a equipe da filial atual.
  const selects = [
    { id: 'venda-vendedor', tipo: 'id', placeholder: 'Selecione o vendedor' },
    { id: 'adic-vendedor', tipo: 'id', placeholder: 'Selecione o vendedor' },
    { id: 'cel-vendedor', tipo: 'slug', placeholder: 'Selecione o vendedor' },
    { id: 'dm-vendedor', tipo: 'slug', placeholder: 'Selecione o vendedor' },
  ];
  selects.forEach(({ id, tipo, placeholder }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.replaceChildren(new Option(placeholder, ''));
    (vendedores || []).forEach(v => {
      const option = new Option(
        `${v.nome} (${v.tipo === 'interno' ? 'Interno' : 'Externo'})`,
        tipo === 'slug' ? (v.slug || v.id) : v.id
      );
      if (v.slug) option.dataset.slug = v.slug;
      el.appendChild(option);
    });
    if (val) el.value = val;
  });
}

function contarPlanosVendidos(vendas = []) {
  const contagem = new Map();
  (vendas || []).forEach(venda => {
    const planoId = String(venda.plano_id ?? venda.planos?.id ?? '');
    const quantidade = venda.quantidade == null ? 1 : Number(venda.quantidade);
    if (planoId && Number.isFinite(quantidade) && quantidade > 0) {
      contagem.set(planoId, (contagem.get(planoId) || 0) + quantidade);
    }
  });
  return contagem;
}

function montarGruposSelectPlanos(planos, categorias, contagem, filialNome = '') {
  const categoriasPorId = new Map((categorias || []).map(c => [String(c.id), c.nome]));
  const ativos = (planos || []).filter(p => p.ativo !== false);
  const gruposNormais = {};
  ativos.forEach(plano => {
    const grupo = categoriasPorId.get(String(plano.categoria_id)) || 'Sem categoria';
    if (!gruposNormais[grupo]) gruposNormais[grupo] = [];
    gruposNormais[grupo].push(plano);
  });

  const ordenarVelocidade = lista => lista.sort((a, b) => {
    const velocidadeA = Number(a.velocidade_mb) || Number(String(a.nome).match(/(\d+)\s*mb/i)?.[1]) || Infinity;
    const velocidadeB = Number(b.velocidade_mb) || Number(String(b.nome).match(/(\d+)\s*mb/i)?.[1]) || Infinity;
    return velocidadeA - velocidadeB || String(a.nome).localeCompare(String(b.nome), 'pt-BR');
  });
  Object.values(gruposNormais).forEach(ordenarVelocidade);

  const maisVendidos = ativos
    .filter(plano => (contagem.get(String(plano.id)) || 0) > 0)
    .sort((a, b) => (contagem.get(String(b.id)) || 0) - (contagem.get(String(a.id)) || 0)
      || String(a.nome).localeCompare(String(b.nome), 'pt-BR')
      || Number(a.velocidade_mb) - Number(b.velocidade_mb))
    .slice(0, 5)
    .map(plano => ({ ...plano, vendasNoMes: contagem.get(String(plano.id)) || 0 }));

  const grupos = {};
  if (maisVendidos.length) {
    const nomeFilial = String(filialNome || '').trim();
    grupos[nomeFilial ? `Mais vendidos — ${nomeFilial}` : 'Mais vendidos'] = maisVendidos;
  }
  Object.entries(gruposNormais).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .forEach(([nome, lista]) => { grupos[nome] = lista; });
  return grupos;
}

function renderSelectPlanos(selectId, grupos) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">Selecione o plano</option>' +
    Object.entries(grupos).map(([grupo, planos]) =>
      `<optgroup label="${escapeHtmlText(grupo)}">${planos.map(plano =>
        `<option value="${escapeHtmlText(plano.id)}|${escapeHtmlText(plano.valor)}">${escapeHtmlText(plano.nome)} ${escapeHtmlText(plano.velocidade_mb)} Mbps${plano.vendasNoMes ? ` — ${plano.vendasNoMes} venda${plano.vendasNoMes === 1 ? '' : 's'} no mês` : ''} — R$ ${Number(plano.valor).toFixed(2).replace('.', ',')}</option>`
      ).join('')}</optgroup>`
    ).join('');
  buildCustomSelectPanel(selectId, grupos);
}

function popularSelectPlanos(planos, categorias = _cache.categoriasPlanos || []) {
  const filialIdAtual = Number(window.FILIAL_ATUAL_ID);
  const vendasDaFilial = [...(_cache.vendasMes || []), ...(_cache.vendasFiliais || [])];
  const contagemAtual = contarPlanosVendidos(vendasDaFilial);
  const filialAtualNome = (_cache.filiais || []).find(f => Number(f.id) === filialIdAtual)?.nome || '';
  const gruposAtuais = montarGruposSelectPlanos(planos, categorias, contagemAtual, filialAtualNome);

  // Nova Venda segue a filial de destino escolhida (quando houver).
  const destinoSelecionado = Number(document.getElementById('venda-destino')?.value || filialIdAtual);
  const filialDestinoNome = (_cache.filiais || []).find(f => Number(f.id) === destinoSelecionado)?.nome || filialAtualNome;
  const gruposNovaVenda = destinoSelecionado === filialIdAtual
    ? gruposAtuais
    : montarGruposSelectPlanos(planos, categorias, _maisVendidosCache.get(String(destinoSelecionado)) || new Map(), filialDestinoNome);

  renderSelectPlanos('venda-plano', gruposNovaVenda);
  // A venda recebida de outra filial sempre é contabilizada para a filial aberta.
  renderSelectPlanos('filial-plano', gruposAtuais);
}

async function atualizarMaisVendidosDaFilial(filialId) {
  const id = Number(filialId || window.FILIAL_ATUAL_ID);
  const seletor = document.getElementById('venda-plano');
  if (!seletor) return;
  const filialAtualId = Number(window.FILIAL_ATUAL_ID);
  const planos = _cache.planos || [];
  const categorias = _cache.categoriasPlanos || [];
  const nomeFilial = (_cache.filiais || []).find(f => Number(f.id) === id)?.nome || '';

  if (id === filialAtualId) {
    const contagem = contarPlanosVendidos([...(_cache.vendasMes || []), ...(_cache.vendasFiliais || [])]);
    renderSelectPlanos('venda-plano', montarGruposSelectPlanos(planos, categorias, contagem, nomeFilial));
    return;
  }

  let contagem = _maisVendidosCache.get(String(id));
  if (!contagem) {
    if (!window.ADMIN_AUTENTICADO || !window._supabase || !_cache.mes) return;
    const de = _cache.mes.de;
    const ateExclusivo = fimDoDiaExclusivo(_cache.mes.ate);
    const [respostaVendas, respostaRecebidas] = await Promise.all([
      window._supabase.from('vendas_admin').select('plano_id')
        .eq('filial_destino_id', id).gte('data_venda', de).lt('data_venda', ateExclusivo),
      window._supabase.from('vendas_outras_filiais_admin').select('plano_id, quantidade')
        .eq('filial_destino_id', id).gte('data_venda', de).lt('data_venda', ateExclusivo),
    ]);
    if (respostaVendas.error || respostaRecebidas.error) {
      console.warn('[atualizarMaisVendidosDaFilial] Não foi possível obter o ranking da filial escolhida.', respostaVendas.error || respostaRecebidas.error);
      contagem = new Map();
    } else {
      contagem = contarPlanosVendidos([...(respostaVendas.data || []), ...(respostaRecebidas.data || [])]);
    }
    _maisVendidosCache.set(String(id), contagem);
  }

  // Evita uma consulta lenta trocar a lista depois que o usuário já escolheu outra filial.
  if (Number(document.getElementById('venda-destino')?.value || filialAtualId) !== id) return;
  renderSelectPlanos('venda-plano', montarGruposSelectPlanos(planos, categorias, contagem, nomeFilial));
}

function renderTabelaPlanos(planos, categorias = _cache.categoriasPlanos || []) {
  const tbody = document.getElementById('planos-tbody');
  if (!tbody) return;

  const lista = Array.isArray(planos) ? planos : [];
  if (!lista.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Nenhum plano encontrado no Supabase.</td></tr>';
    return;
  }

  const categoriasPorId = new Map((categorias || []).map(c => [String(c.id), c.nome]));
  const moeda = valor => {
    const numero = Number(valor);
    return Number.isFinite(numero)
      ? numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : '—';
  };

  tbody.replaceChildren();
  lista.forEach(plano => {
    const tr = document.createElement('tr');
    const ativo = plano.ativo !== false;
    const valores = [
      plano.nome || '—',
      plano.velocidade_mb != null ? `${plano.velocidade_mb} Mbps` : '—',
      moeda(plano.valor),
      categoriasPorId.get(String(plano.categoria_id)) || 'Sem categoria',
    ];
    valores.forEach(valor => {
      const td = document.createElement('td');
      td.textContent = String(valor);
      tr.appendChild(td);
    });

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `adm-plano-status ${ativo ? 'is-ativo' : 'is-inativo'}`;
    statusBadge.textContent = ativo ? 'Ativo' : 'Inativo';
    statusCell.appendChild(statusBadge);
    tr.appendChild(statusCell);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'adm-plano-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'adm-btn adm-btn-secondary adm-btn-inline adm-btn-small';
    editButton.textContent = 'Editar';
    editButton.addEventListener('click', () => editarPlanoCatalogo(plano.id));
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = ativo
      ? 'adm-btn adm-btn-danger adm-btn-inline adm-btn-small'
      : 'adm-btn adm-btn-secondary adm-btn-inline adm-btn-small';
    statusButton.textContent = ativo ? 'Inativar' : 'Reativar';
    statusButton.addEventListener('click', () => alternarAtivoPlano(plano.id));
    actions.append(editButton, statusButton);
    actionsCell.appendChild(actions);
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
}

function popularSelectCategoriasPlanos(categorias = _cache.categoriasPlanos || [], categoriaSelecionada = '') {
  const select = document.getElementById('adm-plano-categoria');
  if (!select) return;
  select.replaceChildren(new Option('Selecione a categoria', ''));
  if (window._erroLoadCategoriasPlanos && !categorias.length) {
    select.replaceChildren(new Option('Erro ao carregar categorias — verifique o Supabase', ''));
    return;
  }
  (categorias || []).filter(c => c.ativo !== false || String(c.id) === String(categoriaSelecionada)).forEach(c => {
    const option = new Option(`${c.nome}${c.ativo === false ? ' (inativa)' : ''}`, String(c.id));
    select.appendChild(option);
  });
  if (categoriaSelecionada) select.value = String(categoriaSelecionada);
}

function renderTabelaCategoriasPlanos(categorias = [], planos = _cache.planos || []) {
  const tbody = document.getElementById('categorias-planos-tbody');
  if (!tbody) return;
  if (!categorias.length) {
    const erro = String(window._erroLoadCategoriasPlanos || '').trim();
    const mensagem = erro
      ? `Falha ao carregar categorias do Supabase: ${escapeHtmlText(erro)}`
      : 'Nenhuma categoria cadastrada.';
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:${erro ? '#f87171' : 'var(--text-muted)'};">${mensagem}</td></tr>`;
    popularSelectCategoriasPlanos(categorias);
    return;
  }

  tbody.replaceChildren();
  categorias.forEach(categoria => {
    const vinculados = (planos || []).filter(p => String(p.categoria_id) === String(categoria.id));
    const tr = document.createElement('tr');
    [categoria.nome, String(vinculados.length)].forEach(valor => {
      const td = document.createElement('td');
      td.textContent = valor;
      tr.appendChild(td);
    });
    const statusCell = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `adm-plano-status ${categoria.ativo === false ? 'is-inativo' : 'is-ativo'}`;
    badge.textContent = categoria.ativo === false ? 'Inativa' : 'Ativa';
    statusCell.appendChild(badge);
    tr.appendChild(statusCell);

    const actionsCell = document.createElement('td');
    const actions = document.createElement('div');
    actions.className = 'adm-plano-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'adm-btn adm-btn-secondary adm-btn-inline adm-btn-small';
    editButton.textContent = 'Renomear';
    editButton.addEventListener('click', () => editarCategoriaPlano(categoria.id));
    const statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.className = categoria.ativo === false
      ? 'adm-btn adm-btn-secondary adm-btn-inline adm-btn-small'
      : 'adm-btn adm-btn-danger adm-btn-inline adm-btn-small';
    statusButton.textContent = categoria.ativo === false ? 'Reativar' : 'Desativar';
    statusButton.addEventListener('click', () => alternarAtivoCategoriaPlano(categoria.id));
    actions.append(editButton, statusButton);
    actionsCell.appendChild(actions);
    tr.appendChild(actionsCell);
    tbody.appendChild(tr);
  });
  popularSelectCategoriasPlanos(categorias, document.getElementById('adm-plano-categoria')?.value);
}

function cancelarEdicaoCategoria() {
  const form = document.getElementById('adm-categoria-form');
  if (!form) return;
  form.reset();
  document.getElementById('adm-categoria-id').value = '';
  document.getElementById('adm-categoria-ativo').checked = true;
  document.getElementById('adm-categoria-submit').textContent = 'Criar categoria';
  document.getElementById('adm-categoria-cancelar').hidden = true;
}

function editarCategoriaPlano(id) {
  if (!ehSuperAdminAtual()) return showToast('Somente o superadministrador pode gerenciar categorias.', 'error');
  const categoria = (_cache.categoriasPlanos || []).find(c => String(c.id) === String(id));
  if (!categoria) return showToast('Não encontrei essa categoria no catálogo.', 'warning');
  document.getElementById('adm-categoria-id').value = String(categoria.id);
  document.getElementById('adm-categoria-nome').value = categoria.nome;
  document.getElementById('adm-categoria-ativo').checked = categoria.ativo !== false;
  document.getElementById('adm-categoria-submit').textContent = 'Salvar categoria';
  document.getElementById('adm-categoria-cancelar').hidden = false;
  document.getElementById('adm-categoria-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function salvarCategoriaPlano(event) {
  event?.preventDefault();
  if (!ehSuperAdminAtual() || !window._supabase) return showToast('Somente o superadministrador pode gerenciar categorias.', 'error');
  const id = document.getElementById('adm-categoria-id').value.trim();
  const nome = document.getElementById('adm-categoria-nome').value.trim().replace(/\s+/g, ' ');
  const ativo = document.getElementById('adm-categoria-ativo').checked;
  const duplicada = (_cache.categoriasPlanos || []).find(c => String(c.id) !== id && normalizarNomePlano(c.nome) === normalizarNomePlano(nome));
  if (!nome) return showToast('Informe o nome da categoria.', 'warning');
  if (duplicada) return showToast('Já existe uma categoria com esse nome.', 'warning');
  if (id && !ativo && (_cache.planos || []).some(p => String(p.categoria_id) === id && p.ativo !== false)) {
    return showToast('Antes de desativar esta categoria, mova ou inative todos os planos ativos vinculados a ela.', 'warning');
  }
  const submit = document.getElementById('adm-categoria-submit');
  const textoOriginal = submit.textContent;
  submit.disabled = true;
  submit.textContent = 'Salvando…';
  try {
    const requisicao = id
      ? window._supabase.from('categorias_planos').update({ nome, ativo }).eq('id', id)
      : window._supabase.from('categorias_planos').insert([{ nome, ativo }]);
    const { error } = await requisicao;
    if (error) throw error;
    cancelarEdicaoCategoria();
    await carregarDados();
    showToast(id ? 'Categoria atualizada.' : 'Categoria criada.', 'success');
  } catch (error) {
    console.error('[salvarCategoriaPlano]', error);
    showToast(error.message || 'Não foi possível salvar a categoria.', 'error');
  } finally {
    submit.disabled = false;
    if (!document.getElementById('adm-categoria-id').value) submit.textContent = textoOriginal === 'Salvar categoria' ? 'Criar categoria' : textoOriginal;
  }
}

async function alternarAtivoCategoriaPlano(id) {
  if (!ehSuperAdminAtual() || !window._supabase) return showToast('Somente o superadministrador pode gerenciar categorias.', 'error');
  const categoria = (_cache.categoriasPlanos || []).find(c => String(c.id) === String(id));
  if (!categoria) return showToast('Não encontrei essa categoria no catálogo.', 'warning');
  const novoAtivo = categoria.ativo === false;
  const planosAtivosVinculados = (_cache.planos || []).filter(p => String(p.categoria_id) === String(id) && p.ativo !== false);
  if (!novoAtivo && planosAtivosVinculados.length) {
    return showToast(`Esta categoria ainda possui ${planosAtivosVinculados.length} plano(s) ativo(s). Realoque ou inative esses planos antes de desativá-la.`, 'warning');
  }
  const acao = novoAtivo ? 'reativar' : 'desativar';
  if (!window.confirm(`Deseja ${acao} a categoria “${categoria.nome}”?`)) return;
  try {
    const { error } = await window._supabase.from('categorias_planos').update({ ativo: novoAtivo }).eq('id', id);
    if (error) throw error;
    await carregarDados();
    showToast(novoAtivo ? 'Categoria reativada.' : 'Categoria desativada.', 'success');
  } catch (error) {
    console.error('[alternarAtivoCategoriaPlano]', error);
    showToast(error.message || 'Não foi possível alterar a situação da categoria.', 'error');
  }
}

function normalizarNomePlano(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('pt-BR');
}

function cancelarEdicaoPlano() {
  const form = document.getElementById('adm-plano-form');
  if (!form) return;
  form.reset();
  document.getElementById('adm-plano-id').value = '';
  document.getElementById('adm-plano-ativo').checked = true;
  popularSelectCategoriasPlanos(_cache.categoriasPlanos || []);
  document.getElementById('adm-plano-form-title').textContent = 'Cadastrar plano';
  document.getElementById('adm-plano-submit').textContent = 'Cadastrar plano';
  document.getElementById('adm-plano-cancelar').hidden = true;
}

function editarPlanoCatalogo(id) {
  if (!ehSuperAdminAtual()) {
    showToast('Somente o superadministrador pode editar planos.', 'error');
    return;
  }
  const plano = (_cache.planos || []).find(item => String(item.id) === String(id));
  if (!plano) {
    showToast('Não encontrei esse plano no catálogo atualizado.', 'warning');
    return;
  }

  document.getElementById('adm-plano-id').value = String(plano.id);
  document.getElementById('adm-plano-nome').value = plano.nome || '';
  document.getElementById('adm-plano-velocidade').value = plano.velocidade_mb ?? '';
  document.getElementById('adm-plano-valor').value = plano.valor ?? '';
  document.getElementById('adm-plano-ativo').checked = plano.ativo !== false;
  popularSelectCategoriasPlanos(_cache.categoriasPlanos || [], plano.categoria_id);
  document.getElementById('adm-plano-form-title').textContent = 'Editar plano';
  document.getElementById('adm-plano-submit').textContent = 'Salvar alterações';
  document.getElementById('adm-plano-cancelar').hidden = false;
  document.getElementById('adm-plano-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

async function salvarPlanoCatalogo(event) {
  event?.preventDefault();
  if (!ehSuperAdminAtual() || !window._supabase) {
    showToast('Somente o superadministrador pode cadastrar ou editar planos.', 'error');
    return;
  }

  const id = document.getElementById('adm-plano-id').value.trim();
  const nome = document.getElementById('adm-plano-nome').value.trim();
  const velocidade = Number(document.getElementById('adm-plano-velocidade').value);
  const valor = Number(document.getElementById('adm-plano-valor').value);
  const categoriaId = document.getElementById('adm-plano-categoria').value;
  const ativo = document.getElementById('adm-plano-ativo').checked;
  const submit = document.getElementById('adm-plano-submit');

  const categoria = (_cache.categoriasPlanos || []).find(c => String(c.id) === String(categoriaId));
  if (!nome || !Number.isInteger(velocidade) || velocidade < 1 || !Number.isFinite(valor) || valor < 0 || !categoria) {
    showToast('Informe nome, velocidade, um valor mensal igual ou maior que zero e uma categoria válida.', 'warning');
    return;
  }
  if (categoria.ativo === false && String((_cache.planos || []).find(p => String(p.id) === id)?.categoria_id) !== String(categoria.id)) {
    showToast('Selecione uma categoria ativa para cadastrar ou mover este plano.', 'warning');
    return;
  }

  const nomeNormalizado = normalizarNomePlano(nome);
  const duplicado = (_cache.planos || []).find(plano =>
    String(plano.id) !== id &&
    normalizarNomePlano(plano.nome) === nomeNormalizado &&
    Number(plano.velocidade_mb) === velocidade
  );
  if (duplicado) {
    showToast(
      duplicado.ativo === false
        ? 'Já existe um plano inativo com esse nome e velocidade. Edite-o e reative-o para evitar duplicidade.'
        : 'Já existe um plano com esse nome e velocidade no catálogo.',
      'warning'
    );
    return;
  }

  const payload = { nome, velocidade_mb: velocidade, valor, ativo, categoria_id: Number(categoriaId) };
  const textoOriginal = submit.textContent;
  submit.disabled = true;
  submit.textContent = id ? 'Salvando…' : 'Cadastrando…';
  try {
    const requisicao = id
      ? window._supabase.from('planos').update(payload).eq('id', id)
      : window._supabase.from('planos').insert([payload]);
    const { error } = await requisicao;
    if (error) throw error;

    cancelarEdicaoPlano();
    await carregarDados();
    showToast(id ? 'Plano atualizado no catálogo.' : 'Plano cadastrado no catálogo.', 'success');
  } catch (error) {
    console.error('[salvarPlanoCatalogo]', error);
    showToast(error.message || 'Não foi possível salvar o plano.', 'error');
  } finally {
    submit.disabled = false;
    if (document.getElementById('adm-plano-id').value) {
      submit.textContent = 'Salvar alterações';
    } else {
      submit.textContent = textoOriginal === 'Salvar alterações' ? 'Cadastrar plano' : textoOriginal;
    }
  }
}

async function alternarAtivoPlano(id) {
  if (!ehSuperAdminAtual() || !window._supabase) {
    showToast('Somente o superadministrador pode alterar a situação dos planos.', 'error');
    return;
  }
  const plano = (_cache.planos || []).find(item => String(item.id) === String(id));
  if (!plano) {
    showToast('Não encontrei esse plano no catálogo atualizado.', 'warning');
    return;
  }
  const novoAtivo = plano.ativo === false;
  const acao = novoAtivo ? 'reativar' : 'inativar';
  if (!window.confirm(`Deseja ${acao} “${plano.nome} ${plano.velocidade_mb} Mbps”? ${novoAtivo ? 'Ele voltará a aparecer nas novas vendas.' : 'Ele deixará de aparecer nas novas vendas, e as vendas antigas serão preservadas.'}`)) return;

  try {
    const { error } = await window._supabase
      .from('planos')
      .update({ ativo: novoAtivo })
      .eq('id', id);
    if (error) throw error;
    await carregarDados();
    showToast(novoAtivo ? 'Plano reativado para novas vendas.' : 'Plano inativado; vendas antigas preservadas.', 'success');
  } catch (error) {
    console.error('[alternarAtivoPlano]', error);
    showToast(error.message || 'Não foi possível alterar a situação do plano.', 'error');
  }
}

function popularAdicionaisFormulario(adicionais) {
  // Formulário Nova Venda e Formulário Outras Filiais — cada checkbox
  // precisa do "name" exato que os handlers leem via querySelectorAll.
  const grids = [
    { gridId: 'adicionais-check-venda', prefix: 'ad-', nameAttr: 'adicionais', onchange: 'calcularTotal()' },
    { gridId: 'adicionais-check-filial', prefix: 'fad-', nameAttr: 'filial-adicionais', onchange: 'calcularTotalFilial()' },
  ];
  grids.forEach(({ gridId, prefix, nameAttr, onchange }) => {
    const el = document.getElementById(gridId);
    if (!el) return;
    if (!adicionais || adicionais.length === 0) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;">Nenhum adicional cadastrado.</div>';
      return;
    }
    el.innerHTML = adicionais.map(a => `
      <div class="adm-adicional-item">
        <input type="checkbox" id="${prefix}${a.id}" name="${nameAttr}" value="${a.id}|${a.valor}" onchange="${onchange}">
        <div>
          <label for="${prefix}${a.id}">${a.nome}</label>
          <div class="adm-adicional-price">R$ ${Number(a.valor).toFixed(2).replace('.',',')} /mês</div>
        </div>
      </div>`).join('');
  });

  // Tabela de catálogo em "Adicionais" (dados reais, não hard-coded)
  const tbody = document.getElementById('adm-adicionais-tbody');
  if (tbody) {
    tbody.innerHTML = (adicionais && adicionais.length)
      ? adicionais.map(a => `<tr>
          <td>${a.nome}</td>
          <td>R$ ${Number(a.valor).toFixed(2).replace('.',',')}</td>
          <td>❌ Não</td>
          <td>Entra no valor financeiro</td>
        </tr>`).join('')
      : '<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">Nenhum adicional cadastrado no banco.</td></tr>';
  }

  // Select "Produto adicional" do formulário de Adicional Avulso
  const selProduto = document.getElementById('adic-produto');
  if (selProduto) {
    selProduto.innerHTML = '<option value="">Selecione o produto</option>' +
      (adicionais || []).map(a => `<option value="${a.id}" data-valor="${a.valor}">${a.nome} — R$ ${Number(a.valor).toFixed(2).replace('.',',')}</option>`).join('');
  }
}

// Ao escolher o produto no formulário de Adicional Avulso, preenche
// automaticamente o valor unitário com o preço atual do catálogo
// (o vendedor ainda pode ajustar manualmente antes de salvar).
function preencherValorAdicional() {
  const sel = document.getElementById('adic-produto');
  const valorEl = document.getElementById('adic-valor');
  if (!sel || !valorEl) return;
  const opt = sel.selectedOptions[0];
  if (opt && opt.dataset.valor) valorEl.value = opt.dataset.valor;
}

// ================================================================
// DROPDOWN CUSTOMIZADO DO CAMPO "PLANO" — só camada visual.
// O <select> real por trás (escondido) continua sendo a única fonte
// de verdade do valor: quem lê/valida/envia o formulário nunca muda,
// só a forma como o usuário escolhe a opção fica mais bonita.
// ================================================================

// Monta o painel visual a partir do MESMO agrupamento (grupos) que já
// é usado para montar o <select> real — nenhum dado novo é calculado.
function buildCustomSelectPanel(selectId, grupos) {
  const panel = document.getElementById(selectId + '-panel');
  if (!panel) return;
  panel.innerHTML = Object.entries(grupos).map(([g, ps]) => `
    <div class="custom-select-group-label">${escapeHtmlText(g)}</div>
    ${ps.map(p => {
      const value = `${p.id}|${p.valor}`;
      const label = `${p.nome} ${p.velocidade_mb} Mbps${p.vendasNoMes ? ` — ${p.vendasNoMes} venda${p.vendasNoMes === 1 ? '' : 's'} no mês` : ''}`;
      const priceLabel = 'R$ ' + Number(p.valor).toFixed(2).replace('.', ',');
      return `<div class="custom-select-option" data-value="${escapeHtmlText(value)}" data-label="${escapeHtmlText(`${label} — ${priceLabel}`)}">
        <span>${escapeHtmlText(label)}</span><span class="csopt-price">${escapeHtmlText(priceLabel)}</span>
      </div>`;
    }).join('')}
  `).join('');
  // garante que o botão volte a mostrar o placeholder quando os
  // planos são recarregados (ex.: depois de registrar uma venda)
  const trigger = document.getElementById(selectId + '-trigger');
  if (trigger) {
    const valueEl = trigger.querySelector('.custom-select-value');
    valueEl.textContent = 'Selecione o plano';
    valueEl.classList.add('placeholder');
  }
}

// Aplica a escolha feita no dropdown visual de volta no <select> real
// (dispara 'change' pra continuar acionando calcularTotal()/
// calcularTotalFilial(), exatamente como já acontecia antes).
function customSelectPick(selectId, value, label) {
  const sel = document.getElementById(selectId);
  const wrap = document.getElementById(selectId + '-custom');
  if (!sel || !wrap) return;
  sel.value = value;
  sel.dispatchEvent(new Event('change'));
  const valueEl = wrap.querySelector('.custom-select-value');
  valueEl.textContent = label;
  valueEl.classList.remove('placeholder');
  wrap.querySelectorAll('.custom-select-option').forEach(o => {
    o.classList.toggle('selected', o.dataset.value === value);
  });
  wrap.classList.remove('open');
}

// Um único listener cuida de abrir/fechar/escolher em qualquer
// dropdown customizado da página (hoje só os de plano, mas serve
// para qualquer outro que venha a usar essa mesma estrutura).
document.addEventListener('click', (e) => {
  const opt = e.target.closest('.custom-select-option');
  if (opt) {
    const wrap = opt.closest('.custom-select');
    customSelectPick(wrap.dataset.for, opt.dataset.value, opt.dataset.label);
    return;
  }
  const trigger = e.target.closest('.custom-select-trigger');
  if (trigger) {
    const wrap = trigger.closest('.custom-select');
    const isOpen = wrap.classList.contains('open');
    document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
    if (!isOpen) wrap.classList.add('open');
    if (!isOpen) {
      const rect = trigger.getBoundingClientRect();
      const espacoAbaixo = window.innerHeight - rect.bottom - 20;
      const espacoAcima = rect.top - 20;
      const abrirAcima = espacoAbaixo < 260 && espacoAcima > espacoAbaixo;
      wrap.classList.toggle('opens-up', abrirAcima);
      wrap.style.setProperty('--custom-select-max-height', `${Math.max(120, Math.min(300, abrirAcima ? espacoAcima : espacoAbaixo) - 12)}px`);
    }
    return;
  }
  document.querySelectorAll('.custom-select.open').forEach(wrap => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
});

function isVendaRecebidaDeOutraFilial(venda) {
  return venda?.filial_origem_id != null && venda?.filial_destino_id != null &&
    Number(venda.filial_origem_id) !== Number(venda.filial_destino_id);
}

function popularSelectFiliais(filiais) {
  const el = document.getElementById('filial-origem');
  if (el) {
    el.innerHTML = '<option value="">Selecione a filial</option>' +
      filiais.filter(f => Number(f.id) !== Number(window.FILIAL_ATUAL_ID) && f.ativo !== false)
        .map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
  }

  const destinoEl = document.getElementById('venda-destino');
  const destinoCampo = document.getElementById('venda-destino-field');
  if (destinoEl && destinoCampo) {
    const adminAutenticado = window.ADMIN_AUTENTICADO === true;
    destinoCampo.hidden = !adminAutenticado;
    destinoEl.replaceChildren(new Option('Selecione a filial de destino', ''));
    (filiais || []).filter(f => f.ativo !== false).forEach(f => {
      destinoEl.add(new Option(f.nome, String(f.id)));
    });
    // Todos os administradores autenticados podem escolher uma filial ativa;
    // a filial aberta permanece como padrão para não mudar o fluxo atual.
    destinoEl.value = String(window.FILIAL_ATUAL_ID || '');
    destinoEl.required = adminAutenticado;
    destinoEl.onchange = () => atualizarMaisVendidosDaFilial(destinoEl.value);
  }

  const data = document.getElementById('filial-data');
  if (data && !data.value) {
    const hoje = new Date();
    data.value = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
  }
}

function calcularEvolucaoSemana(vendasSemana, vendasOrigemSemana, vendasFiliais, semana) {
  const diasLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const diasContagem = new Array(7).fill(0);
  const indiceDoDia = data => {
    const dataStr = String(data || '').slice(0, 10);
    const date = new Date(dataStr + 'T12:00:00');
    if (Number.isNaN(date.getTime())) return -1;
    return date.getDay() === 0 ? 6 : date.getDay() - 1;
  };

  (vendasSemana || []).forEach(v => {
    if (isVendaRecebidaDeOutraFilial(v) && v.vendedor_id != null) return;
    const idx = indiceDoDia(v.data_venda);
    if (idx >= 0) diasContagem[idx]++;
  });
  (vendasOrigemSemana || []).forEach(v => {
    const idx = indiceDoDia(v.dia);
    if (idx >= 0) diasContagem[idx] += Number(v.vendas || 0);
  });
  (vendasFiliais || []).forEach(v => {
    const dataStr = dataLocalStr(v.data_venda);
    if (!dataNoPeriodo(v.data_venda, semana.de, semana.ate)) return;
    const idx = indiceDoDia(dataStr);
    if (idx >= 0) diasContagem[idx] += Number(v.quantidade || 1);
  });
  return diasLabels.map((dia, i) => ({ dia, vendas: diasContagem[i] }));
}

function calcularSemanaDashboard(offset) {
  const semanaAtual = _cache.semana || calcularPeriodoSemana();
  const inicio = new Date(semanaAtual.inicio);
  inicio.setDate(inicio.getDate() + (Number(offset) || 0) * 7);
  inicio.setHours(0, 0, 0, 0);
  const fim = new Date(inicio);
  fim.setDate(fim.getDate() + 6);
  fim.setHours(23, 59, 59, 999);
  const fmt = d => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const labelDia = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  return {
    de: fmt(inicio), ate: fmt(fim), inicio, fim,
    label: `${labelDia(inicio)} a ${labelDia(fim)}`,
    diasLabels: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'],
  };
}

function renderAdmSemana(dias, semana) {
  const range = document.getElementById('dash-week-range');
  if (range) range.textContent = semana?.label ? `De ${semana.label}` : 'Semana atual';
  const next = document.getElementById('dash-week-next');
  if (next) next.disabled = _dashSemanaOffset >= 0;

  const barrasSemana = document.getElementById('dash-week-bars');
  if (!barrasSemana) return;
  barrasSemana.setAttribute('aria-label', semana?.label ? `Vendas por dia na semana de ${semana.label}` : 'Vendas por dia nesta semana');
  const dados = dias || [];
  const maiorDia = Math.max(1, ...dados.map(item => Number(item.vendas) || 0));
  const fragmento = document.createDocumentFragment();
  dados.forEach(item => {
    const quantidade = Math.max(0, Number(item.vendas) || 0);
    const coluna = document.createElement('div');
    coluna.className = 'adm-dashboard-day';
    coluna.setAttribute('role', 'group');
    coluna.setAttribute('aria-label', `${item.dia}: ${quantidade} ${quantidade === 1 ? 'venda' : 'vendas'}`);

    const valor = document.createElement('span');
    valor.className = 'adm-dashboard-day-value';
    valor.textContent = String(quantidade);
    const trilho = document.createElement('div');
    trilho.className = 'adm-dashboard-day-track';
    trilho.setAttribute('aria-hidden', 'true');
    const preenchimento = document.createElement('span');
    preenchimento.style.height = `${quantidade ? Math.max(8, (quantidade / maiorDia) * 100) : 3}%`;
    trilho.appendChild(preenchimento);
    const nomeDia = document.createElement('span');
    nomeDia.className = 'adm-dashboard-day-label';
    nomeDia.textContent = item.dia;
    coluna.append(valor, trilho, nomeDia);
    fragmento.appendChild(coluna);
  });
  barrasSemana.replaceChildren(fragmento);
}

async function navegarSemanaAdm(direcao) {
  const offset = Math.min(0, _dashSemanaOffset + (Number(direcao) || 0));
  if (offset === _dashSemanaOffset || !_ultimoProcessado) return;
  _dashSemanaOffset = offset;
  const requestId = ++_dashSemanaRequestId;
  const anterior = document.querySelector('.adm-dashboard-week-arrow[aria-label="Semana anterior"]');
  const proxima = document.getElementById('dash-week-next');
  const barras = document.getElementById('dash-week-bars');
  if (anterior) anterior.disabled = true;
  if (proxima) proxima.disabled = true;
  if (barras) barras.setAttribute('aria-busy', 'true');

  try {
    if (offset === 0) {
      _dashSemanaSelecionada = { periodo: _ultimoProcessado.semana, dias: _ultimoProcessado.evolucaoSemana || [] };
    } else {
      const periodo = calcularSemanaDashboard(offset);
      const [vendas, origem, outrasFiliais] = await Promise.all([
        loadVendas(periodo.de, periodo.ate),
        loadVendasOrigem(periodo.de, periodo.ate),
        loadVendasOutrasFiliais(periodo.de, periodo.ate),
      ]);
      if (requestId !== _dashSemanaRequestId) return;
      _dashSemanaSelecionada = {
        periodo,
        dias: calcularEvolucaoSemana(vendas, origem, outrasFiliais, periodo),
      };
    }
    if (requestId === _dashSemanaRequestId) renderAdmSemana(_dashSemanaSelecionada.dias, _dashSemanaSelecionada.periodo);
  } catch (error) {
    console.error('[navegarSemanaAdm]', error);
    _dashSemanaOffset = Math.min(0, _dashSemanaOffset - (Number(direcao) || 0));
    if (requestId === _dashSemanaRequestId) showToast('Não foi possível carregar as vendas dessa semana.', 'error');
  } finally {
    if (requestId === _dashSemanaRequestId) {
      if (anterior) anterior.disabled = false;
      if (proxima) proxima.disabled = _dashSemanaOffset >= 0;
      if (barras) barras.removeAttribute('aria-busy');
    }
  }
}

// ── Processar dados para renderização ────────────────────────────
function processarDadosParaRender(cache) {
  if (!cache) return null;
  const { vendasSemana, vendasMes, vendasFiliais, vendaMaisRecente,
          semana, mes, metasFilial, metas, metasRenovCancel, vendedores, planos, vendasSemanaAnterior,
          vendasOrigemSemana = [], vendasOrigemSemanaAnterior = [], vendasOrigemMes = [] } = cache;

  // Meta individual de cada vendedor, buscada da tabela metas (mes/ano/vendedor_id).
  // Internos usam a faixa M3 (base) para o cálculo de % e ritmo;
  // externos usam meta_vendas. Nunca inventa um número — se a linha
  // não existir no banco, fica sem meta (null) e a UI mostra "—".
  const metaPorVendedor = (vendedorId, tipo) => {
    const linha = (metas || []).find(m => m.vendedor_id === vendedorId);
    if (!linha) return null;
    return tipo === 'interno' ? (linha.meta_m3 || null) : (linha.meta_vendas || null);
  };

  // Contagem de vendas da semana anterior por vendedor — usada só
  // para calcular a evolução real (sem inventar nenhum número).
  // Aplica a mesma regra de fora_filial usada na contagem da semana
  // atual, para a comparação (evolução) ficar consistente.
  const tipoPorVendedor = {};
  (vendedores || []).forEach(v => { tipoPorVendedor[v.id] = v.tipo; });
  const vendedoresExternosIds = new Set((vendedores || [])
    .filter(v => v.tipo === 'externo')
    .map(v => String(v.id)));
  const isVendaInterregionalComVendedor = v => isVendaRecebidaDeOutraFilial(v)
    && v.vendedor_id != null;
  const isVendaExternaRecebidaDeOutraFilial = v => isVendaRecebidaDeOutraFilial(v)
    && vendedoresExternosIds.has(String(v.vendedor_id));
  const contarVendasPorVendedor = (vendas) => {
    const mapa = {};
    (vendas || []).forEach(v => {
      if (tipoPorVendedor[v.vendedor_id] === 'externo' && (v.fora_filial === true || isVendaRecebidaDeOutraFilial(v))) return;
      mapa[v.vendedor_id] = (mapa[v.vendedor_id] || 0) + 1;
    });
    return mapa;
  };
  const contagemSemanaAnterior = contarVendasPorVendedor(vendasSemanaAnterior);

  // Agrupar vendas por vendedor para os pódios
  const agruparPorVendedor = (vendas, vendedoresFiltro) => {
    const mapa = {};
    vendedoresFiltro.forEach(v => {
      mapa[v.id] = {
        id: v.id, slug: v.slug || v.id, nome: v.nome, tipo: v.tipo,
        foto_url: v.foto_url || null,
        vendas: 0, valor: 0, meta: metaPorVendedor(v.id, v.tipo),
        evolucao: 0, // preenchido abaixo, após contar as vendas da semana atual
      };
    });
    vendas.forEach(v => {
      if (mapa[v.vendedor_id]) {
        // Venda externa "fora da filial" não conta para a meta
        // individual/semanal do vendedor externo (mas continua
        // existindo no banco normalmente — só não entra nesta contagem).
        if (mapa[v.vendedor_id].tipo === 'externo' && (v.fora_filial === true || isVendaRecebidaDeOutraFilial(v))) return;
        mapa[v.vendedor_id].vendas += 1;
        mapa[v.vendedor_id].valor += Number(v.valor || 0);
      }
    });
    // evolução real = vendas desta semana - vendas da semana anterior
    Object.values(mapa).forEach(e => {
      e.evolucao = e.vendas - (contagemSemanaAnterior[e.id] || 0);
    });
    return Object.values(mapa);
  };

  const internos = vendedores.filter(v => v.tipo === 'interno');
  const externos = vendedores.filter(v => v.tipo === 'externo');

  const extSem = agruparPorVendedor(vendasSemana, externos);
  const intSem = agruparPorVendedor(vendasSemana, internos);
  const extMes = agruparPorVendedor(vendasMes, externos);
  const intMes = agruparPorVendedor(vendasMes, internos);

  // Vendas interregionais entram no semanal da filial de origem para ambos
  // os tipos. Na meta individual mensal, o crédito adicional é só do interno.
  const agregarVendasOrigemPorVendedor = vendas => {
    const mapa = new Map();
    vendas.forEach(v => {
      const id = Number(v.vendedor_id);
      const atual = mapa.get(id) || { vendas: 0, valor: 0 };
      atual.vendas += Number(v.vendas || 0);
      atual.valor += Number(v.valor || 0);
      mapa.set(id, atual);
    });
    return mapa;
  };
  const agregarOrigemDoTipo = (vendas, tipo) => agregarVendasOrigemPorVendedor(
    (vendas || []).filter(v => v.tipo === tipo)
  );
  const atualizarRankingSemanalDaOrigem = (ranking, tipo) => {
    const atualPorId = agregarOrigemDoTipo(vendasOrigemSemana, tipo);
    const anteriorPorId = agregarOrigemDoTipo(vendasOrigemSemanaAnterior, tipo);
    ranking.forEach(v => {
      const atual = atualPorId.get(Number(v.id));
      const anterior = anteriorPorId.get(Number(v.id));
      if (atual) {
        v.vendas += atual.vendas;
        v.valor += atual.valor;
      }
      v.evolucao += Number(atual?.vendas || 0) - Number(anterior?.vendas || 0);
    });
  };
  atualizarRankingSemanalDaOrigem(extSem, 'externo');
  atualizarRankingSemanalDaOrigem(intSem, 'interno');
  const vendasOrigemInternosPorId = agregarOrigemDoTipo(vendasOrigemMes, 'interno');
  intMes.forEach(v => {
    const adicionais = vendasOrigemInternosPorId.get(Number(v.id));
    if (!adicionais) return;
    v.vendas += adicionais.vendas;
    v.valor += adicionais.valor;
  });

  // Evolução semanal (vendas por dia da semana) — usa exclusivamente
  // as vendas reais da semana atual (vendasSemana), sem depender de metas.
  const evolucaoSemana = calcularEvolucaoSemana(vendasSemana, vendasOrigemSemana, vendasFiliais, semana);

  // Vendas por plano (donut) — identifica cada plano por plano_id +
  // velocidade_mb (não só pelo nome, que se repete entre velocidades
  // diferentes). A velocidade vem de "planos" (já carregado em cache,
  // sem nova consulta ao Supabase), já que a view de vendas não a traz.
  const CORES_PLANOS = [corTema('--accent', '#21d9ff'), corTema('--accent2', '#7c5cff'), '#ffc94d','#ff5f6e','#34d399','#f97316','#a78bfa','#fb7185'];
  const planosMapa = {};
  vendasMes.forEach(v => {
    const planoId = v.plano_id;
    const planoNome = v.planos?.nome || planoId;
    const planoInfo = (planos || []).find(p => p.id === planoId);
    const velocidade = planoInfo ? planoInfo.velocidade_mb : null;
    const chave = planoId; // continua 1 grupo por plano_id real (nunca por nome)
    if (!planosMapa[chave]) {
      const label = velocidade ? `${planoNome} ${velocidade} Mbps` : planoNome;
      planosMapa[chave] = { nome: label, vendas: 0 };
    }
    planosMapa[chave].vendas++;
  });
  // Vendas de outras filiais PARA a nossa também representam vendas
  // reais de plano para a nossa filial — somam aqui pela quantidade
  // de cada registro (nunca pelos adicionais, que não são contados
  // como venda de plano). O plano é identificado pelo mesmo plano_id
  // e a velocidade vem do mesmo cache de "planos" já carregado.
  (vendasFiliais || []).forEach(v => {
    const planoId = v.plano_id;
    const planoNome = v.plano_nome || planoId;
    const planoInfo = (planos || []).find(p => p.id === planoId);
    const velocidade = planoInfo ? planoInfo.velocidade_mb : null;
    const chave = planoId;
    if (!planosMapa[chave]) {
      const label = velocidade ? `${planoNome} ${velocidade} Mbps` : planoNome;
      planosMapa[chave] = { nome: label, vendas: 0 };
    }
    planosMapa[chave].vendas += Number(v.quantidade || 1);
  });
  const vendasPorPlano = Object.values(planosMapa).map((p, i) => ({ ...p, cor: CORES_PLANOS[i % CORES_PLANOS.length] }));

  // Totais mensais — meta GLOBAL da filial: vendas fora da filial
  // (de qualquer tipo de vendedor) NÃO contam aqui (diferente da
  // semana, onde contam — ver totalSemana abaixo). Vendas de OUTRAS
  // filiais registradas PARA a nossa (vendasFiliais) somam aqui pela
  // quantidade de cada registro — mas nunca entram em ranking, líder,
  // meta individual ou evolução individual (permanecem à parte).
  const vendasOutrasFiliaisMes = (vendasFiliais || [])
    .reduce((s, v) => s + Number(v.quantidade || 1), 0);
  const totalMes = vendasMes.filter(v => v.fora_filial !== true).length + vendasOutrasFiliaisMes;

  const vendasOutrasFiliaisSemana = (vendasFiliais || [])
    .filter(v => {
      const dataStr = dataLocalStr(v.data_venda);
      return dataNoPeriodo(v.data_venda, semana.de, semana.ate);
    })
    .reduce((s, v) => s + Number(v.quantidade || 1), 0);
  // Vendas entre regionais com vendedor contam no mês do destino, mas na
  // semana ficam na filial de origem do vendedor. Vendas de outras filiais
  // sem vendedor seguem na contagem da filial destino.
  const vendasRecebidasSemana = vendasSemana.filter(isVendaInterregionalComVendedor).length;
  const vendasOrigemSemanaTotal = (vendasOrigemSemana || [])
    .reduce((s, v) => s + Number(v.vendas || 0), 0);
  const totalSemana = vendasSemana.length - vendasRecebidasSemana
    + vendasOutrasFiliaisSemana + vendasOrigemSemanaTotal;
  const metaGlobal = (metasFilial && metasFilial.mensal_m1) || null; // sem fallback fictício
  const pctMensal = metaGlobal ? Math.min(100, Math.round((totalMes / metaGlobal) * 100)) : 0;
  // O ranking mensal também credita aos vendedores internos as vendas
  // interregionais feitas por eles (somadas em intMes acima). Use os mesmos
  // totais exibidos na classificação para que o ranking do ADM e o card
  // "Líder do mês" não divergirem do ranking mensal principal.
  const rankingMes = [...extMes, ...intMes]
    .map(v => ({ vendedor_id: v.id, nome: v.nome, slug: v.slug, vendas: v.vendas, valor: v.valor }))
    .sort((a, b) => b.vendas - a.vendas || b.valor - a.valor);
  const lider = rankingMes[0]?.nome || '—';

  // Venda mais recente
  let vendaRecenteLabel = '—';
  if (vendaMaisRecente) {
    const d = new Date(vendaMaisRecente.data_venda);
    vendaRecenteLabel = `${vendaMaisRecente.vendedores?.nome || '—'} — ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
  }

  // Calcular destaques da semana automaticamente
  const todasSemana = [...extSem, ...intSem];
  const liderExternoSem = extSem.sort((a,b) => (b.vendas - a.vendas) || ((b.valor||0) - (a.valor||0)))[0];
  const liderInternoSem = intSem.sort((a,b) => (b.vendas - a.vendas) || ((b.valor||0) - (a.valor||0)))[0];
  const maiorEvolucao = todasSemana.reduce((a, b) => (b.vendas || 0) > (a.vendas || 0) ? b : a, todasSemana[0] || {});
  const todasMensal = [...extMes, ...intMes];
  const maiorPct = todasMensal.reduce((a,b) => {
    const pA = a.meta ? a.vendas/a.meta : 0;
    const pB = b.meta ? b.vendas/b.meta : 0;
    return pB > pA ? b : a;
  }, todasMensal[0] || {});

  return {
    extSem, intSem, extMes, intMes,
    totalSemana, totalMes, pctMensal, lider,
    evolucaoSemana, vendasPorPlano,
    metasFilial, metasRenovCancel, semana, mes,
    liderExternoSem, liderInternoSem, maiorEvolucao, maiorPct,
    vendaRecenteLabel,
    rankingMes,
    // meta global da filial: vendas fora da filial não entram na
    // contagem "nossa equipe" do totalizador (calcularTotais em si
    // não foi alterada — só o array de entrada é filtrado aqui).
    totalGlobal: calcularTotais(
      vendasMes.filter(v => v.fora_filial !== true && !isVendaRecebidaDeOutraFilial(v)),
      vendasFiliais,
      metaGlobal,
      vendasMes.filter(v => v.fora_filial !== true && isVendaRecebidaDeOutraFilial(v))
    ),
  };
}

// renderAll SEMPRE recebe um cache real e populado pelo carregarDados().
// Nunca é chamada com null — o estado "sem dados" é tratado à parte
// por renderEstadoSemDados(), que NUNCA usa DATA/CONFIG como números atuais.
// Atualiza os 5 cards da seção "Visão Geral" do Painel Administrativo
// (dash-semana, dash-mes, dash-valor, dash-meta-pct, dash-lider).
// Reaproveita 100% os dados já calculados por processarDadosParaRender()
// (d) — nenhuma consulta nova ao Supabase é feita aqui.
function renderAdmDashboard(d) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

  setText('dash-semana', d.totalSemana + ' vendas');
  setText('dash-mes', d.totalMes + ' vendas');

  // Valor mensal real (plano + adicionais), somando o ranking do mês
  // já calculado por calcularRanking() — mesmo valor usado no ranking.
  const valorMes = (d.rankingMes || []).reduce((s, r) => s + Number(r.valor || 0), 0);
  setText('dash-valor', 'R$ ' + valorMes.toFixed(2).replace('.', ','));

  // Meta mensal M1 real, vinda de metas_filial (já normalizada por
  // loadMetasFilial()). Se não estiver configurada, mostra "—".
  const metaM1 = d.metasFilial && d.metasFilial.mensal_m1;
  setText('dash-meta-pct', metaM1 ? (d.pctMensal + '%') : '—');
  const progresso = metaM1 ? Math.max(0, Math.min(100, Number(d.pctMensal) || 0)) : 0;
  const barraMeta = document.getElementById('dash-meta-progress');
  const progressoWrap = barraMeta?.parentElement;
  if (barraMeta) barraMeta.style.width = `${progresso}%`;
  if (progressoWrap) progressoWrap.setAttribute('aria-valuenow', String(Math.round(progresso)));
  setText('dash-meta-summary', metaM1
    ? `${Number(d.totalMes || 0).toLocaleString('pt-BR')} de ${Number(metaM1).toLocaleString('pt-BR')} vendas`
    : 'Meta M1 ainda não configurada');

  if (_dashSemanaOffset === 0) _dashSemanaSelecionada = { periodo: d.semana, dias: d.evolucaoSemana || [] };
  const semanaVisivel = _dashSemanaSelecionada || { periodo: d.semana, dias: d.evolucaoSemana || [] };
  renderAdmSemana(semanaVisivel.dias, semanaVisivel.periodo);

  // Líder do mês real (nome, já resolvido pelo mesmo critério de
  // desempate do ranking: vendas e, em empate, valor vendido).
  setText('dash-lider', d.lider || '—');
}

// Detecta automaticamente quando um vendedor ou a própria filial cruza
// uma meta pela primeira vez, e avisa com um toast comemorativo — sem
// precisar do botão manual "Anunciar Destaque". Usa localStorage só
// pra lembrar "já avisei isso neste mês", nunca pra guardar os dados
// em si (que continuam vindo 100% do Supabase a cada carregamento).
function verificarConquistasDeMetas(d) {
  if (!d || !d.mes) return;
  const chave = 'uni_metas_avisadas_' + d.mes.ano + '-' + d.mes.mesNum;
  let avisadas = {};
  try { avisadas = JSON.parse(localStorage.getItem(chave) || '{}'); } catch (e) { avisadas = {}; }

  const todos = [...(d.extMes || []), ...(d.intMes || [])];
  todos.forEach(v => {
    if (!v.meta || avisadas[v.id]) return;
    if (v.vendas >= v.meta) {
      showToast(`${v.nome} bateu a meta do mês! (${v.vendas}/${v.meta} vendas)`, 'celebration', 8000);
      avisadas[v.id] = true;
    }
  });

  if (d.metasFilial && d.metasFilial.mensal_m1 && !avisadas['__filial_m1']) {
    if (d.totalMes >= d.metasFilial.mensal_m1) {
      showToast(`A filial bateu a Meta Mensal M1! (${d.totalMes}/${d.metasFilial.mensal_m1} vendas)`, 'celebration', 8000);
      avisadas['__filial_m1'] = true;
    }
  }

  try { localStorage.setItem(chave, JSON.stringify(avisadas)); } catch (e) { /* localStorage indisponível — só não avisa de novo nesta sessão */ }
}

function renderAll(cache) {
  document.getElementById('celebrateBtn').style.display = CONFIG.mostrarBotaoDestaque ? 'inline-flex' : 'none';

  renderHistorico();

  const d = processarDadosParaRender(cache);
  _ultimoProcessado = d;
  verificarConquistasDeMetas(d);

  // KPIs do cabeçalho — 100% derivados dos dados reais carregados do Supabase
  const kpiSemana = document.getElementById('kpiSemana');
  const kpiMensal = document.getElementById('kpiMensal');
  const kpiLider = document.getElementById('kpiLider');
  if (kpiSemana) kpiSemana.textContent = d.totalSemana + ' vendas';
  if (kpiMensal) kpiMensal.textContent = d.pctMensal + '% atingido';
  if (kpiLider) kpiLider.textContent = d.lider;

  renderWeekProgress(d);
  renderDestaquesSemana(d);
  renderDestaquesExternosGlobais();
  renderMetasFilial('semanal', d);
  renderRenovacaoCancelamento(d);
  renderEvolucaoChart(d.evolucaoSemana);
  renderDonutChart(d.vendasPorPlano);
  renderConquistas();

  // Pódios: sempre dados reais do Supabase
  // Mapa vendedor_id -> vendas do MÊS (independe de qual pódio está
  // sendo desenhado — a meta individual M1/M2/M3 é sempre mensal).
  const vendasMesPorId = {};
  [...d.intMes, ...d.extMes].forEach(v => { vendasMesPorId[v.id] = v.vendas; });
  const opcoesTier = { metasIndividuais: cache.metas, vendasMesPorId };

  renderPodium('podium-semanal-externo', d.extSem, { mode: 'semanal', ...opcoesTier });
  renderPodium('podium-semanal-interno', d.intSem, { mode: 'semanal', ...opcoesTier });
  renderPodium('podium-mensal-externo',  d.extMes,  { mode: 'mensal', ...opcoesTier });
  renderPodium('podium-mensal-interno',  d.intMes,  { mode: 'mensal', ...opcoesTier });

  atualizarListaClassificacaoCompleta('semanal', [d.extSem, d.intSem], 'semanal');
  atualizarListaClassificacaoCompleta('mensal', [d.extMes, d.intMes], 'mensal');

  // Totalizador global — sempre dados reais
  atualizarTotalizadorComDados(d.totalGlobal);

  // Ranking ADM
  renderAdmRanking(d.rankingMes, cache.vendedores);
  renderAdmVendedoresTable(d);
  renderAdmMetasConfig(cache);
  renderConfigMetas(cache);
  renderAdmDashboard(d);
}

// toggleTheme continua sendo a ÚNICA função responsável pela troca de
// tema. Só passou a aceitar um lado explícito (force = 'light'|'dark')
// pra funcionar com a pill segmentada (clicar em "Modo Claro" sempre
// vai pra claro, clicar em "Modo Escuro" sempre vai pra escuro).
// Chamada sem argumento, continua alternando como antes.
function toggleTheme(force) {
  const html = document.documentElement;
  const atual = html.getAttribute('data-theme');
  const novo = (force === 'light' || force === 'dark') ? force : (atual === 'dark' ? 'light' : 'dark');
  html.setAttribute('data-theme', novo);
  try { localStorage.setItem('uni-theme', novo); } catch (e) {}

  const wrap = document.getElementById('themeToggle');
  if (wrap) {
    wrap.setAttribute('data-active', novo);
    wrap.querySelectorAll('.theme-toggle-option').forEach(btn => {
      btn.setAttribute('aria-pressed', btn.dataset.themeChoice === novo ? 'true' : 'false');
    });
  }
}

// alinha o seletor Claro/Escuro com o tema aplicado no <head>
(function () {
  const wrap = document.getElementById('themeToggle');
  const atual = document.documentElement.getAttribute('data-theme');
  if (!wrap || !atual) return;
  wrap.setAttribute('data-active', atual);
  wrap.querySelectorAll('.theme-toggle-option').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.themeChoice === atual ? 'true' : 'false');
  });
})();

document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-button').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    const tab = btn.dataset.tab;
    document.querySelectorAll('[data-tab-panel]').forEach(panel => {
      panel.classList.toggle('hidden', panel.dataset.tabPanel !== tab);
    });

    // troca o card de meta e as metas da filial conforme a aba ativa
    document.documentElement.setAttribute('data-active-tab', tab);
    const isMensal = tab === 'mensal';
    if (_dadosCarregados) {
      // reprocessa o cache já carregado (sem nova chamada de rede)
      const d = processarDadosParaRender(_cache);
      if (isMensal) {
        renderMensalProgress(d);
      } else {
        renderWeekProgress(d);
      }
      renderMetasFilial(isMensal ? 'mensal' : 'semanal', d);
    }
    // se não há dados carregados, o estado "sem dados" já está
    // visível (renderEstadoSemDados) e não precisa ser recalculado
  });
});

// ============================================================
// ============================================================
document.querySelectorAll('.ranking-full-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const painel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!painel) return;
    const abrir = painel.hidden;
    painel.hidden = !abrir;
    btn.setAttribute('aria-expanded', String(abrir));
    btn.textContent = abrir ? '👥 Ocultar classificação completa' : '👥 Ver classificação completa';
  });
});

// TELA DE CELEBRAÇÃO — clique no botão "🎉 Anunciar Destaque"
// para mostrar o vendedor externo e interno em 1º lugar
// no ranking mensal real (calculado a partir do Supabase)
// ============================================================
function buildConfetti() {
  const field = document.getElementById('confettiField');
  const colors = [corTema('--accent', '#21d9ff'), corTema('--accent2', '#7c5cff'), '#ffc94d', '#ff5fae', '#34d399'];
  let html = '';
  for (let i = 0; i < 70; i++) {
    const left = (Math.random() * 100).toFixed(1);
    const color = colors[Math.floor(Math.random() * colors.length)];
    const duration = (3.5 + Math.random() * 3).toFixed(2);
    const delay = (Math.random() * 3).toFixed(2);
    const size = (6 + Math.random() * 6).toFixed(1);
    const round = Math.random() > 0.5 ? '50%' : '2px';
    html += `<span class="confetti-piece" style="left:${left}%;background:${color};width:${size}px;height:${size * 1.5}px;border-radius:${round};animation-duration:${duration}s;animation-delay:-${delay}s;"></span>`;
  }
  field.innerHTML = html;
}

// showCelebration usa SEMPRE o ranking mensal real (extMes/intMes,
// já calculados a partir das vendas do Supabase). Se os dados ainda
// não foram carregados, avisa em vez de simular um vencedor.
function showCelebration() {
  if (!_dadosCarregados) {
    showToast('Os dados ainda não foram carregados do Supabase. Tente novamente em instantes.', 'warning');
    return;
  }
  const d = processarDadosParaRender(_cache);
  const topExterno = d.extMes.length ? [...d.extMes].sort((a,b) => (b.vendas - a.vendas) || ((b.valor||0) - (a.valor||0)))[0] : null;
  const topInterno = d.intMes.length ? [...d.intMes].sort((a,b) => (b.vendas - a.vendas) || ((b.valor||0) - (a.valor||0)))[0] : null;

  const mesNome = d.mes && d.mes.mesNome ? (d.mes.mesNome.charAt(0).toUpperCase() + d.mes.mesNome.slice(1)) : CONFIG.mesReferencia;
  document.getElementById('celebrationSubtitle').innerHTML =
    '<span class="signal-bars"><span></span><span></span><span></span><span></span></span> Destaque do mês de ' + mesNome;

  const winners = [
    { entry: topInterno, role: 'Vendedor Interno' },
    { entry: topExterno, role: 'Vendedor Externo' },
  ].filter(w => w.entry);

  if (winners.length === 0) {
    document.getElementById('celebrationWinners').innerHTML = '<div class="sem-dados-msg">Sem vendas registradas neste mês ainda.</div>';
  } else {
    document.getElementById('celebrationWinners').innerHTML = winners.map(w => {
      const pessoa = PESSOAS[w.entry.slug] || {};
      return `
      <div class="celebration-card">
        <div class="celebration-photo-wrap">
          <span class="celebration-crown" aria-hidden="true">👑</span>
          <img class="celebration-photo" src="${pessoa.foto || ''}" alt="${pessoa.nome || w.entry.nome || ''}">
        </div>
        <span class="celebration-role">${w.role}</span>
        <span class="celebration-name">${pessoa.nome || w.entry.nome || ''}</span>
        <span class="celebration-value" data-target="${w.entry.vendas}">0 vendas</span>
      </div>`;
    }).join('');
  }

  buildConfetti();
  document.body.style.overflow = 'hidden';
  document.getElementById('celebrationOverlay').classList.add('active');

  document.querySelectorAll('.celebration-value').forEach(el => {
    animateNumber(el, Number(el.dataset.target), { duration: 1000, suffixFn: formatVendas });
  });
}

function hideCelebration() {
  document.getElementById('celebrationOverlay').classList.remove('active');
  document.body.style.overflow = '';
  document.getElementById('confettiField').innerHTML = '';
}

document.getElementById('celebrateBtn').addEventListener('click', showCelebration);
document.getElementById('celebrationClose').addEventListener('click', hideCelebration);
document.getElementById('celebrationOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'celebrationOverlay') hideCelebration();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCelebration();
});

document.documentElement.setAttribute('data-active-tab', 'semanal');

// ================================================================
// ÁREA ADMINISTRATIVA — JavaScript
// Tudo prefixado com adm_ para não conflitar com o ranking público
// ================================================================
