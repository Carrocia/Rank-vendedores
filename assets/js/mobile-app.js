(() => {
  const publicNav = document.getElementById('mobilePublicNav');
  const moreMenu = document.getElementById('mobilePublicMore');
  const moreButton = publicNav?.querySelector('[data-mobile-public="mais"]');

  const closePublicMore = () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute('aria-expanded', 'false');
  };

  const scrollPublicTo = targetId => {
    const target = document.getElementById(targetId);
    if (!target) return;
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  publicNav?.querySelectorAll('[data-mobile-public]').forEach(button => {
    button.addEventListener('click', () => {
      const destination = button.dataset.mobilePublic;
      if (destination === 'mais') {
        const abrir = moreMenu?.hidden !== false;
        if (moreMenu) moreMenu.hidden = !abrir;
        button.setAttribute('aria-expanded', String(abrir));
        publicNav.querySelectorAll('[data-mobile-public]').forEach(item => item.removeAttribute('aria-current'));
        if (abrir) button.setAttribute('aria-current', 'page');
        return;
      }

      closePublicMore();
      publicNav.querySelectorAll('[data-mobile-public]').forEach(item => item.removeAttribute('aria-current'));
      button.setAttribute('aria-current', 'page');
      if (destination === 'inicio') window.scrollTo({ top: 0, behavior: 'smooth' });
      if (destination === 'ranking') scrollPublicTo('publicRankingStart');
      if (destination === 'destaques') scrollPublicTo('publicHighlights');
    });
  });

  moreMenu?.querySelector('[data-mobile-close]')?.addEventListener('click', closePublicMore);
  moreMenu?.querySelectorAll('[data-mobile-scroll]').forEach(button => {
    button.addEventListener('click', () => {
      closePublicMore();
      scrollPublicTo(button.dataset.mobileScroll);
    });
  });

  document.getElementById('mobileAdminLogin')?.addEventListener('click', () => {
    closePublicMore();
    document.getElementById('adm-trigger')?.click();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePublicMore();
  });

  const adminPanel = document.getElementById('adm-panel');
  const adminDock = adminPanel?.querySelector('.adm-mobile-dock');
  const adminMenuButton = adminDock?.querySelector('[data-adm-mobile-menu]');

  const syncAdminDock = () => {
    const section = document.querySelector('.adm-nav-item.active')?.dataset.section || 'dashboard';
    const destinations = ['dashboard', 'ranking-adm', 'nova-venda', 'adicionais'];
    adminDock?.querySelectorAll('[data-adm-mobile-section]').forEach(button => {
      if (button.dataset.admMobileSection === section) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (!destinations.includes(section)) adminMenuButton?.setAttribute('aria-current', 'page');
    else adminMenuButton?.removeAttribute('aria-current');
    adminMenuButton?.setAttribute('aria-expanded', String(adminPanel?.classList.contains('adm-mobile-menu-open')));
  };

  adminDock?.querySelectorAll('[data-adm-mobile-section]').forEach(button => {
    button.addEventListener('click', () => {
      window.adm_navigateTo?.(button.dataset.admMobileSection);
      syncAdminDock();
    });
  });

  adminMenuButton?.addEventListener('click', () => {
    const abrir = !adminPanel.classList.contains('adm-mobile-menu-open');
    adminPanel.classList.toggle('adm-mobile-menu-open', abrir);
    syncAdminDock();
  });

  adminPanel?.querySelector('[data-adm-mobile-close]')?.addEventListener('click', () => {
    adminPanel.classList.remove('adm-mobile-menu-open');
    syncAdminDock();
  });

  adminPanel?.querySelector('.adm-sidebar')?.addEventListener('click', event => {
    if (!event.target.closest('.adm-nav-item')) return;
    adminPanel.classList.remove('adm-mobile-menu-open');
    window.setTimeout(syncAdminDock, 0);
  });

  document.addEventListener('adm:sectionchange', syncAdminDock);
  syncAdminDock();
})();
