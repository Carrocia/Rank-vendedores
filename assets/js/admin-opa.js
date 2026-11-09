(() => {
  const $ = (selector, root = document) => root.querySelector(selector);
  const safe = value => typeof escapar === 'function'
    ? escapar(value)
    : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const monthNow = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };
  const readMonth = () => {
    const value = $('#opa-admin-month')?.value || monthNow();
    const [year, month] = value.split('-').map(Number);
    return { year, month };
  };
  const isInternalSeller = seller => String(seller?.tipo || '').trim().toLocaleLowerCase('pt-BR') === 'interno';
  const setStatus = (message, isError = false) => {
    const status = $('#opa-admin-status');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('is-error', isError);
  };

  async function loadMonth() {
    const body = $('#opa-admin-rows');
    if (!body) return;
    if (!window._supabase || !window.ADMIN_AUTENTICADO) {
      setStatus('Entre como administrador da filial para editar os resultados.', true);
      body.innerHTML = '<tr><td colspan="5" class="adm-inline-status">Acesso administrativo necessário.</td></tr>';
      return;
    }
    const sellers = (_cache.vendedores || []).filter(v => v.ativo !== false && isInternalSeller(v));
    if (!sellers.length) {
      body.innerHTML = '<tr><td colspan="5" class="adm-inline-status">Não há vendedores internos ativos nesta filial.</td></tr>';
      setStatus('Nenhum vendedor interno ativo nesta filial.');
      return;
    }
    const { year, month } = readMonth();
    setStatus('Carregando lançamentos…');
    body.innerHTML = '<tr><td colspan="5" class="adm-inline-status">Carregando equipe e resultados…</td></tr>';
    const { data, error } = await window._supabase.from('opa_resultados_mensais')
      .select('vendedor_id, iniciados, encerrados, transferidos')
      .eq('filial_id', Number(window.FILIAL_ATUAL_ID)).eq('mes', month).eq('ano', year);
    if (error) {
      console.error('[admin-opa] loadMonth', error);
      body.innerHTML = '<tr><td colspan="5" class="adm-inline-status">Não foi possível carregar. Confirme se supabase/atendimentos-opa.sql foi executado.</td></tr>';
      setStatus('Falha ao carregar dados do Opa.', true);
      return;
    }
    const bySeller = new Map((data || []).map(row => [String(row.vendedor_id), row]));
    body.innerHTML = sellers.map(seller => {
      const row = bySeller.get(String(seller.id)) || {};
      return `<tr data-opa-row="${Number(seller.id)}"><td><strong>${safe(seller.nome)}</strong></td><td><input type="number" min="0" step="1" inputmode="numeric" data-opa-count="iniciados" value="${Number(row.iniciados || 0)}" aria-label="Atendimentos iniciados de ${safe(seller.nome)}"></td><td><input type="number" min="0" step="1" inputmode="numeric" data-opa-count="encerrados" value="${Number(row.encerrados || 0)}" aria-label="Atendimentos encerrados de ${safe(seller.nome)}"></td><td><input type="number" min="0" step="1" inputmode="numeric" data-opa-count="transferidos" value="${Number(row.transferidos || 0)}" aria-label="Atendimentos transferidos de ${safe(seller.nome)}"></td><td><strong data-opa-total>${Number(row.encerrados || 0) + Number(row.transferidos || 0)}</strong></td></tr>`;
    }).join('');
    body.querySelectorAll('[data-opa-count]').forEach(input => input.addEventListener('input', () => {
      const row = input.closest('[data-opa-row]');
      const closed = Number($('[data-opa-count="encerrados"]', row)?.value || 0);
      const transferred = Number($('[data-opa-count="transferidos"]', row)?.value || 0);
      $('[data-opa-total]', row).textContent = String(closed + transferred);
    }));
    setStatus(`${sellers.length} vendedores internos carregados.`);
  }

  async function saveMonth() {
    const button = $('#opa-admin-save');
    const body = $('#opa-admin-rows');
    if (!button || !body || !window._supabase || !window.ADMIN_AUTENTICADO) return;
    const { year, month } = readMonth();
    const filialId = Number(window.FILIAL_ATUAL_ID);
    const rows = [...body.querySelectorAll('[data-opa-row]')].map(row => ({
      filial_id: filialId,
      vendedor_id: Number(row.dataset.opaRow),
      mes: month,
      ano: year,
      iniciados: Number($('[data-opa-count="iniciados"]', row)?.value || 0),
      encerrados: Number($('[data-opa-count="encerrados"]', row)?.value || 0),
      transferidos: Number($('[data-opa-count="transferidos"]', row)?.value || 0),
    }));
    if (!rows.length || rows.some(row => ![row.iniciados, row.encerrados, row.transferidos].every(value => Number.isInteger(value) && value >= 0))) {
      setStatus('Use apenas números inteiros iguais ou maiores que zero.', true);
      return;
    }
    button.disabled = true;
    setStatus('Salvando resultados…');
    try {
      const { error } = await window._supabase.from('opa_resultados_mensais')
        .upsert(rows, { onConflict: 'filial_id,vendedor_id,mes,ano' });
      if (error) throw error;
      setStatus(`Resultados de ${String(month).padStart(2, '0')}/${year} salvos.`);
      if (typeof showToast === 'function') showToast('Resultados do Opa salvos.', 'success');
      if (typeof carregarDados === 'function') await carregarDados();
      await loadMonth();
    } catch (error) {
      console.error('[admin-opa] saveMonth', error);
      setStatus(error.message || 'Não foi possível salvar os resultados.', true);
      if (typeof showToast === 'function') showToast('Falha ao salvar os resultados do Opa.', 'error');
    } finally {
      button.disabled = false;
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const monthInput = $('#opa-admin-month');
    if (!monthInput) return;
    monthInput.value = monthNow();
    monthInput.addEventListener('change', loadMonth);
    $('#opa-admin-save')?.addEventListener('click', saveMonth);
    document.addEventListener('adm:sectionchange', event => {
      if (event.detail?.sectionId === 'opa') loadMonth();
    });
  });
})();
