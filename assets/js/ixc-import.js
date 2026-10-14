// Importação controlada de contratos ativos exportados do IXC em CSV.
// A regional aberta é o destino; a origem vem do cadastro do vendedor.
let _linhasImportacaoIxc = [];
let _importacaoIxcEmAndamento = false;

function normalizarTextoIxc(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function decodificarCampoIxc(valor) {
  const texto = String(valor ?? '').trim();
  const formulaExcel = texto.match(/^=\s*"([\s\S]*)"$/);
  return formulaExcel ? formulaExcel[1].replace(/""/g, '"').trim() : texto;
}

function analisarCsvIxc(texto) {
  const separador = (String(texto).split(/\r?\n/, 1)[0].match(/;/g) || []).length >= 3 ? ';' : ',';
  const linhas = [];
  let campos = [];
  let campo = '';
  let entreAspas = false;
  const fonte = String(texto).replace(/^\uFEFF/, '');
  for (let i = 0; i < fonte.length; i++) {
    const caractere = fonte[i];
    if (caractere === '"') {
      if (entreAspas && fonte[i + 1] === '"') { campo += '"'; i++; }
      else entreAspas = !entreAspas;
    } else if (caractere === separador && !entreAspas) {
      campos.push(decodificarCampoIxc(campo)); campo = '';
    } else if ((caractere === '\n' || caractere === '\r') && !entreAspas) {
      if (caractere === '\r' && fonte[i + 1] === '\n') i++;
      campos.push(decodificarCampoIxc(campo));
      if (campos.some(valor => valor !== '')) linhas.push(campos);
      campos = []; campo = '';
    } else campo += caractere;
  }
  campos.push(decodificarCampoIxc(campo));
  if (campos.some(valor => valor !== '')) linhas.push(campos);
  if (linhas.length < 2) throw new Error('O CSV está vazio ou não contém linhas de venda.');

  const cabecalhos = linhas[0].map(normalizarTextoIxc);
  const indice = nome => cabecalhos.indexOf(normalizarTextoIxc(nome));
  const colunas = {
    contrato: indice('ID'),
    status: indice('Status contrato'),
    cliente: indice('Cliente'),
    plano: indice('Descrição'),
    ativacao: indice('Data ativação'),
    vendedor: indice('Vendedor'),
    atualizacao: indice('Última atualização'),
  };
  const obrigatorias = ['contrato', 'cliente', 'plano', 'vendedor', 'atualizacao'];
  const faltantes = obrigatorias.filter(nome => colunas[nome] < 0);
  if (colunas.status < 0 && colunas.ativacao < 0) faltantes.push('Status contrato ou Data ativação');
  if (faltantes.length) throw new Error(`Faltam colunas esperadas no CSV: ${faltantes.join(', ')}.`);
  return linhas.slice(1).map((linha, indiceLinha) => ({
    linha: indiceLinha + 2,
    contrato: String(linha[colunas.contrato] || '').replace(/\s+/g, ''),
    status: colunas.status >= 0 ? String(linha[colunas.status] || '').trim() : 'Ativo',
    cliente: String(linha[colunas.cliente] || '').trim(),
    descricaoPlano: String(linha[colunas.plano] || '').trim(),
    dataAtivacao: colunas.ativacao >= 0 ? String(linha[colunas.ativacao] || '').trim() : '',
    ixcVendedorId: String(linha[colunas.vendedor] || '').replace(/\s+/g, ''),
    ultimaAtualizacao: String(linha[colunas.atualizacao] || '').trim(),
  })).filter(linha => linha.contrato || linha.ixcVendedorId || linha.cliente);
}

function converterDataIxcParaIso(valor) {
  const m = String(valor || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, dia, mes, ano, hora, minuto, segundo = '0'] = m;
  if (Number(hora) > 23 || Number(minuto) > 59 || Number(segundo) > 59) return null;
  const dataLocal = new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(minuto), Number(segundo));
  if (dataLocal.getFullYear() !== Number(ano) || dataLocal.getMonth() !== Number(mes) - 1 || dataLocal.getDate() !== Number(dia)) return null;
  return dataLocal.toISOString();
}

function extrairHoraAtualizacaoIxc(valor) {
  const m = String(valor || '').trim().match(/(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hora = Number(m[1]), minuto = Number(m[2]), segundo = Number(m[3] || 0);
  if (hora > 23 || minuto > 59 || segundo > 59) return null;
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:${String(segundo).padStart(2, '0')}`;
}

function converterAtivacaoComHoraAtualizacaoIxcParaIso(dataAtivacao, ultimaAtualizacao) {
  const data = String(dataAtivacao || '').trim();
  const hora = extrairHoraAtualizacaoIxc(ultimaAtualizacao);
  if (!/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(data) || !hora) return null;
  return converterDataIxcParaIso(`${data} ${hora}`);
}

function identificarFamiliaPlanoIxc(valor) {
  const texto = normalizarTextoIxc(valor);
  if (/\b(play|tv)\b/.test(texto)) return 'play';
  if (/\b(empresa|empresas|empresarial|enterprise|entreprise)\b/.test(texto)) return 'empresa';
  if (/\b(radio|wireless)\b/.test(texto)) return 'radio';
  if (/\bfibra\b/.test(texto)) return 'fibra';
  if (/\b(combo|combinado)\b/.test(texto)) return 'combo';
  if (/\b(evento|eventos)\b/.test(texto)) return 'evento';
  return null;
}

function velocidadePlanoIxc(valor) {
  // Alguns planos Via Rádio do IXC usam velocidades de um dígito, como "8 MEGA".
  const m = String(valor || '').match(/\b(\d{1,4})\s*(?:mega|mbps|mb)\b/i);
  return m ? Number(m[1]) : null;
}

function obterValorPlanoIxc(plano) {
  for (const campo of ['valor', 'preco', 'valor_mensal', 'preco_mensal', 'valor_plano']) {
    const bruto = plano?.[campo];
    if (bruto == null || String(bruto).trim() === '') continue;
    const valor = Number(bruto);
    if (Number.isFinite(valor) && valor >= 0) return valor;
  }
  return null;
}

function obterValorExplicitoRelatorioIxc(descricao) {
  const m = String(descricao || '').match(/(?:r\$\s*)?(\d{1,4}[,.]\d{2})\s*$/i);
  if (!m) return null;
  const valor = Number(m[1].replace(',', '.'));
  return Number.isFinite(valor) ? valor : null;
}

function resolverPlanoIxc(descricao, planos) {
  const desc = normalizarTextoIxc(descricao);
  const exato = planos.filter(plano => {
    const nome = normalizarTextoIxc(plano.nome || '');
    const nomeComVelocidade = normalizarTextoIxc(`${plano.nome || ''} ${plano.velocidade_mb || ''}mb`);
    return nome === desc || nomeComVelocidade === desc;
  });
  if (exato.length === 1) return exato[0];

  const familia = identificarFamiliaPlanoIxc(descricao);
  const velocidade = velocidadePlanoIxc(descricao);
  if (!velocidade) return null;

  const tokens = valor => {
    const texto = normalizarTextoIxc(valor)
      .replace(/\b(enterprise|entreprise|empresarial|empresas?)\b/g, 'empresa')
      .replace(/\b(eventos?)\b/g, 'evento')
      .replace(/\b(combinado)\b/g, 'combo');
    const ignorar = new Set(['uni', 'at', 'plano', 'internet', 'mega', 'mb', 'mbps', 'gb', 'giga', 'ded', 'atualizado']);
    return new Set(texto.split(' ').filter(token => token && !/^\d+$/.test(token) && !ignorar.has(token)));
  };
  const igualdadeDeTokens = (a, b) => a.size === b.size && [...a].every(token => b.has(token));
  const descricaoTokens = tokens(descricao);
  const mesmaVelocidade = planos.filter(plano => {
    const nomeCompleto = `${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`;
    const velocidadeCatalogo = Number(plano.velocidade_mb) || velocidadePlanoIxc(nomeCompleto);
    return velocidadeCatalogo === velocidade;
  });
  if (!mesmaVelocidade.length) return null;

  // Quando só muda a ordem das palavras, compara os termos normalizados como conjunto.
  const equivalentes = mesmaVelocidade.filter(plano => {
    const textoPlano = `${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`;
    return igualdadeDeTokens(descricaoTokens, tokens(textoPlano));
  });
  if (equivalentes.length === 1) return equivalentes[0];
  if (equivalentes.length > 1) return null;

  const candidatos = familia
    ? mesmaVelocidade.filter(plano => identificarFamiliaPlanoIxc(`${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`) === familia)
    : mesmaVelocidade;
  if (candidatos.length === 1) return candidatos[0];
  if (candidatos.length < 2) return null;

  // Se houver mais de um plano da mesma família e velocidade, aceita somente um nome claramente mais próximo.
  const pontuados = candidatos.map(plano => {
    const nomeTokens = tokens(`${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`);
    const comuns = [...descricaoTokens].filter(token => nomeTokens.has(token)).length;
    const score = comuns / Math.max(descricaoTokens.size, nomeTokens.size, 1);
    return { plano, score };
  }).sort((a, b) => b.score - a.score);
  const melhor = pontuados[0];
  const segundo = pontuados[1];
  return melhor.score >= 0.5 && melhor.score - segundo.score >= 0.2 ? melhor.plano : null;
}

function renderizarPreviaIxc() {
  const corpo = document.getElementById('ixc-import-preview');
  const resumo = document.getElementById('ixc-import-summary');
  const wrapper = document.getElementById('ixc-import-preview-wrap');
  const botao = document.getElementById('ixc-import-submit');
  if (!corpo || !resumo || !wrapper || !botao) return;
  const escapar = valor => escapeHtmlText(String(valor ?? '—'));
  const prontos = _linhasImportacaoIxc.filter(linha => linha.podeImportar && linha.incluir && !linha.importada && !linha.duplicada);
  const duplicadas = _linhasImportacaoIxc.filter(linha => linha.duplicada).length;
  const ignoradas = _linhasImportacaoIxc.filter(linha => !linha.podeImportar && !linha.duplicada).length;
  const selecionadas = _linhasImportacaoIxc.filter(linha => linha.podeImportar && !linha.importada && !linha.duplicada).length;
  resumo.innerHTML = `<div class="adm-preview-status">${prontos.length} venda(s) selecionada(s) para importar · ${duplicadas} duplicada(s) ignorada(s) · ${ignoradas} linha(s) precisam de correção ou lançamento manual. ${selecionadas !== prontos.length ? `${selecionadas - prontos.length} desmarcada(s) para não importar.` : ''}</div>`;
  corpo.innerHTML = _linhasImportacaoIxc.map((linha, indice) => {
    const situacao = linha.importada ? 'Importada' : linha.duplicada ? 'Já cadastrada' : linha.erro || (linha.podeImportar ? 'Pronta para importar' : 'Não importável');
    const selecionavel = linha.podeImportar && !linha.importada && !linha.duplicada;
    return `<tr>
      <td>${escapar(linha.contrato)}</td><td>${escapar(linha.cliente)}</td>
      <td>${escapar(linha.plano?.nome || linha.descricaoPlano)}</td><td>${linha.valor == null ? '—' : `R$ ${Number(linha.valor).toFixed(2).replace('.', ',')}`}</td>
      <td>${escapar(linha.vendedor?.nome || `IXC ${linha.ixcVendedorId}`)}</td>
      <td>${escapar(linha.filialOrigemNome || '—')}</td>
      <td>${escapar(linha.dataAtivacao || '—')} · ${escapar(linha.horaAtualizacao || '—')}</td>
      <td>${selecionavel ? `<label><input type="checkbox" data-ixc-linha="${indice}" ${linha.incluir ? 'checked' : ''}> ${escapar(situacao)}</label>` : escapar(situacao)}</td>
    </tr>`;
  }).join('');
  corpo.querySelectorAll('[data-ixc-linha]').forEach(input => input.addEventListener('change', () => {
    _linhasImportacaoIxc[Number(input.dataset.ixcLinha)].incluir = input.checked;
    renderizarPreviaIxc();
  }));
  wrapper.hidden = false;
  botao.disabled = _importacaoIxcEmAndamento || prontos.length === 0;
}

async function carregarVendedoresComIdIxc() {
  const { data, error } = await window._supabase.from('vendedores')
    .select('id, nome, tipo, filial_id, ixc_vendedor_id, ativo')
    .eq('ativo', true)
    .not('ixc_vendedor_id', 'is', null)
    .order('filial_id')
    .order('nome');
  if (error) throw error;
  return data || [];
}

async function analisarImportacaoIxc(event) {
  if (_importacaoIxcEmAndamento) return;
  const arquivo = event.currentTarget.files?.[0];
  const resumo = document.getElementById('ixc-import-summary');
  const wrapper = document.getElementById('ixc-import-preview-wrap');
  const botao = document.getElementById('ixc-import-submit');
  _linhasImportacaoIxc = [];
  if (resumo) resumo.textContent = '';
  if (wrapper) wrapper.hidden = true;
  if (botao) botao.disabled = true;
  if (!arquivo) return;
  if (arquivo.size > 10 * 1024 * 1024) {
    if (resumo) resumo.textContent = 'O arquivo excede 10 MB. Exporte um CSV menor.';
    return;
  }
  try {
    if (!window.ADMIN_AUTENTICADO || !window._supabase) throw new Error('Entre no painel administrativo antes de importar vendas.');
    const linhas = analisarCsvIxc(await arquivo.text());
    const [vendedores, planos, filiais] = await Promise.all([carregarVendedoresComIdIxc(), loadPlanos(), loadFiliais()]);
    const linhasAtivas = linhas.filter(linha => normalizarTextoIxc(linha.status) === 'ativo');
    const contratos = linhasAtivas.map(linha => linha.contrato).filter(Boolean);
    let contratosExistentes = new Set();
    if (contratos.length) {
      const { data, error } = await window._supabase.from('vendas')
        .select('numero_venda')
        .eq('filial_destino_id', window.FILIAL_ATUAL_ID)
        .in('numero_venda', [...new Set(contratos)]);
      if (error) throw error;
      contratosExistentes = new Set((data || []).map(v => String(v.numero_venda)));
    }
    const vistosNoArquivo = new Set();
    _linhasImportacaoIxc = linhas.map(linha => {
      const resultado = { ...linha, podeImportar: false, incluir: false, importada: false, duplicada: false, erro: '' };
      if (normalizarTextoIxc(linha.status) !== 'ativo') { resultado.erro = 'Contrato não está ativo'; return resultado; }
      if (!linha.contrato || !/^\d+$/.test(linha.contrato)) { resultado.erro = 'ID do contrato inválido'; return resultado; }
      if (vistosNoArquivo.has(linha.contrato)) { resultado.duplicada = true; resultado.erro = 'Contrato repetido no CSV'; return resultado; }
      vistosNoArquivo.add(linha.contrato);
      if (contratosExistentes.has(linha.contrato)) { resultado.duplicada = true; resultado.erro = 'Contrato já cadastrado nesta regional'; return resultado; }
      const vendedoresDoCodigo = vendedores.filter(v => String(v.ixc_vendedor_id || '').trim() === linha.ixcVendedorId);
      if (!linha.ixcVendedorId || vendedoresDoCodigo.length !== 1) {
        resultado.erro = vendedoresDoCodigo.length > 1 ? 'ID IXC associado a mais de um vendedor' : 'Vendedor IXC sem cadastro único';
        return resultado;
      }
      resultado.vendedor = vendedoresDoCodigo[0];
      resultado.filialOrigemNome = filiais.find(f => String(f.id) === String(resultado.vendedor.filial_id))?.nome || '';
      const dataAtivacao = linha.dataAtivacao || String(linha.ultimaAtualizacao).trim().match(/^\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || '';
      const horaAtualizacao = extrairHoraAtualizacaoIxc(linha.ultimaAtualizacao);
      const instante = converterAtivacaoComHoraAtualizacaoIxcParaIso(dataAtivacao, linha.ultimaAtualizacao);
      if (!instante) { resultado.erro = 'Data de ativação ou hora da última atualização inválida'; return resultado; }
      resultado.dataAtivacao = dataAtivacao;
      resultado.horaAtualizacao = horaAtualizacao;
      resultado.dataVenda = instante;
      resultado.plano = resolverPlanoIxc(linha.descricaoPlano, planos);
      if (!resultado.plano) { resultado.erro = 'Plano sem correspondência única no catálogo'; return resultado; }
      resultado.valor = obterValorExplicitoRelatorioIxc(linha.descricaoPlano) ?? obterValorPlanoIxc(resultado.plano);
      if (resultado.valor == null) { resultado.erro = 'Plano sem valor cadastrado'; return resultado; }
      resultado.podeImportar = true;
      resultado.incluir = true;
      return resultado;
    });
    renderizarPreviaIxc();
  } catch (error) {
    console.error('[analisarImportacaoIxc]', error);
    if (resumo) resumo.textContent = error.message || 'Não foi possível analisar o arquivo.';
  }
}

async function confirmarImportacaoIxc() {
  const botao = document.getElementById('ixc-import-submit');
  const resumo = document.getElementById('ixc-import-summary');
  if (!botao || !window.ADMIN_AUTENTICADO || !window._supabase) {
    showToast('Entre no painel administrativo antes de importar vendas.', 'error');
    return;
  }
  const selecionadas = _linhasImportacaoIxc.filter(linha => linha.podeImportar && linha.incluir && !linha.importada && !linha.duplicada);
  if (!selecionadas.length) { showToast('Não há vendas selecionadas para importar.', 'warning'); return; }
  botao.disabled = true;
  botao.textContent = 'Importando…';
  _importacaoIxcEmAndamento = true;
  const inputArquivo = document.getElementById('ixc-csv-file');
  if (inputArquivo) inputArquivo.disabled = true;
  let importadas = 0;
  let duplicadas = 0;
  let falhas = 0;
  try {
    for (const linha of selecionadas) {
      try {
        const filialOrigemId = Number(linha.vendedor.filial_id);
        await saveVenda({
          vendedor_id: linha.vendedor.id,
          filial_origem_id: filialOrigemId,
          filial_destino_id: Number(window.FILIAL_ATUAL_ID),
          plano_id: linha.plano.id,
          data_venda: linha.dataVenda,
          valor: linha.valor,
          cliente: linha.cliente,
          numero_venda: linha.contrato,
          observacao: `Importado do IXC; descrição original do plano: ${linha.descricaoPlano}`,
          fora_filial: false,
        });
        linha.importada = true;
        linha.incluir = false;
        importadas++;
      } catch (error) {
        if (/já foi registrado/i.test(error.message || '')) {
          linha.duplicada = true;
          linha.erro = 'Contrato já cadastrado';
          duplicadas++;
        } else {
          linha.erro = error.message || 'Falha ao gravar a venda';
          falhas++;
        }
      }
      renderizarPreviaIxc();
    }
    if (importadas) await carregarDados();
    if (resumo) resumo.innerHTML = `<div class="adm-preview-status">Importação concluída: ${importadas} venda(s) registrada(s), ${duplicadas} duplicada(s) ignorada(s), ${falhas} falha(s).</div>`;
    showToast(`${importadas} venda(s) importada(s).`, falhas ? 'warning' : 'success');
  } catch (error) {
    console.error('[confirmarImportacaoIxc]', error);
    showToast(error.message || 'A importação não foi concluída.', 'error');
  } finally {
    _importacaoIxcEmAndamento = false;
    if (inputArquivo) inputArquivo.disabled = false;
    botao.textContent = 'Importar vendas novas';
    renderizarPreviaIxc();
  }
}
