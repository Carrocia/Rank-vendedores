(() => {
  const publicNav = document.getElementById('mobilePublicNav');
  const moreMenu = document.getElementById('mobilePublicMore');
  const moreButton = publicNav?.querySelector('[data-mobile-public="mais"]');
  const tvEntry = document.querySelector('.tabs-row .tv-enter-btn');
  const tvEntryParent = tvEntry?.parentNode;
  const tvEntryNextSibling = tvEntry?.nextSibling;
  const mobileViewport = window.matchMedia('(max-width: 640px)');

  const syncTvEntryLocation = () => {
    if (!tvEntry || !moreMenu || !tvEntryParent) return;
    if (mobileViewport.matches) {
      tvEntry.classList.add('mobile-public-tv-entry');
      moreMenu.appendChild(tvEntry);
    } else if (tvEntry.parentNode !== tvEntryParent) {
      tvEntryParent.insertBefore(tvEntry, tvEntryNextSibling?.parentNode === tvEntryParent ? tvEntryNextSibling : null);
      tvEntry.classList.remove('mobile-public-tv-entry');
    }
  };

  syncTvEntryLocation();
  mobileViewport.addEventListener('change', syncTvEntryLocation);

  const closePublicMore = () => {
    if (moreMenu) moreMenu.hidden = true;
    moreButton?.setAttribute('aria-expanded', 'false');
  };

  const scrollPublicTo = targetOrId => {
    const target = typeof targetOrId === 'string' ? document.getElementById(targetOrId) : targetOrId;
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
      if (destination === 'ranking') scrollPublicTo(document.querySelector('.ranking-panel:not(.hidden)'));
      if (destination === 'meta') scrollPublicTo('metaCardSection');
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
    const destinations = ['dashboard', 'ranking-adm', 'nova-venda', 'relatorios'];
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
      const sectionId = button.dataset.admMobileSection;
      const sectionButton = adminPanel?.querySelector(`.adm-nav-item[data-section="${sectionId}"]`);
      sectionButton?.click();
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
