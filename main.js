// ═══════════════════════════════════════════════════════════════
// MAIN.JS — inicialização (carregado por ÚLTIMO)
// Único arquivo que executa código imediatamente ao carregar (fora
// de uma função): registra os listeners globais e, por fim, chama
// carregarDados(). Por isso TEM que ser o último <script> do body —
// todos os outros arquivos precisam já estar carregados antes.
// ═══════════════════════════════════════════════════════════════

// ── Fecha/abre a tela de celebração + define a aba padrão ────────
document.getElementById('celebrateBtn').addEventListener('click', showCelebration);
document.getElementById('celebrationClose').addEventListener('click', hideCelebration);
document.getElementById('celebrationOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'celebrationOverlay') hideCelebration();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideCelebration();
});

document.documentElement.setAttribute('data-active-tab', 'semanal');

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
    adm_showPanel();
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
