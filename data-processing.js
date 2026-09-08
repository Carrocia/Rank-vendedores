// ═══════════════════════════════════════════════════════════════
// DATA-PROCESSING.JS — regra de negócio pura, sem DOM/Supabase
// processarDadosParaRender(): pega o _cache cru e calcula tudo
// que a tela precisa (totais, rankings, evolução, metas batidas).
// Também os cálculos de período (semana/mês) e ranking/totais.
// É o arquivo mais importante quando a dúvida for "como uma
// venda X conta ou deixa de contar em algum lugar".
// ═══════════════════════════════════════════════════════════════

// ── Processar dados para renderização ────────────────────────────
function processarDadosParaRender(cache) {
  if (!cache) return null;
  const { vendasSemana, vendasMes, vendasFiliais, vendaMaisRecente,
          semana, mes, metasFilial, metas, vendedores, planos, vendasSemanaAnterior } = cache;

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
  const contarVendasPorVendedor = (vendas) => {
    const mapa = {};
    (vendas || []).forEach(v => {
      if (tipoPorVendedor[v.vendedor_id] === 'externo' && v.fora_filial === true) return;
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
        vendas: 0, valor: 0, meta: metaPorVendedor(v.id, v.tipo),
        evolucao: 0, // preenchido abaixo, após contar as vendas da semana atual
      };
    });
    vendas.forEach(v => {
      if (mapa[v.vendedor_id]) {
        // Venda externa "fora da filial" não conta para a meta
        // individual/semanal do vendedor externo (mas continua
        // existindo no banco normalmente — só não entra nesta contagem).
        if (mapa[v.vendedor_id].tipo === 'externo' && v.fora_filial === true) return;
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

  // Evolução semanal (vendas por dia da semana) — usa exclusivamente
  // as vendas reais da semana atual (vendasSemana), sem depender de metas.
  const diasLabels = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const diasContagem = new Array(7).fill(0);
  vendasSemana.forEach(v => {
    // "Evolução da Semana" é um indicador global da filial — vendas
    // fora da filial CONTAM aqui (só ficam de fora da meta GLOBAL
    // mensal, não da semana nem das metas semanais da filial).
    // data_venda pode vir como data pura ("2026-09-07") ou como
    // timestamp completo ("2026-09-07T14:32:00+00:00"). Extrair só
    // os 10 primeiros caracteres ("YYYY-MM-DD") evita concatenar
    // duas horas na mesma string (o que gerava Invalid Date e
    // fazia toda a contagem cair fora dos dias reais).
    const dataStr = String(v.data_venda).slice(0, 10);
    const d = new Date(dataStr + 'T12:00:00');
    const diaSemana = d.getDay(); // 0=Dom
    if (isNaN(diaSemana)) return; // data inválida — não conta, não quebra
    const idx = diaSemana === 0 ? 6 : diaSemana - 1;
    diasContagem[idx]++;
  });
  // Vendas de outras filiais PARA a nossa também representam vendas
  // reais da filial no dia — somam na evolução (pela quantidade de
  // cada registro), mas nunca entram em ranking, meta individual ou
  // evolução individual de vendedor (elas não pertencem a ninguém).
  (vendasFiliais || []).forEach(v => {
    const dataStr = String(v.data_venda || '').slice(0, 10);
    if (dataStr < semana.de || dataStr > semana.ate) return; // fora da semana atual
    const d = new Date(dataStr + 'T12:00:00');
    const diaSemana = d.getDay(); // 0=Dom
    if (isNaN(diaSemana)) return; // data inválida — não conta, não quebra
    const idx = diaSemana === 0 ? 6 : diaSemana - 1;
    diasContagem[idx] += Number(v.quantidade || 1);
  });
  const evolucaoSemana = diasLabels.map((dia, i) => ({ dia, vendas: diasContagem[i] }));

  // Vendas por plano (donut) — identifica cada plano por plano_id +
  // velocidade_mb (não só pelo nome, que se repete entre velocidades
  // diferentes). A velocidade vem de "planos" (já carregado em cache,
  // sem nova consulta ao Supabase), já que a view de vendas não a traz.
  const CORES_PLANOS = ['#21d9ff','#7c5cff','#ffc94d','#ff5f6e','#34d399','#f97316','#a78bfa','#fb7185'];
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
      const dataStr = String(v.data_venda || '').slice(0, 10);
      return dataStr >= semana.de && dataStr <= semana.ate;
    })
    .reduce((s, v) => s + Number(v.quantidade || 1), 0);
  // Diferente do total mensal, o total semanal (Meta da Semana, Metas
  // da Filial — Semana e Evolução da Semana) CONTA as vendas marcadas
  // como "fora da filial" — elas só ficam de fora da meta GLOBAL mensal.
  const totalSemana = vendasSemana.length + vendasOutrasFiliaisSemana;
  const metaGlobal = (metasFilial && metasFilial.mensal_m1) || null; // sem fallback fictício
  const pctMensal = metaGlobal ? Math.min(100, Math.round((totalMes / metaGlobal) * 100)) : 0;
  const rankingMes = calcularRanking(vendasMes);
  const lider = rankingMes.length > 0
    ? (vendedores.find(v => v.id === rankingMes[0].vendedor_id)?.nome || '—')
    : '—';

  // Venda mais recente
  let vendaRecenteLabel = '—';
  if (vendaMaisRecente) {
    const d = new Date(vendaMaisRecente.data_venda);
    vendaRecenteLabel = `${vendaMaisRecente.vendedores?.nome || '—'} — ${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}`;
  }

  // Calcular destaques da semana automaticamente
  const todasSemana = [...extSem, ...intSem];
  const liderExternoSem = extSem.sort((a,b) => b.vendas - a.vendas)[0];
  const liderInternoSem = intSem.sort((a,b) => b.vendas - a.vendas)[0];
  const maiorEvolucao = todasSemana.reduce((a,b) => (b.evolucao||0) > (a.evolucao||0) ? b : a, todasSemana[0] || {});
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
    metasFilial, semana, mes,
    liderExternoSem, liderInternoSem, maiorEvolucao, maiorPct,
    vendaRecenteLabel,
    rankingMes,
    // meta global da filial: vendas fora da filial não entram na
    // contagem "nossa equipe" do totalizador (calcularTotais em si
    // não foi alterada — só o array de entrada é filtrado aqui).
    totalGlobal: calcularTotais(vendasMes.filter(v => v.fora_filial !== true), vendasFiliais, metaGlobal),
  };
}

// ── Cálculo de períodos ───────────────────────────────────────────
function calcularPeriodoSemana() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=Dom, 1=Seg...
  const diffSeg = diaSemana === 0 ? -6 : 1 - diaSemana; // retroceder até segunda
  const seg = new Date(hoje);
  seg.setDate(hoje.getDate() + diffSeg);
  seg.setHours(0, 0, 0, 0);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  dom.setHours(23, 59, 59, 999);
  const fmt = d => d.toISOString().split('T')[0];
  const dias = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
  const labelDia = d => d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  return {
    de: fmt(seg), ate: fmt(dom),
    inicio: seg, fim: dom,
    diasNoMs: diasCalendario(seg, dom),
    label: `${labelDia(seg)} a ${labelDia(dom)}`,
    diasLabels: dias,
    diasDatas: Array.from({length:7}, (_,i) => { const d = new Date(seg); d.setDate(seg.getDate()+i); return fmt(d); }),
  };
}

// Semana anterior (segunda a domingo) — usada para calcular a
// "Maior Evolução" real (comparação com a semana atual), sem inventar
// nenhum número: se não houver vendas na semana anterior, o delta é 0.
function calcularPeriodoSemanaAnterior() {
  const atual = calcularPeriodoSemana();
  const seg = new Date(atual.inicio);
  seg.setDate(seg.getDate() - 7);
  const dom = new Date(atual.fim);
  dom.setDate(dom.getDate() - 7);
  const fmt = d => d.toISOString().split('T')[0];
  return { de: fmt(seg), ate: fmt(dom) };
}

function calcularPeriodoMes() {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth(); // 0-based
  const inicio = new Date(ano, mes, 1);
  const fim = new Date(ano, mes + 1, 0);
  const fmt = d => d.toISOString().split('T')[0];
  return {
    de: fmt(inicio), ate: fmt(fim),
    diaAtual: hoje.getDate(),
    diasNoMes: fim.getDate(),
    diasRestantes: fim.getDate() - hoje.getDate(),
    mesNome: hoje.toLocaleDateString('pt-BR', { month: 'long' }),
    mesNum: mes + 1,
    ano,
  };
}

function diasCalendario(d1, d2) {
  return Math.round((d2 - d1) / 86400000) + 1;
}

// ── Cálculo de Ranking ────────────────────────────────────────────
// Critério 1: quantidade de vendas principais
// Critério 2 (empate): maior valor total (plano + adicionais)
function calcularRanking(vendas) {
  const agrupado = {};
  for (const v of vendas) {
    const id = v.vendedor_id;
    if (!agrupado[id]) {
      agrupado[id] = {
        vendedor_id: id,
        vendas: 0,
        valor: 0,
        nome: v.vendedores?.nome || id,
        slug: v.vendedores?.slug || id
      };
    }
    // Critério 1: quantidade de vendas principais
    agrupado[id].vendas += 1;
    // Critério 2: valor total vendido
    // Inclui o plano + todos os adicionais vinculados à venda.
    agrupado[id].valor += Number(
      v.valor_total ??
      (
        Number(v.valor_plano || 0) +
        Number(v.valor_adicionais || 0)
      )
    );
  }
  return Object.values(agrupado)
    .sort((a, b) =>
      b.vendas - a.vendas ||
      b.valor - a.valor
    );
}

function calcularTotais(vendasEquipe, vendasFiliais, metaGlobal) {
  const equipe = vendasEquipe.length;
  const filiais = vendasFiliais.reduce((s, v) => s + Number(v.quantidade || 1), 0);
  const total = equipe + filiais;
  const pct = metaGlobal > 0 ? Math.min(100, Math.round((total / metaGlobal) * 100)) : 0;
  return { equipe, filiais, total, pct, metaGlobal };
}

