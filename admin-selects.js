// ═══════════════════════════════════════════════════════════════
// ADMIN-SELECTS.JS — formulários do ADM + dropdown customizado
// Popula os <select> dos formulários (vendedor, plano, adicional,
// filial) com os dados reais vindos do Supabase, e implementa o
// dropdown visual customizado usado no campo "Plano".
// ═══════════════════════════════════════════════════════════════

// ── Popular selects do formulário ADM com dados do banco ─────────
function popularSelectVendedores(vendedores) {
  const selects = ['venda-vendedor', 'adic-vendedor'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const val = el.value;
    el.innerHTML = '<option value="">Selecione o vendedor</option>' +
      vendedores.map(v => `<option value="${v.id}" data-slug="${v.slug || ''}">${v.nome} (${v.tipo === 'interno' ? 'Interno' : 'Externo'})</option>`).join('');
    if (val) el.value = val;
  });
}

function popularSelectPlanos(planos) {
  const grupos = {};
  planos.forEach(p => {
    const grupo = p.nome.replace(/\s\d+mb.*/i, '').trim();
    if (!grupos[grupo]) grupos[grupo] = [];
    grupos[grupo].push(p);
  });
  const html = '<option value="">Selecione o plano</option>' +
    Object.entries(grupos).map(([g, ps]) =>
      `<optgroup label="${g}">${ps.map(p =>
        `<option value="${p.id}|${p.valor}">${p.nome} ${p.velocidade_mb} Mbps — R$ ${Number(p.valor).toFixed(2).replace('.',',')}</option>`
      ).join('')}</optgroup>`
    ).join('');
  ['venda-plano','filial-plano'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = html;
    // espelha exatamente os mesmos planos/preços no dropdown visual
    // customizado (mesmo "grupos" usado acima, nenhum dado novo)
    buildCustomSelectPanel(id, grupos);
  });
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
    <div class="custom-select-group-label">${g}</div>
    ${ps.map(p => {
      const value = `${p.id}|${p.valor}`;
      const label = `${p.nome} ${p.velocidade_mb} Mbps`;
      const priceLabel = 'R$ ' + Number(p.valor).toFixed(2).replace('.', ',');
      return `<div class="custom-select-option" data-value="${value}" data-label="${label} — ${priceLabel}">
        <span>${label}</span><span class="csopt-price">${priceLabel}</span>
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
    return;
  }
  document.querySelectorAll('.custom-select.open').forEach(wrap => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.querySelectorAll('.custom-select.open').forEach(w => w.classList.remove('open'));
});

function popularSelectFiliais(filiais) {
  const el = document.getElementById('filial-origem');
  if (!el) return;
  el.innerHTML = '<option value="">Selecione a filial</option>' +
    filiais.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
}

