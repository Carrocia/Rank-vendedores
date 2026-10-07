
// Tema: usa a escolha salva; se nunca escolheu, segue o tema do aparelho.
// (Troque 'light' por 'dark' no 2º ramo para voltar a abrir sempre escuro.)
(function () {
  var t = null;
  try { t = localStorage.getItem('uni-theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  // Modo TV (?tv=1): sempre escuro (não grava a escolha), a menos que ?theme=light
  try {
    var P = new URLSearchParams(location.search);
    if (P.get('tv') === '1' || P.get('tv') === 'true') {
      document.documentElement.setAttribute('data-tv', '');
      if (P.get('theme') !== 'light') t = 'dark';
    }
  } catch (e) {}
  document.documentElement.setAttribute('data-theme', t);
})();

// ================================================================
// TEMAS SAZONAIS — só trocam cores e decoração; dados e layout não mudam.
// Cada tema tem a paleta do modo ESCURO (d) e do CLARO (l), já com contraste
// de acessibilidade verificado. Para criar um tema novo: copie uma linha.
// Ordem de prioridade: ?tema=... na URL  >  escolha salva no ADM  >  data.
// ================================================================
(function () {
  var TEMAS = {
    'outubro-rosa': { nome: 'Outubro Rosa', icone: '🎗️', periodo: 'Outubro', fx: '🎗️', d: ['#ff6fb1', '#c77dff'], l: ['#be185d', '#7b2cbf'] },
    'novembro-azul': { nome: 'Novembro Azul', icone: '💙', periodo: 'Novembro', fx: '💙', d: ['#4cc9f0', '#6f86ff'], l: ['#0369a1', '#3a47c9'] },
    'black-friday': { nome: 'Black Friday', icone: '🏷️', periodo: 'Semana da Black Friday', fx: '🏷️', d: ['#ffb703', '#ff5a1f'], l: ['#975c07', '#bd3f0c'] },
    'natal': { nome: 'Natal', icone: '🎄', periodo: '01 a 25/12', fx: '❄️', d: ['#ff7478', '#2fd18b'], l: ['#c2261b', '#0f7a4a'] },
    'ano-novo': { nome: 'Feliz Ano Novo', icone: '🎆', periodo: '26/12 a 10/01', fx: '✨', d: ['#ffd166', '#ff9f1c'], l: ['#905f18', '#bc3f0d'] },
    'carnaval': { nome: 'Carnaval', icone: '🎭', periodo: 'Fevereiro', fx: '🎊', d: ['#ff68c8', '#ffd23f'], l: ['#c2187f', '#975c07'] },
    'mulher': { nome: 'Dia da Mulher', icone: '💜', periodo: 'Março', fx: '🌸', d: ['#c982ff', '#ff6fb5'], l: ['#7b2cbf', '#c2185b'] },
    'pascoa': { nome: 'Páscoa', icone: '🐰', periodo: 'Abril', fx: '🐣', d: ['#ffb347', '#b794f6'], l: ['#aa4f09', '#6d4de6'] },
    'maes': { nome: 'Dia das Mães', icone: '🌷', periodo: 'Maio', fx: '🌷', d: ['#ff8fab', '#ffb08a'], l: ['#be185d', '#bd3f0c'] },
    'namorados': { nome: 'Dia dos Namorados', icone: '💖', periodo: '01 a 12/06', fx: '💖', d: ['#ff768e', '#ff8fa3'], l: ['#c9184a', '#be185d'] },
    'junina': { nome: 'Festa Junina', icone: '🌽', periodo: '13 a 30/06', fx: '🎈', d: ['#ffa62b', '#ff5d4a'], l: ['#aa4f09', '#c2261b'] },
    'pais': { nome: 'Dia dos Pais', icone: '👔', periodo: 'Agosto', fx: '⭐', d: ['#4dabf7', '#6c8cff'], l: ['#0b68c6', '#1d4ed8'] },
    'setembro-amarelo': { nome: 'Setembro Amarelo', icone: '💛', periodo: 'Setembro', fx: '💛', d: ['#ffd43b', '#ffa94d'], l: ['#975c07', '#bd3f0c'] }
  };
  window.UNI_TEMAS = TEMAS;

  function rgb(h) { h = h.replace('#', ''); return parseInt(h.substr(0, 2), 16) + ', ' + parseInt(h.substr(2, 2), 16) + ', ' + parseInt(h.substr(4, 2), 16); }
  function vars(c) { return '--accent:' + c[0] + ';--accent2:' + c[1] + ';--accent-rgb:' + rgb(c[0]) + ';--accent2-rgb:' + rgb(c[1]) + ';'; }
  var css = '';
  Object.keys(TEMAS).forEach(function (id) {
    css += 'html[data-season="' + id + '"]{' + vars(TEMAS[id].d) + '}';
    css += 'html[data-theme="light"][data-season="' + id + '"]{' + vars(TEMAS[id].l) + '}';
  });
  var st = document.createElement('style'); st.id = 'season-css'; st.textContent = css; document.head.appendChild(st);

  // Black Friday = 1ª sexta após a 4ª quinta de novembro
  function blackFriday(ano) {
    var primeira = 1 + ((4 - new Date(ano, 10, 1).getDay() + 7) % 7);
    return new Date(ano, 10, primeira + 21 + 1);
  }
  window.uniTemaAutomatico = function (d) {
    d = d || new Date();
    var m = d.getMonth() + 1, dia = d.getDate();
    if ((m === 12 && dia >= 26) || (m === 1 && dia <= 10)) return 'ano-novo';
    if (m === 12) return 'natal';
    if (m === 2) return 'carnaval';
    if (m === 3) return 'mulher';
    if (m === 4) return 'pascoa';
    if (m === 5) return 'maes';
    if (m === 6) return dia <= 12 ? 'namorados' : 'junina';
    if (m === 8) return 'pais';
    if (m === 9) return 'setembro-amarelo';
    if (m === 10) return 'outubro-rosa';
    if (m === 11) {
      var bf = blackFriday(d.getFullYear()), dia0 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var ini = new Date(bf.getTime() - 7 * 864e5), fim = new Date(bf.getTime() + 3 * 864e5);
      return (dia0 >= ini && dia0 <= fim) ? 'black-friday' : 'novembro-azul';
    }
    return 'padrao'; // 11–31/01 e julho
  };

  var estado = { id: 'padrao', fx: true };
  function decorar() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', decorar, { once: true }); return; }
    var t = TEMAS[estado.id];
    var badge = document.getElementById('seasonBadge');
    if (badge) { if (t) { badge.textContent = t.icone + ' ' + t.nome; badge.hidden = false; } else { badge.hidden = true; } }
    var host = document.querySelector('.bg-fx');
    if (!host) return;
    var velho = host.querySelector('.season-fx'); if (velho) velho.remove();
    var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!t || !estado.fx || reduz) return;
    var box = document.createElement('div'); box.className = 'season-fx'; box.setAttribute('aria-hidden', 'true');
    var qtd = window.innerWidth < 640 ? 9 : 16;
    for (var i = 0; i < qtd; i++) {
      var sp = document.createElement('span');
      sp.textContent = t.fx;
      sp.style.left = (Math.random() * 96).toFixed(1) + '%';
      sp.style.fontSize = (14 + Math.random() * 14).toFixed(0) + 'px';
      sp.style.animationDuration = (16 + Math.random() * 16).toFixed(1) + 's';
      sp.style.animationDelay = (-Math.random() * 30).toFixed(1) + 's';
      sp.style.setProperty('--sway', ((Math.random() * 80) - 40).toFixed(0) + 'px');
      box.appendChild(sp);
    }
    host.appendChild(box);
  }
  window.uniAplicarTema = function (id, fx) {
    if (!TEMAS[id]) id = 'padrao';
    var html = document.documentElement;
    if (id === 'padrao') html.removeAttribute('data-season'); else html.setAttribute('data-season', id);
    estado = { id: id, fx: fx !== false };
    decorar();
  };

  // 1) data  2) (depois do carregamento) escolha salva no ADM  3) ?tema= na URL
  var q = null, fxUrl = true;
  try { var sp = new URLSearchParams(location.search); q = sp.get('tema'); fxUrl = sp.get('fx') !== '0'; } catch (e) {}
  if (q && (TEMAS[q] || q === 'padrao')) { window.__uniTemaFixo = true; window.uniAplicarTema(q, fxUrl); }
  else { window.uniAplicarTema(window.uniTemaAutomatico(new Date()), fxUrl); }
})();
