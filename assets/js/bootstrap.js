
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

// Evita que a paleta antiga se misture visualmente com a nova durante a troca.
// As animações decorativas continuam ativas; apenas transições CSS são pausadas.
(function () {
  var revisaoTroca = 0;
  window.uniTrocarTemaInstantaneo = function (aplicar) {
    var html = document.documentElement;
    var revisao = ++revisaoTroca;
    html.classList.add('theme-switch-instant');
    aplicar();
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (revisao === revisaoTroca) html.classList.remove('theme-switch-instant');
      });
    });
  };
})();

// ================================================================
// TEMAS SAZONAIS — só trocam cores e decoração; dados e layout não mudam.
// Cada tema tem a paleta do modo ESCURO (d) e do CLARO (l), já com contraste
// de acessibilidade verificado. Para criar um tema novo: copie uma linha.
// Ordem de prioridade: ?tema=... na URL  >  escolha salva no ADM  >  data.
// ================================================================
(function () {
  function pal(bg, surface, solid, hover, accent, accent2, gold, accentText) {
    var rgbAccent = accent.replace('#','');
    var brilho = (parseInt(rgbAccent.substr(0,2),16)*299 + parseInt(rgbAccent.substr(2,2),16)*587 + parseInt(rgbAccent.substr(4,2),16)*114) / 1000;
    return { bg:bg, surface:surface, solid:solid, hover:hover, accent:accent, accent2:accent2, gold:gold, accentText:accentText || (brilho > 158 ? '#20271f' : '#fffaf0') };
  }
  var TEMAS = {
    'outubro-rosa': { nome:'Outubro Rosa', icone:'🎗️', periodo:'Outubro', fx:'✿', d:pal('#170f18','rgba(49,27,45,.88)','#291c28','#382438','#df6b9d','#a783c4','#f0cb82'), l:pal('#fff5f8','rgba(255,255,255,.9)','#fff','#fce8ef','#ad416f','#704a91','#9b6c27','#fffaf0') },
    'novembro-azul': { nome:'Novembro Azul', icone:'💙', periodo:'Novembro', fx:'💙', d:pal('#0b1420','rgba(19,39,58,.88)','#14273a','#1b354d','#69c7e8','#8197ef','#d3c58b'), l:pal('#f1f8fc','rgba(255,255,255,.9)','#fff','#e6f2f8','#287b9f','#586ab4','#8c6c2d','#fff') },
    'black-friday': { nome:'Black Friday', icone:'🏷️', periodo:'Semana da Black Friday', fx:'🏷️', d:pal('#151310','rgba(42,35,24,.88)','#262119','#373023','#f2bd55','#d87847','#ffe2a0','#21170a'), l:pal('#fbf7ed','rgba(255,255,255,.9)','#fff','#f4ead4','#99651c','#a54e27','#785018','#fffaf0') },
    'natal': { nome:'Natal', icone:'🎄', periodo:'01 a 25/12', fx:'❄️', d:pal('#0c1512','rgba(22,39,31,.9)','#17271f','#20392d','#c85d55','#51876a','#e4c681','#fffaf0'), l:pal('#f7f4e9','rgba(255,255,255,.92)','#fff','#ede9d9','#a33e3e','#35694e','#987334','#fffaf0') },
    'ano-novo': { nome:'Feliz Ano Novo', icone:'🎆', periodo:'26/12 a 10/01', fx:'✨', d:pal('#10131d','rgba(29,35,54,.9)','#20273b','#2b3650','#86b5ed','#b99ae2','#f0d18e'), l:pal('#f3f5fb','rgba(255,255,255,.92)','#fff','#e9edf8','#426caa','#765da4','#94723a','#fffaf0') },
    'carnaval': { nome:'Carnaval', icone:'🎭', periodo:'Fevereiro', fx:'🎊', d:pal('#19101f','rgba(49,27,61,.9)','#30203b','#43264f','#ed78c7','#9c83e9','#f5cf68'), l:pal('#fcf4fb','rgba(255,255,255,.92)','#fff','#f5e7f3','#a83b8b','#6350a5','#96702a','#fffaf0') },
    'mulher': { nome:'Dia da Mulher', icone:'💜', periodo:'Março', fx:'🌸', d:pal('#191321','rgba(48,34,62,.9)','#30243d','#41304f','#c59aef','#e58dbb','#e8c6dc'), l:pal('#f8f3fb','rgba(255,255,255,.92)','#fff','#eee5f4','#8057a0','#a24f78','#987452','#fffaf0') },
    'pascoa': { nome:'Páscoa', icone:'🐰', periodo:'Abril', fx:'🐣', d:pal('#17141f','rgba(48,40,62,.9)','#30283c','#433653','#d9a9e8','#97c8b1','#efd18b'), l:pal('#faf5f8','rgba(255,255,255,.92)','#fff','#f2e8f0','#895a91','#497a63','#9c7733','#fffaf0') },
    'maes': { nome:'Dia das Mães', icone:'🌷', periodo:'Maio', fx:'🌷', d:pal('#1d1219','rgba(55,34,47,.9)','#35232e','#49303d','#e58da5','#d6a485','#f0d2a7'), l:pal('#fff5f3','rgba(255,255,255,.92)','#fff','#f9e8e4','#a84d69','#9a684c','#9d743c','#fffaf0') },
    'namorados': { nome:'Dia dos Namorados', icone:'💖', periodo:'01 a 12/06', fx:'💖', d:pal('#1c1118','rgba(57,31,43,.9)','#36212d','#4b2b3b','#ee8297','#c978a2','#edc894'), l:pal('#fff4f5','rgba(255,255,255,.92)','#fff','#f9e4e8','#b3445b','#954e75','#a17a50','#fffaf0') },
    'junina': { nome:'Festa Junina', icone:'🌽', periodo:'13 a 30/06', fx:'🎈', d:pal('#1c1510','rgba(53,38,25,.9)','#382a1d','#4b3825','#f0b84f','#d87656','#f5d78d','#281b0b'), l:pal('#fbf4e7','rgba(255,255,255,.92)','#fff','#f3e8d3','#9c651c','#a94d32','#8b672c','#fffaf0') },
    'pais': { nome:'Dia dos Pais', icone:'👔', periodo:'Agosto', fx:'⭐', d:pal('#101720','rgba(27,43,58,.9)','#202e3d','#2b4052','#85b8da','#a5a3d6','#d8be8b'), l:pal('#f2f7fa','rgba(255,255,255,.92)','#fff','#e5eff4','#397596','#6d6798','#927445','#fffaf0') },
    'setembro-amarelo': { nome:'Setembro Amarelo', icone:'💛', periodo:'Setembro', fx:'💛', d:pal('#1b1710','rgba(53,43,24,.9)','#382e1d','#4d3e24','#efc65a','#d9904b','#ffe39b','#281d08'), l:pal('#fcf8ea','rgba(255,255,255,.92)','#fff','#f5efd9','#94701f','#a35e2c','#866329','#fffaf0') }
  };
  window.UNI_TEMAS = TEMAS;

  function rgb(h) { h = h.replace('#', ''); return parseInt(h.substr(0, 2), 16) + ', ' + parseInt(h.substr(2, 2), 16) + ', ' + parseInt(h.substr(4, 2), 16); }
  function vars(c, light) {
    var accentRgb = rgb(c.accent), a = light ? 0.12 : 0.22;
    return '--bg:'+c.bg+';--surface:'+c.surface+';--surface-solid:'+c.solid+';--surface-hover:'+c.hover+
      ';--border:rgba('+rgb(c.accent2)+','+(light?'.2':'.23')+');--text:'+(light?'#344039':'#e9eee7')+
      ';--text-muted:'+(light?'#68756d':'#a4afa7')+';--heading-color:'+(light?'#243129':'#fff9eb')+
      ';--accent:'+c.accent+';--accent2:'+c.accent2+';--accent-rgb:'+accentRgb+';--accent2-rgb:'+rgb(c.accent2)+
      ';--accent-glow:rgba('+accentRgb+','+a+');--gold:'+c.gold+';--accent-text:'+c.accentText+
      ';--danger:'+(light?'#b43e49':'#ec7479')+';--green:'+(light?'#28744d':'#62b582')+
      ';--shadow-hover:'+(light?'rgba(42,35,24,.14)':'rgba(0,0,0,.4)')+';';
  }
  var css = '';
  Object.keys(TEMAS).forEach(function (id) {
    css += 'html[data-season="' + id + '"]{' + vars(TEMAS[id].d, false) + '}';
    css += 'html[data-theme="light"][data-season="' + id + '"]{' + vars(TEMAS[id].l, true) + '}';
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
  var temaSalvoInicial = null;
  var fxSalvoInicial = true;
  try {
    temaSalvoInicial = localStorage.getItem('uni-tema-sazonal');
    fxSalvoInicial = localStorage.getItem('uni-tema-particulas') !== '0';
  } catch (_) {}
  var natalTimer = null;
  function limparNatal() {
    if (natalTimer) { window.clearTimeout(natalTimer); natalTimer = null; }
    document.querySelectorAll('.natal-decor, .natal-treno, .natal-gorro, .natal-enfeites, .natal-guirlanda').forEach(function (el) { el.remove(); });
  }
  function imagemNatal(src, classe, alt) {
    var img = document.createElement('img');
    img.src = 'assets/images/natal/' + src;
    img.className = classe;
    img.alt = alt || '';
    img.setAttribute('aria-hidden', 'true');
    img.draggable = false;
    img.decoding = 'async';
    return img;
  }
  function agendarTreno() {
    if (estado.id !== 'natal' || !estado.fx || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    natalTimer = window.setTimeout(function () {
      if (estado.id !== 'natal' || !estado.fx) return;
      var treno = imagemNatal('treno.gif', 'natal-treno');
      document.body.appendChild(treno);
      treno.addEventListener('animationend', function () { treno.remove(); agendarTreno(); }, { once: true });
    }, 56000 + Math.random() * 26000);
  }
  function decorar() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', decorar, { once: true }); return; }
    var t = TEMAS[estado.id];
    var badge = document.getElementById('seasonBadge');
    if (badge) { if (t) { badge.textContent = t.icone + ' ' + t.nome; badge.hidden = false; } else { badge.hidden = true; } }
    var host = document.querySelector('.bg-fx');
    if (!host) return;
    limparNatal();
    var velho = host.querySelector('.season-fx'); if (velho) velho.remove();
    var reduz = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!t || !estado.fx || reduz) return;
    if (estado.id === 'natal') {
      var decor = document.createElement('div');
      decor.className = 'natal-decor';
      decor.setAttribute('aria-hidden', 'true');
      var neve = document.createElement('div');
      neve.className = 'natal-neve';
      neve.setAttribute('aria-hidden', 'true');
      decor.appendChild(neve);
      decor.appendChild(imagemNatal('arvore.png', 'natal-arvore'));
      decor.appendChild(imagemNatal('presente.png', 'natal-presente'));
      document.body.appendChild(decor);
      var logo = document.querySelector('.header-logo');
      if (logo) logo.appendChild(imagemNatal('gorro.png', 'natal-gorro'));
      var painel = document.querySelector('.hero-panel');
      if (painel) {
        var guirlanda = document.createElement('div');
        guirlanda.className = 'natal-guirlanda';
        guirlanda.setAttribute('aria-hidden', 'true');
        for (var luz = 0; luz < 7; luz++) {
          var lampada = document.createElement('span');
          lampada.style.left = (12 + luz * 11) + '%';
          lampada.style.top = (10 + Math.sin(luz / 6 * Math.PI) * 16) + 'px';
          guirlanda.appendChild(lampada);
        }
        painel.appendChild(guirlanda);
      }
      agendarTreno();
    }
    var box = document.createElement('div'); box.className = 'season-fx'; box.setAttribute('aria-hidden', 'true');
    var qtd = estado.id === 'natal' ? (window.innerWidth < 640 ? 5 : 10) : (window.innerWidth < 640 ? 6 : 10);
    for (var i = 0; i < qtd; i++) {
      var sp = document.createElement('span');
      sp.textContent = estado.id === 'natal' ? (i % 4 === 0 ? '✦' : '❄') : t.fx;
      sp.style.left = (Math.random() * 96).toFixed(1) + '%';
      sp.style.fontSize = (estado.id === 'natal' ? 9 + Math.random() * 10 : 14 + Math.random() * 14).toFixed(0) + 'px';
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
    window.uniTrocarTemaInstantaneo(function () {
      if (id === 'padrao') html.removeAttribute('data-season'); else html.setAttribute('data-season', id);
      estado = { id: id, fx: fx !== false };
      decorar();
    });
  };

  // Mantém o tema base até carregar a configuração do ADM no Supabase.
  // Isso evita um flash do tema sazonal do calendário antes do tema salvo.
  var q = null, fxUrl = true;
  try { var sp = new URLSearchParams(location.search); q = sp.get('tema'); fxUrl = sp.get('fx') !== '0'; } catch (e) {}
  if (q && (TEMAS[q] || q === 'padrao')) {
    window.__uniTemaFixo = true;
    window.uniAplicarTema(q, fxUrl);
  } else {
    var temaInicial = temaSalvoInicial === 'auto' ? window.uniTemaAutomatico(new Date()) : temaSalvoInicial;
    if (!TEMAS[temaInicial] && temaInicial !== 'padrao') {
      temaInicial = 'padrao';
      document.documentElement.classList.add('theme-bootstrap-pending');
    }
    window.uniAplicarTema(temaInicial, fxUrl && fxSalvoInicial);
  }
})();
