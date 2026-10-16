// Importação controlada de contratos ativos exportados do IXC em CSV.
// A coluna Filial define o destino quando presente; a origem vem do cadastro do vendedor.
let _linhasImportacaoIxc = [];
let _relatorioIxcParaSugestoes = [];
let _pendenciasIxcCarregadas = [];
let _importacaoIxcEmAndamento = false;
let _conferenciaIxcEmAndamento = false;
let _analiseIxcEmAndamento = false;
let _limpezaPendenciasIxcEmAndamento = false;
let _edicaoVendaPendenteIxc = null;
let _opcoesEdicaoVendaIxc = { filiais: [], vendedores: [], planos: [], produtos: [], adicionais: [] };

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !document.getElementById('ixc-edit-backdrop')?.hidden) fecharEdicaoVendaIxc();
});

function atualizarBotaoLimparImportacaoIxc() {
  const botao = document.getElementById('ixc-import-clear');
  const temRelatorio = Boolean(document.getElementById('ixc-csv-file')?.files?.length || _linhasImportacaoIxc.length);
  if (botao) botao.disabled = _analiseIxcEmAndamento || _importacaoIxcEmAndamento || _conferenciaIxcEmAndamento || !temRelatorio;
}

function limparImportacaoIxc() {
  if (_analiseIxcEmAndamento || _importacaoIxcEmAndamento || _conferenciaIxcEmAndamento) {
    showToast('Aguarde a análise ou operação atual terminar para limpar o relatório.', 'warning');
    return;
  }
  const arquivo = document.getElementById('ixc-csv-file')?.files?.[0];
  if (!_linhasImportacaoIxc.length && !arquivo) return;
  if (!window.confirm('Limpar o arquivo e a prévia deste relatório? Vendas já gravadas e pendências de conferência não serão apagadas.')) return;

  _linhasImportacaoIxc = [];
  _relatorioIxcParaSugestoes = [];
  const input = document.getElementById('ixc-csv-file');
  const resumo = document.getElementById('ixc-import-summary');
  const preview = document.getElementById('ixc-import-preview');
  const wrapper = document.getElementById('ixc-import-preview-wrap');
  const botaoImportar = document.getElementById('ixc-import-submit');
  const confirmacao = document.getElementById('ixc-reconciliation-complete');
  const status = document.getElementById('ixc-reconciliation-status');
  if (input) input.value = '';
  if (resumo) resumo.textContent = '';
  if (preview) preview.replaceChildren();
  if (wrapper) wrapper.hidden = true;
  if (botaoImportar) {
    botaoImportar.disabled = true;
    botaoImportar.textContent = 'Importar vendas novas';
  }
  if (confirmacao) confirmacao.checked = false;
  if (status) status.textContent = '';
  atualizarBotaoConferenciaIxc();
  atualizarBotaoLimparImportacaoIxc();
  carregarPendenciasIxc([]);
  showToast('Relatório removido da tela. Vendas gravadas e pendências foram mantidas.', 'success');
}

// Códigos da coluna "Filial" exportada pelo IXC (não são IDs do Supabase).
// Para cadastrar outro código de uma filial já listada, adicione uma chave
// apontando para o mesmo nome; por exemplo, outro código de São Francisco.
const IXC_FILIAIS_POR_CODIGO = {
  '6': ['ji parana'],
  '7': ['machadinho'],
  '8': ['rolim de moura'],
  '9': ['jaru'],
  '10': ['ouro preto'],
  '11': ['nova brasilandia'],
  // O nome oficial da filial é Presidente Médici. Mantemos também a
  // grafia "Medice" usada anteriormente para cobrir cadastros legados.
  '12': ['presidente medici', 'presidente medice'],
  '14': ['alvorada'],
  '15': ['alta floresta'],
  '16': ['sao francisco'],
  '17': ['sao francisco'],
  '18': ['sao francisco'],
};

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
    filial: indice('Filial'),
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
    codigoFilialIxc: colunas.filial >= 0 ? String(linha[colunas.filial] || '').trim() : '',
    temColunaFilialIxc: colunas.filial >= 0,
    status: colunas.status >= 0 ? String(linha[colunas.status] || '').trim() : 'Ativo',
    cliente: String(linha[colunas.cliente] || '').trim(),
    descricaoPlano: String(linha[colunas.plano] || '').trim(),
    dataAtivacao: colunas.ativacao >= 0 ? String(linha[colunas.ativacao] || '').trim() : '',
    ixcVendedorId: String(linha[colunas.vendedor] || '').replace(/\s+/g, ''),
    ultimaAtualizacao: String(linha[colunas.atualizacao] || '').trim(),
  })).filter(linha => linha.contrato || linha.ixcVendedorId || linha.cliente);
}

function resolverFilialDestinoIxc(codigoFilialIxc, filiais, temColunaFilialIxc = false) {
  const codigo = String(codigoFilialIxc || '').trim();
  if (!codigo) {
    if (temColunaFilialIxc) return { filial: null, erro: 'A coluna Filial está vazia nesta linha.' };
    const filial = (filiais || []).find(f => String(f.id) === String(window.FILIAL_ATUAL_ID));
    return filial
      ? { filial, erro: '' }
      : { filial: null, erro: 'A filial selecionada não foi encontrada.' };
  }

  const aliases = IXC_FILIAIS_POR_CODIGO[codigo];
  if (!aliases) return { filial: null, erro: `Código de filial IXC ${codigo} ainda não mapeado.` };
  const normalizados = aliases.map(normalizarTextoIxc);
  const candidatas = (filiais || []).filter(f => {
    const nome = normalizarTextoIxc(f.nome);
    return normalizados.some(alias => nome.includes(alias));
  });
  if (candidatas.length !== 1) {
    return {
      filial: null,
      erro: candidatas.length
        ? `Código IXC ${codigo} corresponde a mais de uma filial no cadastro.`
        : `Código IXC ${codigo} reconhecido, mas a filial correspondente não está ativa/cadastrada.`,
    };
  }
  return { filial: candidatas[0], erro: '' };
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
  const texto = String(valor || '').trim();
  const explicita = texto.match(/\b(\d{1,4})\s*(?:mega|mbps|mb)\b/i);
  if (explicita) return Number(explicita[1]);

  // Alguns relatórios omitem a unidade: "PLANO 650 UNI FIBRA" ou "Uni Fibra 650".
  const depoisDoTipo = texto.match(/\b(?:plano|uni|fibra|empresas?|empresarial|enterprise|entreprise|play|radio|wireless|combo|start|vip|eventos?)\s+(\d{1,4})\b/i);
  if (depoisDoTipo) return Number(depoisDoTipo[1]);

  const antesDoTipo = texto.match(/^\s*(\d{1,4})\b(?=.*\b(?:uni|fibra|empresas?|empresarial|enterprise|entreprise|play|radio|wireless|combo|start|vip|eventos?)\b)/i);
  return antesDoTipo ? Number(antesDoTipo[1]) : null;
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
    // "Uni" faz parte do nome comercial e diferencia, por exemplo,
    // "Uni Empresas" dos planos Enterprise; não deve ser descartado.
    const ignorar = new Set(['at', 'plano', 'internet', 'mega', 'mb', 'mbps', 'gb', 'giga', 'ded', 'atualizado']);
    return new Set(texto.split(' ').filter(token => token && !/^\d+$/.test(token) && !ignorar.has(token)));
  };
  const igualdadeDeTokens = (a, b) => a.size === b.size && [...a].every(token => b.has(token));
  const descricaoSemValor = String(descricao || '').replace(/(?:r\$\s*)?\d{1,4}[,.]\d{2}\s*$/i, '');
  const descricaoTokens = tokens(descricaoSemValor);
  const mesmaVelocidade = planos.filter(plano => {
    const nomeCompleto = `${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`;
    const velocidadeCatalogo = Number(plano.velocidade_mb) || velocidadePlanoIxc(nomeCompleto);
    return velocidadeCatalogo === velocidade;
  });
  if (!mesmaVelocidade.length) return null;

  // O IXC costuma anexar o valor ao fim da descrição. Quando vários planos
  // compartilham família e velocidade, esse valor pode distinguir o plano
  // certo sem depender da ordem das palavras no nome.
  const valorRelatorio = obterValorExplicitoRelatorioIxc(descricao);
  const candidatosMesmoValor = valorRelatorio == null ? [] : mesmaVelocidade.filter(plano => {
    const familiaCatalogo = identificarFamiliaPlanoIxc(`${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`);
    const familiaCompativel = !familia || familiaCatalogo === familia;
    const valorCatalogo = obterValorPlanoIxc(plano);
    return familiaCompativel && valorCatalogo != null && Math.abs(valorCatalogo - valorRelatorio) < 0.01;
  });
  const candidatosMesmoValorAtivos = candidatosMesmoValor.filter(plano => plano.ativo !== false);
  if (candidatosMesmoValorAtivos.length === 1) return candidatosMesmoValorAtivos[0];
  if (!candidatosMesmoValorAtivos.length && candidatosMesmoValor.length === 1) return candidatosMesmoValor[0];
  const planosParaComparar = candidatosMesmoValorAtivos.length
    ? candidatosMesmoValorAtivos
    : candidatosMesmoValor.length > 1 ? candidatosMesmoValor : mesmaVelocidade;

  // Prioriza o nome do próprio plano: categoria e tipo podem trazer palavras
  // extras que não aparecem na descrição do IXC e atrapalhar a igualdade.
  const nomeCorrespondente = planosParaComparar.filter(plano =>
    igualdadeDeTokens(descricaoTokens, tokens(plano.nome || ''))
  );
  const nomeCorrespondenteAtivo = nomeCorrespondente.filter(plano => plano.ativo !== false);
  if (nomeCorrespondenteAtivo.length === 1) return nomeCorrespondenteAtivo[0];
  if (!nomeCorrespondenteAtivo.length && nomeCorrespondente.length === 1) return nomeCorrespondente[0];

  // Quando só muda a ordem das palavras, compara os termos normalizados como conjunto.
  const equivalentes = planosParaComparar.filter(plano => {
    const textoPlano = `${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`;
    return igualdadeDeTokens(descricaoTokens, tokens(textoPlano));
  });
  if (equivalentes.length === 1) return equivalentes[0];
  if (equivalentes.length > 1) return null;

  const candidatos = familia
    ? planosParaComparar.filter(plano => identificarFamiliaPlanoIxc(`${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`) === familia)
    : planosParaComparar;
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

function diagnosticarPlanoIxc(descricao, planos) {
  const familia = identificarFamiliaPlanoIxc(descricao);
  const velocidade = velocidadePlanoIxc(descricao);
  const valorRelatorio = obterValorExplicitoRelatorioIxc(descricao);
  const candidatos = (planos || []).filter(plano => {
    const nomeCompleto = `${plano.nome || ''} ${plano.categoria || ''} ${plano.tipo || ''}`;
    const velocidadeCatalogo = Number(plano.velocidade_mb) || velocidadePlanoIxc(nomeCompleto);
    const familiaCatalogo = identificarFamiliaPlanoIxc(nomeCompleto);
    return velocidade != null && velocidadeCatalogo === velocidade && (!familia || familiaCatalogo === familia);
  });
  const detalhesCandidatos = candidatos.map(plano => {
    const nome = plano.nome || 'Plano sem nome';
    const valor = obterValorPlanoIxc(plano);
    const situacao = plano.ativo === false ? 'inativo' : 'ativo';
    return `${nome} [${situacao}${valor == null ? '; sem valor' : `; R$ ${valor.toFixed(2).replace('.', ',')}`}]`;
  });
  const perfil = [familia || 'tipo não identificado', velocidade == null ? 'velocidade não identificada' : `${velocidade} Mbps`].join(', ');
  const valorResumo = valorRelatorio == null ? '' : `, valor no IXC R$ ${valorRelatorio.toFixed(2).replace('.', ',')}`;
  const resumo = candidatos.length
    ? `${candidatos.length} candidato(s): ${detalhesCandidatos.join('; ')}`
    : 'nenhum candidato compatível no catálogo';
  return `Plano sem correspondência única (${perfil}${valorResumo}; ${resumo}).`;
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
      <td>${escapar(linha.filialOrigemNome || '—')} → ${escapar(linha.filialDestinoNome || (linha.codigoFilialIxc ? `IXC ${linha.codigoFilialIxc}` : '—'))}${linha.codigoFilialIxc ? ` (IXC ${escapar(linha.codigoFilialIxc)})` : ''}</td>
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

// Procura contratos globalmente sem consultar os dados completos das vendas.
// A função SQL retorna somente o número do contrato e sua filial de destino.
async function carregarContratosExistentesIxc(contratos) {
  const contratosUnicos = [...new Set((contratos || []).map(v => String(v || '').trim()).filter(Boolean))];
  const encontrados = [];
  for (let inicio = 0; inicio < contratosUnicos.length; inicio += 250) {
    const loteContratos = contratosUnicos.slice(inicio, inicio + 250);
    const lote = await carregarTodasPaginas(() => window._supabase
      .rpc('vendas_ixc_contratos_existentes', { p_numeros_venda: loteContratos })
      .order('numero_venda', { ascending: true })
      .order('filial_destino_id', { ascending: true }), 'verificação de contratos IXC');
    encontrados.push(...lote);
  }
  return encontrados;
}

function atualizarBotaoConferenciaIxc() {
  const controles = document.getElementById('ixc-reconciliation-controls');
  const resumoFiliais = document.getElementById('ixc-reconciliation-summary');
  const confirmacao = document.getElementById('ixc-reconciliation-complete');
  const botao = document.getElementById('ixc-reconciliation-submit');
  if (!controles || !confirmacao || !botao) return;
  const linhasComparaveis = _linhasImportacaoIxc.filter(linha =>
    normalizarTextoIxc(linha.status) === 'ativo' &&
    linha.filialDestinoId && /^\d+$/.test(String(linha.contrato || '').trim())
  );
  const contagens = new Map();
  linhasComparaveis.forEach(linha => {
    const filialId = String(linha.filialDestinoId);
    if (!contagens.has(filialId)) contagens.set(filialId, {
      nome: linha.filialDestinoNome || `Filial ${filialId}`,
      contratos: new Set(),
    });
    contagens.get(filialId).contratos.add(String(linha.contrato).trim());
  });
  const totalContratos = [...contagens.values()].reduce((total, filial) => total + filial.contratos.size, 0);
  if (resumoFiliais) {
    const filiaisOrdenadas = [...contagens.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    resumoFiliais.innerHTML = filiaisOrdenadas.length
      ? `<strong>${totalContratos} contrato(s) ativo(s) em ${filiaisOrdenadas.length} filial(is)</strong><div class="ixc-reconciliation-branch-counts">${filiaisOrdenadas.map(filial => `<span>${escapeHtmlText(filial.nome)}: <b>${filial.contratos.size}</b></span>`).join('')}</div>`
      : '';
  }
  const temDadosComparaveis = totalContratos > 0;
  controles.hidden = !temDadosComparaveis;
  botao.disabled = _conferenciaIxcEmAndamento || !confirmacao.checked || !temDadosComparaveis;
  atualizarBotaoLimparImportacaoIxc();
}

function similaridadeTextoIxc(a, b) {
  const textoA = normalizarTextoIxc(a);
  const textoB = normalizarTextoIxc(b);
  if (!textoA || !textoB) return 0;
  if (textoA === textoB) return 1;

  const trigramas = texto => {
    const acolchoado = `  ${texto} `;
    const conjunto = new Set();
    for (let i = 0; i <= acolchoado.length - 3; i++) conjunto.add(acolchoado.slice(i, i + 3));
    return conjunto;
  };
  const trigramaA = trigramas(textoA);
  const trigramaB = trigramas(textoB);
  let comuns = 0;
  trigramaA.forEach(item => { if (trigramaB.has(item)) comuns++; });
  const dice = (2 * comuns) / (trigramaA.size + trigramaB.size);

  const tokensA = new Set(textoA.split(' ').filter(token => token.length > 1));
  const tokensB = new Set(textoB.split(' ').filter(token => token.length > 1));
  let tokensComuns = 0;
  tokensA.forEach(token => { if (tokensB.has(token)) tokensComuns++; });
  const jaccard = tokensComuns / Math.max(1, tokensA.size + tokensB.size - tokensComuns);
  return Math.max(dice, jaccard);
}

function formatarDataCurtaIxc(valor) {
  if (!valor) return '—';
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' });
}

function formatarMoedaCurtaIxc(valor) {
  if (valor == null || String(valor).trim() === '') return '—';
  const numero = Number(valor);
  return Number.isFinite(numero) ? `R$ ${numero.toFixed(2).replace('.', ',')}` : '—';
}

function sugerirContratosIxc(venda, relatorioAtivo = []) {
  const nomeCliente = normalizarTextoIxc(venda?.cliente);
  const filialId = String(venda?.filial_destino_id ?? '');
  if (!nomeCliente || !filialId) return [];
  const vendedor = normalizarTextoIxc(venda?.vendedor_nome);
  const plano = normalizarTextoIxc(venda?.plano_nome);

  return (relatorioAtivo || [])
    .filter(linha => normalizarTextoIxc(linha.status) === 'ativo'
      && String(linha.filialDestinoId ?? '') === filialId
      && String(linha.contrato || '').trim() !== String(venda.numero_venda || '').trim()
      && !linha.duplicada
      && !linha.importada
      && /^\d+$/.test(String(linha.contrato || '').trim()))
    .map(linha => {
      const similaridadeCliente = similaridadeTextoIxc(venda.cliente, linha.cliente);
      const vendedorCompativel = Boolean(vendedor && linha.vendedor?.nome
        && vendedor === normalizarTextoIxc(linha.vendedor.nome));
      const similaridadePlano = plano && linha.plano?.nome
        ? similaridadeTextoIxc(venda.plano_nome, linha.plano.nome)
        : 0;
      const sinaisApoio = vendedorCompativel || similaridadePlano >= 0.8;
      if (similaridadeCliente < 0.82 || !sinaisApoio) return null;
      return {
        contrato: String(linha.contrato).trim(),
        cliente: linha.cliente,
        nome: linha.plano?.nome || linha.descricaoPlano,
        dataVenda: linha.dataVenda || linha.dataAtivacao,
        valor: linha.valor ?? obterValorExplicitoRelatorioIxc(linha.descricaoPlano),
        similaridadeCliente,
        vendedorCompativel,
        similaridadePlano,
        pontuacao: similaridadeCliente * 0.76 + (vendedorCompativel ? 0.14 : 0) + similaridadePlano * 0.10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 3);
}

async function reconciliarRelatorioIxc() {
  const confirmacao = document.getElementById('ixc-reconciliation-complete');
  const botao = document.getElementById('ixc-reconciliation-submit');
  const status = document.getElementById('ixc-reconciliation-status');
  if (!window.ADMIN_AUTENTICADO || !window._supabase) {
    showToast('Entre no painel administrativo antes de conferir o relatório.', 'error');
    return;
  }
  if (!confirmacao?.checked) {
    showToast('Confirme que o arquivo contém a lista completa de contratos ativos.', 'warning');
    return;
  }
  const linhasAtivas = _linhasImportacaoIxc.filter(linha =>
    normalizarTextoIxc(linha.status) === 'ativo' &&
    linha.filialDestinoId && /^\d+$/.test(String(linha.contrato || '').trim())
  );
  const filiais = [...new Set(linhasAtivas.map(linha => Number(linha.filialDestinoId)))];
  const contratos = [...new Set(linhasAtivas.map(linha => String(linha.contrato).trim()))];
  if (!filiais.length || !contratos.length) {
    showToast('Não encontrei filiais e contratos ativos válidos para conferir.', 'warning');
    return;
  }
  _conferenciaIxcEmAndamento = true;
  atualizarBotaoLimparImportacaoIxc();
  if (botao) botao.textContent = 'Conferindo…';
  if (status) status.textContent = 'Comparando os contratos do arquivo com as vendas cadastradas…';
  atualizarBotaoConferenciaIxc();
  try {
    const { data, error } = await window._supabase.rpc('conferir_vendas_ausentes_ixc', {
      p_filial_ids: filiais,
      p_contratos_ativos: contratos,
    });
    if (error) throw error;
    const total = Number(data || 0);
    if (status) status.textContent = `Conferência concluída. ${total} venda(s) pendente(s) nova(s) ou revisitada(s).`;
    showToast(`Conferência concluída: ${total} venda(s) aguardando revisão.`, 'success');
    _relatorioIxcParaSugestoes = [..._linhasImportacaoIxc];
    await carregarPendenciasIxc(_relatorioIxcParaSugestoes);
  } catch (error) {
    console.error('[reconciliarRelatorioIxc]', error);
    const mensagem = error.code === 'PGRST202'
      ? 'A função de conferência ainda não existe. Execute supabase/conferencia-vendas-ixc.sql no SQL Editor do Supabase.'
      : error.message || 'Não foi possível conferir as vendas.';
    if (status) status.textContent = mensagem;
    showToast(mensagem, 'error');
  } finally {
    _conferenciaIxcEmAndamento = false;
    atualizarBotaoLimparImportacaoIxc();
    if (botao) botao.textContent = 'Conferir vendas já cadastradas';
    atualizarBotaoConferenciaIxc();
  }
}

async function carregarPendenciasIxc(relatorioAtivo = _relatorioIxcParaSugestoes) {
  const corpo = document.getElementById('ixc-pending-body');
  const botaoLimpar = document.getElementById('ixc-pending-clear');
  if (!corpo || !window.ADMIN_AUTENTICADO || !window._supabase) return;
  corpo.innerHTML = '<tr><td colspan="7" class="adm-empty-state">Carregando vendas pendentes…</td></tr>';
  if (botaoLimpar) botaoLimpar.disabled = true;
  const { data: pendencias, error } = await window._supabase
    .from('vendas_conferencia_ixc')
    .select('id, venda_id, filial_id, numero_venda, situacao, relatorio_em')
    .eq('situacao', 'pendente')
    .order('relatorio_em', { ascending: false });
  if (error) {
    _pendenciasIxcCarregadas = [];
    console.error('[carregarPendenciasIxc]', error);
    const mensagem = ['42P01', 'PGRST205'].includes(error.code)
      ? 'A tabela de conferência ainda não existe. Execute supabase/conferencia-vendas-ixc.sql no SQL Editor do Supabase.'
      : error.message || 'Não foi possível carregar as pendências.';
    corpo.innerHTML = `<tr><td colspan="7" class="adm-empty-state">${escapeHtmlText(mensagem)}</td></tr>`;
    if (botaoLimpar) botaoLimpar.hidden = true;
    return;
  }
  _pendenciasIxcCarregadas = pendencias || [];
  if (botaoLimpar) {
    botaoLimpar.hidden = !_pendenciasIxcCarregadas.length;
    botaoLimpar.disabled = _limpezaPendenciasIxcEmAndamento || !_pendenciasIxcCarregadas.length;
    botaoLimpar.textContent = `Limpar pendências (${_pendenciasIxcCarregadas.length})`;
    botaoLimpar.onclick = limparPendenciasIxc;
  }
  if (!pendencias?.length) {
    corpo.innerHTML = '<tr><td colspan="7" class="adm-empty-state">Nenhuma venda pendente de conferência.</td></tr>';
    return;
  }
  const ids = pendencias.map(item => Number(item.venda_id)).filter(Number.isFinite);
  const vendas = await carregarTodasPaginas(() => window._supabase
    .from('vendas_admin')
    .select('*')
    .in('id', ids)
    .order('id', { ascending: true }), 'vendas pendentes de conferência IXC');
  const vendaPorId = new Map(vendas.map(venda => [String(venda.id), venda]));
  const filiais = await loadFiliais();
  const filialPorId = new Map(filiais.map(filial => [String(filial.id), filial.nome]));
  const formatarData = valor => {
    if (!valor) return '—';
    const data = new Date(valor);
    return Number.isNaN(data.getTime()) ? '—' : data.toLocaleDateString('pt-BR', { timeZone: 'America/Manaus' });
  };
  const escapar = valor => escapeHtmlText(String(valor ?? '—'));
  corpo.innerHTML = pendencias.map(pendencia => {
    const venda = vendaPorId.get(String(pendencia.venda_id));
    const vendaId = Number(pendencia.venda_id);
    const filialNome = filialPorId.get(String(pendencia.filial_id)) || '—';
    const valor = venda?.valor_total == null ? '—' : `R$ ${Number(venda.valor_total).toFixed(2).replace('.', ',')}`;
    const sugestoes = venda ? sugerirContratosIxc(venda, relatorioAtivo) : [];
    const blocoSugestoes = sugestoes.length ? `<div class="ixc-pending-suggestions">
      <span>Possíveis contratos ativos na mesma filial. Confira antes de vincular:</span>
      ${sugestoes.map(sugestao => `<div class="ixc-suggestion-item">
        <button type="button" class="adm-btn adm-btn-small ixc-suggestion-btn" data-ixc-action="vincular-sugerido" data-id="${Number(pendencia.id)}" data-venda-id="${vendaId}" data-cliente="${escapar(venda?.cliente || 'venda')}" data-contrato="${escapar(sugestao.contrato)}">
          Usar IXC ${escapar(sugestao.contrato)} · ${escapar(sugestao.nome)} · cliente ${Math.round(sugestao.similaridadeCliente * 100)}%${sugestao.vendedorCompativel ? ' · vendedor igual' : ''}${sugestao.similaridadePlano >= 0.8 ? ' · plano parecido' : ''}
        </button>
        <details class="ixc-suggestion-details"><summary>Conferir data e valores</summary>
          <span>Relatório ativo: ${escapar(formatarDataCurtaIxc(sugestao.dataVenda))} · plano ${escapar(formatarMoedaCurtaIxc(sugestao.valor))}.</span>
          <span>Venda cadastrada: ${escapar(formatarDataCurtaIxc(venda?.data_venda))} · total ${escapar(formatarMoedaCurtaIxc(venda?.valor_total))}, que pode incluir adicionais.</span>
        </details>
      </div>`).join('')}
    </div>` : '';
    return `<tr>
      <td>${escapar(formatarData(venda?.data_venda))}</td>
      <td>${escapar(venda?.numero_venda || pendencia.numero_venda)}</td>
      <td>${escapar(venda?.cliente || 'Cliente sem nome')}</td>
      <td>${escapar(venda?.vendedor_nome || '—')}</td>
      <td>${escapar(filialNome)}</td>
      <td>${escapar(valor)}</td>
      <td><div class="ixc-pending-actions">
        ${blocoSugestoes}
        <button type="button" class="adm-btn adm-btn-secondary adm-btn-small" data-ixc-action="validar" data-id="${Number(pendencia.id)}" data-cliente="${escapar(venda?.cliente || 'venda')}">Manter válida</button>
        <button type="button" class="adm-btn adm-btn-danger adm-btn-small" data-ixc-action="cancelar" data-id="${Number(pendencia.id)}" data-cliente="${escapar(venda?.cliente || 'venda')}">Confirmar cancelamento</button>
        <button type="button" class="adm-btn adm-btn-small" data-ixc-action="editar" data-id="${Number(pendencia.id)}" data-venda-id="${vendaId}" data-cliente="${escapar(venda?.cliente || 'venda')}">Editar venda</button>
      </div></td>
    </tr>`;
  }).join('');
  corpo.querySelectorAll('[data-ixc-action]:not([data-ixc-action="vincular-sugerido"])').forEach(botao => botao.addEventListener('click', () => {
    if (botao.dataset.ixcAction === 'editar') {
      abrirEdicaoVendaIxc(Number(botao.dataset.id), Number(botao.dataset.vendaId));
      return;
    }
    resolverConferenciaIxc(Number(botao.dataset.id), botao.dataset.ixcAction, botao.dataset.cliente || 'venda');
  }));
  corpo.querySelectorAll('[data-ixc-action="vincular-sugerido"]').forEach(botao => botao.addEventListener('click', () => {
    abrirEdicaoVendaIxc(Number(botao.dataset.id), Number(botao.dataset.vendaId), botao.dataset.contrato || '');
  }));
}

function definirOpcoesSelectIxc(id, itens, valorAtual, rotulo, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  select.replaceChildren(new Option(placeholder, ''));
  (itens || []).forEach(item => select.add(new Option(rotulo(item), String(item.id))));
  if (valorAtual && ![...select.options].some(option => option.value === String(valorAtual))) {
    select.add(new Option(`Cadastro atual (${valorAtual})`, String(valorAtual)));
  }
  select.value = valorAtual == null ? '' : String(valorAtual);
}

function dataHoraLocalInputIxc(valor) {
  if (!valor) return '';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '';
  const local = new Date(data.getTime() - data.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function renderizarAdicionaisEdicaoIxc(adicionais = []) {
  const lista = document.getElementById('ixc-edit-additions-list');
  if (!lista) return;
  const escapar = valor => escapeHtmlText(String(valor ?? ''));
  if (!adicionais.length) {
    lista.innerHTML = '<p class="adm-muted-copy ixc-edit-no-additions">Nenhum adicional vinculado.</p>';
    return;
  }
  lista.innerHTML = adicionais.map(item => {
    const produtoAtual = _opcoesEdicaoVendaIxc.produtos.find(p => String(p.id) === String(item.produto_adicional_id));
    const opcoes = [..._opcoesEdicaoVendaIxc.produtos];
    if (item.produto_adicional_id && !produtoAtual) opcoes.push({ id: item.produto_adicional_id, nome: item.produtos_adicionais?.nome || `Produto ${item.produto_adicional_id}` });
    return `<div class="ixc-edit-addition-row">
      <div class="adm-field"><label>Produto</label><select class="ixc-edit-addition-product"><option value="">Selecione</option>${opcoes.map(p => `<option value="${escapar(p.id)}" ${String(p.id) === String(item.produto_adicional_id) ? 'selected' : ''}>${escapar(p.nome)}</option>`).join('')}</select></div>
      <div class="adm-field"><label>Quantidade</label><input class="ixc-edit-addition-quantity" type="number" min="1" step="1" value="${escapar(item.quantidade || 1)}"></div>
      <div class="adm-field"><label>Valor unitário (R$)</label><input class="ixc-edit-addition-value" type="number" min="0" step="0.01" value="${escapar(Number(item.valor_unitario || 0).toFixed(2))}"></div>
      <button type="button" class="adm-btn adm-btn-danger adm-btn-small" aria-label="Remover adicional" onclick="this.closest('.ixc-edit-addition-row').remove();atualizarListaAdicionaisEdicaoIxc()">Remover</button>
    </div>`;
  }).join('');
}

function atualizarListaAdicionaisEdicaoIxc() {
  const lista = document.getElementById('ixc-edit-additions-list');
  if (lista && !lista.querySelector('.ixc-edit-addition-row')) {
    lista.innerHTML = '<p class="adm-muted-copy ixc-edit-no-additions">Nenhum adicional vinculado.</p>';
  }
}

function adicionarAdicionalEdicaoIxc() {
  const atuais = [...document.querySelectorAll('.ixc-edit-addition-row')].map(row => ({
    produto_adicional_id: row.querySelector('.ixc-edit-addition-product')?.value || '',
    quantidade: row.querySelector('.ixc-edit-addition-quantity')?.value || 1,
    valor_unitario: row.querySelector('.ixc-edit-addition-value')?.value || 0,
  }));
  atuais.push({ produto_adicional_id: '', quantidade: 1, valor_unitario: 0 });
  renderizarAdicionaisEdicaoIxc(atuais);
}

async function abrirEdicaoVendaIxc(pendenciaId, vendaId, contratoSugerido = '') {
  if (!window.ADMIN_AUTENTICADO || !window._supabase) return;
  const backdrop = document.getElementById('ixc-edit-backdrop');
  try {
    const [vendaResult, filiaisResult, vendedoresResult, planosResult, produtosResult, adicionaisResult] = await Promise.all([
      window._supabase.from('vendas_admin').select('*').eq('id', vendaId).maybeSingle(),
      window._supabase.from('filiais').select('id, nome, ativo').order('nome'),
      window._supabase.from('vendedores').select('id, nome, filial_id, ativo').order('nome'),
      window._supabase.from('planos').select('*').order('nome'),
      window._supabase.from('produtos_adicionais').select('*').order('nome'),
      window._supabase.from('venda_adicionais').select('produto_adicional_id, quantidade, valor_unitario, produtos_adicionais(nome)').eq('venda_id', vendaId).order('id'),
    ]);
    for (const result of [vendaResult, filiaisResult, vendedoresResult, planosResult, produtosResult, adicionaisResult]) {
      if (result.error) throw result.error;
    }
    const venda = vendaResult.data;
    if (!venda) throw new Error('A venda não foi encontrada ou sua conta não tem acesso a ela.');
    _opcoesEdicaoVendaIxc = {
      filiais: filiaisResult.data || [],
      vendedores: vendedoresResult.data || [],
      planos: planosResult.data || [],
      produtos: produtosResult.data || [],
      adicionais: adicionaisResult.data || [],
    };
    const formatarPlano = p => `${p.nome}${p.velocidade_mb ? ` · ${p.velocidade_mb} Mbps` : ''}`;
    definirOpcoesSelectIxc('ixc-edit-vendedor', _opcoesEdicaoVendaIxc.vendedores, venda.vendedor_id, v => `${v.nome}${v.ativo === false ? ' (inativo)' : ''}`, 'Sem vendedor');
    definirOpcoesSelectIxc('ixc-edit-plano', _opcoesEdicaoVendaIxc.planos, venda.plano_id, formatarPlano, 'Selecione o plano');
    definirOpcoesSelectIxc('ixc-edit-origem', _opcoesEdicaoVendaIxc.filiais, venda.filial_origem_id, f => `${f.nome}${f.ativo === false ? ' (inativa)' : ''}`, 'Selecione a origem');
    definirOpcoesSelectIxc('ixc-edit-destino', _opcoesEdicaoVendaIxc.filiais, venda.filial_destino_id, f => `${f.nome}${f.ativo === false ? ' (inativa)' : ''}`, 'Selecione o destino');
    document.getElementById('ixc-edit-numero').value = contratoSugerido || venda.numero_venda || '';
    document.getElementById('ixc-edit-cliente').value = venda.cliente || '';
    document.getElementById('ixc-edit-data').value = dataHoraLocalInputIxc(venda.data_venda);
    document.getElementById('ixc-edit-valor').value = Number(venda.valor_plano ?? venda.valor ?? 0).toFixed(2);
    document.getElementById('ixc-edit-fora-filial').checked = venda.fora_filial === true;
    document.getElementById('ixc-edit-observacao').value = venda.observacao || '';
    const subtitulo = document.getElementById('ixc-edit-subtitle');
    if (subtitulo) subtitulo.textContent = `${venda.cliente || 'Venda sem cliente'} · ${venda.vendedor_nome || 'Sem vendedor'} · ${formatarMoedaCurtaIxc(venda.valor_total || venda.valor_plano || venda.valor || 0)}. Corrija os campos necessários antes de salvar.`;
    renderizarAdicionaisEdicaoIxc(_opcoesEdicaoVendaIxc.adicionais);
    _edicaoVendaPendenteIxc = { pendenciaId, vendaId };
    backdrop.hidden = false;
    document.body.classList.add('adm-modal-open');
    document.getElementById('ixc-edit-numero')?.focus();
  } catch (error) {
    console.error('[abrirEdicaoVendaIxc]', error);
    showToast(error.message || 'Não foi possível abrir a venda para edição.', 'error');
  }
}

function fecharEdicaoVendaIxc() {
  const backdrop = document.getElementById('ixc-edit-backdrop');
  if (backdrop) backdrop.hidden = true;
  _edicaoVendaPendenteIxc = null;
  document.body.classList.remove('adm-modal-open');
}

async function salvarEdicaoVendaIxc(vincular) {
  const edicao = _edicaoVendaPendenteIxc;
  if (!edicao || !window._supabase) return;
  const numero = document.getElementById('ixc-edit-numero').value.trim();
  const dataLocal = document.getElementById('ixc-edit-data').value;
  const valor = Number(document.getElementById('ixc-edit-valor').value);
  const adicionais = [...document.querySelectorAll('.ixc-edit-addition-row')].map(row => ({
    produto_adicional_id: row.querySelector('.ixc-edit-addition-product').value,
    quantidade: Number(row.querySelector('.ixc-edit-addition-quantity').value),
    valor_unitario: Number(row.querySelector('.ixc-edit-addition-value').value),
  }));
  if (!/^\d+$/.test(numero)) { showToast('Informe um número de contrato contendo apenas números.', 'warning'); return; }
  if (!dataLocal || !Number.isFinite(valor) || valor < 0) { showToast('Confira a data e o valor da venda.', 'warning'); return; }
  if (adicionais.some(a => !a.produto_adicional_id || !Number.isInteger(a.quantidade) || a.quantidade < 1 || !Number.isFinite(a.valor_unitario) || a.valor_unitario < 0)) {
    showToast('Confira produto, quantidade e valor de cada adicional.', 'warning'); return;
  }
  const dados = {
    numero_venda: numero,
    cliente: document.getElementById('ixc-edit-cliente').value.trim(),
    vendedor_id: document.getElementById('ixc-edit-vendedor').value || null,
    filial_origem_id: document.getElementById('ixc-edit-origem').value,
    filial_destino_id: document.getElementById('ixc-edit-destino').value,
    plano_id: document.getElementById('ixc-edit-plano').value,
    data_venda: new Date(dataLocal).toISOString(),
    valor,
    observacao: document.getElementById('ixc-edit-observacao').value.trim(),
    fora_filial: document.getElementById('ixc-edit-fora-filial').checked,
  };
  const botoes = ['ixc-edit-save', 'ixc-edit-link'].map(id => document.getElementById(id)).filter(Boolean);
  botoes.forEach(botao => { botao.disabled = true; });
  try {
    const { error } = await window._supabase.rpc('editar_venda_pendente_ixc', {
      p_pendencia_id: edicao.pendenciaId,
      p_venda: dados,
      p_adicionais: adicionais,
      p_vincular: vincular,
    });
    if (error) throw error;
    fecharEdicaoVendaIxc();
    showToast(vincular ? 'Venda corrigida e contrato vinculado.' : 'Correções da venda salvas; ela continua pendente de conferência.', 'success');
    await carregarDados();
    await carregarPendenciasIxc();
  } catch (error) {
    console.error('[salvarEdicaoVendaIxc]', error);
    const mensagem = error.code === 'PGRST202'
      ? 'A função de edição ainda não existe no Supabase. Execute supabase/editar-venda-pendente-ixc.sql no SQL Editor.'
      : error.message || 'Não foi possível salvar as correções da venda.';
    showToast(mensagem, 'error');
  } finally {
    botoes.forEach(botao => { botao.disabled = false; });
  }
}

async function limparPendenciasIxc() {
  if (!window.ADMIN_AUTENTICADO || !window._supabase || _limpezaPendenciasIxcEmAndamento) return;
  const ids = _pendenciasIxcCarregadas.map(item => Number(item.id)).filter(Number.isFinite);
  if (!ids.length) return;
  const confirmacao = confirm(
    `Limpar ${ids.length} pendência(s) da lista? Elas serão marcadas como válidas. As vendas permanecerão cadastradas e continuarão contando nos indicadores.`
  );
  if (!confirmacao) return;

  const botao = document.getElementById('ixc-pending-clear');
  _limpezaPendenciasIxcEmAndamento = true;
  if (botao) {
    botao.disabled = true;
    botao.textContent = 'Limpando…';
  }
  try {
    const { data, error } = await window._supabase.rpc('resolver_conferencias_ixc_lote_validar', {
      p_pendencia_ids: ids,
    });
    if (error) throw error;
    showToast(`${Number(data || 0)} pendência(s) removida(s) da lista. As vendas e métricas foram mantidas.`, 'success');
    await carregarPendenciasIxc();
  } catch (error) {
    console.error('[limparPendenciasIxc]', error);
    const mensagem = error.code === 'PGRST202'
      ? 'A função de limpeza ainda não existe no Supabase. Execute supabase/limpar-pendencias-vendas-ixc.sql no SQL Editor.'
      : error.message || 'Não foi possível limpar as pendências.';
    showToast(mensagem, 'error');
  } finally {
    _limpezaPendenciasIxcEmAndamento = false;
    if (botao) {
      botao.hidden = !_pendenciasIxcCarregadas.length;
      botao.disabled = !_pendenciasIxcCarregadas.length;
      botao.textContent = `Limpar pendências (${_pendenciasIxcCarregadas.length})`;
    }
  }
}

async function resolverConferenciaIxc(id, decisao, cliente, contratoSugerido = '') {
  if (!window.ADMIN_AUTENTICADO || !window._supabase) return;
  if (decisao === 'vincular') {
    const pendencia = _pendenciasIxcCarregadas.find(item => Number(item.id) === Number(id));
    if (pendencia) await abrirEdicaoVendaIxc(Number(id), Number(pendencia.venda_id), contratoSugerido);
    return;
  }
  if (decisao === 'cancelar' && !confirm(`Confirma que a venda de ${cliente} foi cancelada? Ela será arquivada e deixará de contar nos indicadores.`)) return;
  try {
    const { error } = await window._supabase.rpc('resolver_conferencia_venda_ixc', {
      p_pendencia_id: id,
      p_decisao: decisao,
      p_numero_contrato: null,
    });
    if (error) throw error;
    showToast(decisao === 'validar' ? 'Venda mantida como válida.' : decisao === 'cancelar' ? 'Cancelamento registrado e venda arquivada.' : 'Contrato vinculado à venda.', 'success');
    if (decisao === 'cancelar') await carregarDados();
    await carregarPendenciasIxc();
  } catch (error) {
    console.error('[resolverConferenciaIxc]', error);
    showToast(error.message || 'Não foi possível atualizar esta pendência.', 'error');
  }
}

async function analisarImportacaoIxc(event) {
  if (_analiseIxcEmAndamento || _importacaoIxcEmAndamento || _conferenciaIxcEmAndamento) return;
  const arquivo = event.currentTarget.files?.[0];
  const resumo = document.getElementById('ixc-import-summary');
  const wrapper = document.getElementById('ixc-import-preview-wrap');
  const botao = document.getElementById('ixc-import-submit');
  const checkboxConferencia = document.getElementById('ixc-reconciliation-complete');
  const statusConferencia = document.getElementById('ixc-reconciliation-status');
  _linhasImportacaoIxc = [];
  _relatorioIxcParaSugestoes = [];
  if (checkboxConferencia) checkboxConferencia.checked = false;
  if (statusConferencia) statusConferencia.textContent = '';
  atualizarBotaoConferenciaIxc();
  if (resumo) resumo.textContent = '';
  if (wrapper) wrapper.hidden = true;
  if (botao) botao.disabled = true;
  atualizarBotaoLimparImportacaoIxc();
  if (!arquivo) return;
  if (arquivo.size > 10 * 1024 * 1024) {
    if (resumo) resumo.textContent = 'O arquivo excede 10 MB. Exporte um CSV menor.';
    return;
  }
  _analiseIxcEmAndamento = true;
  atualizarBotaoLimparImportacaoIxc();
  try {
    if (!window.ADMIN_AUTENTICADO || !window._supabase) throw new Error('Entre no painel administrativo antes de importar vendas.');
    const linhas = analisarCsvIxc(await arquivo.text());
    const [vendedores, planos, filiais] = await Promise.all([carregarVendedoresComIdIxc(), loadPlanos(), loadFiliais()]);
    const linhasComDestino = linhas.map(linha => {
      const resolucao = resolverFilialDestinoIxc(linha.codigoFilialIxc, filiais, linha.temColunaFilialIxc);
      return { ...linha, filialDestinoId: resolucao.filial?.id ?? null, filialDestinoNome: resolucao.filial?.nome || '', erroFilialDestino: resolucao.erro };
    });
    const linhasAtivas = linhasComDestino.filter(linha => normalizarTextoIxc(linha.status) === 'ativo');
    const contratos = linhasAtivas.map(linha => linha.contrato).filter(Boolean);
    const registrosExistentes = await carregarContratosExistentesIxc(contratos);
    const contratosExistentes = new Map();
    registrosExistentes.forEach(v => {
      const contrato = String(v.numero_venda || '').trim();
      if (!contratosExistentes.has(contrato)) contratosExistentes.set(contrato, []);
      contratosExistentes.get(contrato).push(v.filial_destino_nome || 'filial não identificada');
    });
    const vistosNoArquivo = new Set();
    _linhasImportacaoIxc = linhasComDestino.map(linha => {
      const resultado = { ...linha, podeImportar: false, incluir: false, importada: false, duplicada: false, erro: '' };
      const vendedoresDoCodigo = vendedores.filter(v => String(v.ixc_vendedor_id || '').trim() === linha.ixcVendedorId);
      if (vendedoresDoCodigo.length === 1) resultado.vendedor = vendedoresDoCodigo[0];
      resultado.plano = resolverPlanoIxc(linha.descricaoPlano, planos);
      if (normalizarTextoIxc(linha.status) !== 'ativo') { resultado.erro = 'Contrato não está ativo'; return resultado; }
      if (linha.erroFilialDestino) { resultado.erro = linha.erroFilialDestino; return resultado; }
      if (!linha.contrato || !/^\d+$/.test(linha.contrato)) { resultado.erro = 'ID do contrato inválido'; return resultado; }
      const chaveContrato = String(linha.contrato).trim();
      const filiaisExistentes = contratosExistentes.get(chaveContrato);
      if (filiaisExistentes?.length) {
        resultado.duplicada = true;
        resultado.erro = `Contrato já cadastrado em: ${[...new Set(filiaisExistentes)].join(', ')}`;
        return resultado;
      }
      if (vistosNoArquivo.has(chaveContrato)) { resultado.duplicada = true; resultado.erro = 'Contrato repetido no CSV; cada contrato pode ser importado uma única vez'; return resultado; }
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
      if (!resultado.plano) { resultado.erro = diagnosticarPlanoIxc(linha.descricaoPlano, planos); return resultado; }
      resultado.valor = obterValorExplicitoRelatorioIxc(linha.descricaoPlano) ?? obterValorPlanoIxc(resultado.plano);
      if (resultado.valor == null) { resultado.erro = 'Plano sem valor cadastrado'; return resultado; }
      vistosNoArquivo.add(chaveContrato);
      resultado.podeImportar = true;
      resultado.incluir = true;
      return resultado;
    });
    renderizarPreviaIxc();
    atualizarBotaoConferenciaIxc();
    await carregarPendenciasIxc();
  } catch (error) {
    console.error('[analisarImportacaoIxc]', error);
    if (resumo) resumo.textContent = error.message || 'Não foi possível analisar o arquivo.';
  } finally {
    _analiseIxcEmAndamento = false;
    atualizarBotaoLimparImportacaoIxc();
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
  atualizarBotaoLimparImportacaoIxc();
  const inputArquivo = document.getElementById('ixc-csv-file');
  if (inputArquivo) inputArquivo.disabled = true;
  let importadas = 0;
  let duplicadas = 0;
  let falhas = 0;
  try {
    // Revalida no momento da confirmação, pois outro usuário pode ter
    // importado o mesmo contrato depois que a prévia foi carregada.
    const existentesAgora = await carregarContratosExistentesIxc(selecionadas.map(linha => linha.contrato));
    const contratosAgora = new Set(existentesAgora.map(v => String(v.numero_venda || '').trim()));
    selecionadas.forEach(linha => {
      if (!contratosAgora.has(String(linha.contrato || '').trim())) return;
      linha.duplicada = true;
      linha.incluir = false;
      const filiais = [...new Set(existentesAgora
        .filter(v => String(v.numero_venda || '').trim() === String(linha.contrato || '').trim())
        .map(v => v.filial_destino_nome || 'filial não identificada'))];
      linha.erro = `Contrato já cadastrado em: ${filiais.join(', ')}`;
      duplicadas++;
    });
    const paraImportar = selecionadas.filter(linha => !linha.duplicada);
    for (const linha of paraImportar) {
      try {
        const filialOrigemId = Number(linha.vendedor.filial_id);
        await saveVenda({
          vendedor_id: linha.vendedor.id,
          filial_origem_id: filialOrigemId,
          filial_destino_id: Number(linha.filialDestinoId),
          plano_id: linha.plano.id,
          data_venda: linha.dataVenda,
          valor: linha.valor,
          cliente: linha.cliente,
          numero_venda: linha.contrato,
          observacao: `Importado do IXC${linha.codigoFilialIxc ? `; filial IXC ${linha.codigoFilialIxc}` : ''}; descrição original do plano: ${linha.descricaoPlano}`,
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
    atualizarBotaoLimparImportacaoIxc();
    if (inputArquivo) inputArquivo.disabled = false;
    botao.textContent = 'Importar vendas novas';
    renderizarPreviaIxc();
  }
}
