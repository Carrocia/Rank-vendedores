// Importação controlada de contratos ativos exportados do IXC em CSV.
// A coluna Filial define o destino quando presente; a origem vem do cadastro do vendedor.
let _linhasImportacaoIxc = [];
let _relatorioIxcParaSugestoes = [];
let _pendenciasIxcCarregadas = [];
let _revisoesImportacaoIxc = [];
let _filiaisFiltroPendenciasIxc = null;
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
  const diferencas = document.getElementById('ixc-reconciliation-diff');
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
  if (diferencas) { diferencas.hidden = true; diferencas.replaceChildren(); }
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

function normalizarNomePlanoIxc(valor) {
  return normalizarTextoIxc(valor).replace(/^plano(?: de)?\s+/, '').trim();
}

function tipoPlanoValorVariavelIxc(descricao, plano) {
  const nomes = [descricao, plano?.nome].map(normalizarNomePlanoIxc);
  if (nomes.some(nome => nome.includes('telefonia nbs'))) return 'telefonia_nbs';
  if (nomes.some(nome => nome.includes('padrao uni'))) return 'padrao_uni';
  if (nomes.some(nome => nome === 'servico' || nome.startsWith('servico '))) return 'servico';
  return '';
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
  const descricaoBasePlano = String(descricao || '').replace(/(?:r\$\s*)?\d{1,4}[,.]\d{2}\s*$/i, '');
  const descSemPrefixoPlano = normalizarNomePlanoIxc(descricaoBasePlano);
  const exato = planos.filter(plano => {
    const nome = normalizarNomePlanoIxc(plano.nome || '');
    const nomeComVelocidade = normalizarNomePlanoIxc(`${plano.nome || ''} ${plano.velocidade_mb || ''}mb`);
    return nome === descSemPrefixoPlano || nomeComVelocidade === descSemPrefixoPlano || normalizarTextoIxc(plano.nome || '') === desc;
  });
  const exatosAtivos = exato.filter(plano => plano.ativo !== false);
  if (exatosAtivos.length === 1) return exatosAtivos[0];
  if (exatosAtivos.length > 1) return null;
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
  const ehImportavel = linha => linha.podeImportar || linha.podeImportarComRevisao;
  const prontos = _linhasImportacaoIxc.filter(linha => ehImportavel(linha) && linha.incluir && !linha.importada && !linha.duplicada);
  const duplicadas = _linhasImportacaoIxc.filter(linha => linha.duplicada).length;
  const selecionadas = _linhasImportacaoIxc.filter(linha => ehImportavel(linha) && !linha.importada && !linha.duplicada).length;
  const revisoes = _linhasImportacaoIxc.filter(linha => linha.podeImportarComRevisao && !linha.importada && !linha.duplicada).length;
  const bloqueadas = _linhasImportacaoIxc.filter(linha => linha.aguardaRevisao && !linha.podeImportarComRevisao && !linha.duplicada).length;
  resumo.innerHTML = `<div class="adm-preview-status">${prontos.length} venda(s) para importar · ${revisoes} será(ão) contabilizada(s) agora com vendedor ou plano pendente de vínculo · ${bloqueadas} linha(s) com dados essenciais inválidos aguardam correção antes de importar · ${duplicadas} duplicada(s) ignorada(s). ${selecionadas !== prontos.length ? `${selecionadas - prontos.length} desmarcada(s) para não importar.` : ''}</div>`;
  corpo.innerHTML = _linhasImportacaoIxc.map((linha, indice) => {
    const situacao = linha.importada ? (linha.podeImportarComRevisao ? 'Importada · vendedor/plano aguardando vínculo' : linha.requerRevisaoValor ? 'Importada · enviada à conferência de valor' : 'Importada') : linha.duplicada ? 'Já cadastrada' : linha.podeImportarComRevisao ? `Importar e revisar: ${linha.erro}` : linha.erro || (linha.requerRevisaoValor ? 'Importar com R$ 0,00 e revisar valor/adicionais' : linha.podeImportar ? 'Pronta para importar' : 'Não importável');
    const selecionavel = ehImportavel(linha) && !linha.importada && !linha.duplicada;
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
  botao.textContent = revisoes && bloqueadas
    ? 'Importar vendas e organizar revisões'
    : revisoes ? 'Importar vendas com vínculos pendentes'
      : bloqueadas ? 'Enviar linhas incompletas à revisão' : 'Importar vendas novas';
  botao.disabled = _importacaoIxcEmAndamento || (prontos.length === 0 && bloqueadas === 0);
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

function linhasAtivasFilialAtualIxc() {
  const filialAtualId = Number(window.FILIAL_ATUAL_ID);
  if (!Number.isInteger(filialAtualId) || filialAtualId <= 0) return [];
  return _linhasImportacaoIxc.filter(linha =>
    normalizarTextoIxc(linha.status) === 'ativo' &&
    Number(linha.filialDestinoId) === filialAtualId &&
    /^\d+$/.test(String(linha.contrato || '').trim())
  );
}

function obterMesAtivacaoIxc(linha) {
  for (const valor of [linha?.dataAtivacao, linha?.ultimaAtualizacao]) {
    const correspondencia = String(valor || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!correspondencia) continue;
    const dia = Number(correspondencia[1]);
    const mes = Number(correspondencia[2]);
    const ano = Number(correspondencia[3]);
    const data = new Date(Date.UTC(ano, mes - 1, dia));
    if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) continue;
    return `${ano}-${String(mes).padStart(2, '0')}`;
  }
  return '';
}

function obterContextoConferenciaIxc() {
  const linhas = linhasAtivasFilialAtualIxc();
  const meses = new Set(linhas.map(obterMesAtivacaoIxc).filter(Boolean));
  const datasInvalidas = linhas.some(linha => !obterMesAtivacaoIxc(linha));
  const mes = meses.size === 1 && !datasInvalidas ? [...meses][0] : '';
  return { linhas, mes, meses: [...meses].sort(), datasInvalidas };
}

function primeiroDiaMesSeguinteIxc(mes) {
  const [ano, numeroMes] = String(mes || '').split('-').map(Number);
  if (!Number.isInteger(ano) || !Number.isInteger(numeroMes) || numeroMes < 1 || numeroMes > 12) return '';
  const proximoAno = numeroMes === 12 ? ano + 1 : ano;
  const proximoMes = numeroMes === 12 ? 1 : numeroMes + 1;
  return `${proximoAno}-${String(proximoMes).padStart(2, '0')}-01`;
}

function atualizarBotaoConferenciaIxc() {
  const controles = document.getElementById('ixc-reconciliation-controls');
  const resumoFiliais = document.getElementById('ixc-reconciliation-summary');
  const confirmacao = document.getElementById('ixc-reconciliation-complete');
  const botao = document.getElementById('ixc-reconciliation-submit');
  if (!controles || !confirmacao || !botao) return;
  const contexto = obterContextoConferenciaIxc();
  const linhasComparaveis = contexto.linhas;
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
    const filialAtualNome = window.FILIAL_ATUAL?.nome || [...contagens.values()][0]?.nome || 'filial aberta';
    const periodo = contexto.mes
      ? ` no mês ${escapeHtmlText(new Date(`${contexto.mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))}`
      : '';
    const problemaPeriodo = contexto.meses.length > 1
      ? 'O arquivo contém mais de um mês de ativação nesta filial. Use um relatório mensal.'
      : contexto.datasInvalidas
        ? 'Há contratos sem data de ativação válida nesta filial; confira o arquivo antes de comparar.'
        : 'Não foi possível identificar o mês do relatório pelas datas de ativação.';
    resumoFiliais.innerHTML = totalContratos
      ? `<strong>${totalContratos} contrato(s) ativo(s)${periodo} na filial ${escapeHtmlText(filialAtualNome)}</strong>${contexto.mes ? '' : `<span class="ixc-reconciliation-period-error">${escapeHtmlText(problemaPeriodo)}</span>`}`
      : '';
  }
  const temDados = totalContratos > 0;
  controles.hidden = !temDados;
  botao.disabled = _conferenciaIxcEmAndamento || !confirmacao.checked || !temDados || !contexto.mes;
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
  const filialAtualId = Number(window.FILIAL_ATUAL_ID);
  const contexto = obterContextoConferenciaIxc();
  const linhasAtivas = contexto.mes ? contexto.linhas.filter(linha => obterMesAtivacaoIxc(linha) === contexto.mes) : [];
  const filiais = linhasAtivas.length && Number.isInteger(filialAtualId) ? [filialAtualId] : [];
  const normalizarContrato = valor => String(valor ?? '').replace(/\s+/g, '');
  const contratos = [...new Set(linhasAtivas.map(linha => normalizarContrato(linha.contrato)).filter(Boolean))];
  const diffEl = document.getElementById('ixc-reconciliation-diff');
  if (diffEl) { diffEl.hidden = true; diffEl.replaceChildren(); }
  if (!contexto.mes) {
    showToast('A conferência precisa de um único mês e de datas de ativação válidas no relatório. Confira o arquivo mensal.', 'warning');
    return;
  }
  if (!filiais.length || !contratos.length) {
    showToast(`Não encontrei contratos ativos da filial aberta (${window.FILIAL_ATUAL?.nome || filialAtualId}) neste relatório. Confira o código de filial no arquivo IXC.`, 'warning');
    return;
  }
  _conferenciaIxcEmAndamento = true;
  atualizarBotaoLimparImportacaoIxc();
  if (botao) botao.textContent = 'Conferindo…';
  if (status) status.textContent = 'Comparando os contratos do arquivo com as vendas cadastradas…';
  atualizarBotaoConferenciaIxc();
  try {
    // Faz a comparação no navegador também para que a tela possa mostrar
    // exatamente quais registros do banco não aparecem no CSV, mesmo que a
    // função SQL esteja desatualizada ou não consiga criar a pendência.
    const [ano, numeroMes] = contexto.mes.split('-').map(Number);
    const inicioLocal = `${contexto.mes}-01T00:00:00-04:00`;
    const proximoMes = numeroMes === 12
      ? `${ano + 1}-01-01T00:00:00-04:00`
      : `${ano}-${String(numeroMes + 1).padStart(2, '0')}-01T00:00:00-04:00`;
    const vendasDoMes = await carregarTodasPaginas(() => window._supabase
      .from('vendas_admin')
      .select('id, numero_venda, cliente, data_venda, filial_destino_id')
      .eq('filial_destino_id', filialAtualId)
      .gte('data_venda', inicioLocal)
      .lt('data_venda', proximoMes)
      .order('id', { ascending: true }), 'vendas para conferência do IXC');
    const contratosAtivos = new Set(contratos);
    const ausentesDoRelatorio = vendasDoMes.filter(venda => {
      const contrato = normalizarContrato(venda.numero_venda);
      return !contrato || !contratosAtivos.has(contrato);
    });

    const { data, error } = await window._supabase.rpc('conferir_vendas_ausentes_ixc', {
      p_filial_ids: filiais,
      p_contratos_ativos: contratos,
      p_periodo_inicio: `${contexto.mes}-01`,
      p_periodo_fim: primeiroDiaMesSeguinteIxc(contexto.mes),
    });
    if (error) throw error;
    const total = Number(data || 0);
    const nomeFilialAtual = window.FILIAL_ATUAL?.nome || linhasAtivas[0]?.filialDestinoNome || `Filial ${filialAtualId}`;
    _filiaisFiltroPendenciasIxc = [{ id: filialAtualId, nome: nomeFilialAtual }];
    const mesLabel = new Date(`${contexto.mes}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (status) status.textContent = `Conferência de ${mesLabel} concluída. ${total} venda(s) pendente(s) nova(s) ou revisitada(s).`;
    if (diffEl && ausentesDoRelatorio.length) {
      const linhas = ausentesDoRelatorio.map(venda => {
        const contrato = normalizarContrato(venda.numero_venda);
        const cliente = escapeHtmlText(venda.cliente || 'Cliente sem nome');
        return `<li><strong>${cliente}</strong> · ${contrato ? `contrato ${escapeHtmlText(contrato)}` : 'sem número de contrato cadastrado'}</li>`;
      }).join('');
      diffEl.innerHTML = `<strong>${ausentesDoRelatorio.length} venda(s) cadastrada(s) não aparecem no CSV:</strong><ul>${linhas}</ul>${total === 0 ? '<p>A função do Supabase não criou as pendências. Atualize-a executando <code>supabase/atualizar-deteccao-vendas-ausentes-ixc.sql</code> no SQL Editor e confira novamente.</p>' : ''}`;
      diffEl.hidden = false;
      if (total === 0 && status) status.textContent = `A comparação direta encontrou ${ausentesDoRelatorio.length} venda(s) ausente(s), mas o Supabase não registrou as pendências.`;
    } else if (diffEl) {
      diffEl.innerHTML = '<strong>Conferência direta: todas as vendas cadastradas da filial e do mês aparecem no CSV.</strong>';
      diffEl.hidden = false;
    }
    showToast(
      ausentesDoRelatorio.length && total === 0
        ? `Encontrei ${ausentesDoRelatorio.length} venda(s) ausente(s), mas não consegui criar as pendências no Supabase.`
        : `Conferência de ${mesLabel} concluída: ${total} venda(s) aguardando revisão.`,
      ausentesDoRelatorio.length && total === 0 ? 'warning' : 'success'
    );
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
  const filialAtualId = Number(window.FILIAL_ATUAL_ID);
  if (!Number.isInteger(filialAtualId) || filialAtualId <= 0) {
    _pendenciasIxcCarregadas = [];
    corpo.innerHTML = '<tr><td colspan="7" class="adm-empty-state">Não foi possível identificar a filial aberta. Atualize a página para carregar as pendências com segurança.</td></tr>';
    if (botaoLimpar) botaoLimpar.hidden = true;
    return;
  }
  const consultaPendencias = window._supabase
    .from('vendas_conferencia_ixc')
    .select('id, venda_id, filial_id, numero_venda, situacao, motivo, relatorio_em')
    .eq('situacao', 'pendente')
    .order('relatorio_em', { ascending: false });
  consultaPendencias.eq('filial_id', filialAtualId);
  const { data: pendencias, error } = await consultaPendencias;
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
  const escopo = document.getElementById('ixc-pending-scope');
  if (escopo) {
    escopo.textContent = Number.isInteger(filialAtualId) && filialAtualId > 0
      ? `Filial em foco: ${window.FILIAL_ATUAL?.nome || `Filial ${filialAtualId}`}`
      : 'Filial atual não identificada; atualize a página antes de conferir.';
  }
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
    const revisaoDeValor = String(pendencia.motivo || '').startsWith('revisar_valor_');
    const motivoPendente = pendencia.motivo === 'revisar_valor_variavel_ixc'
      ? '<div class="ixc-pending-reason">Plano sem valor fixo: confira o valor e os adicionais.</div>'
      : pendencia.motivo === 'revisar_valor_zero_legado'
        ? '<div class="ixc-pending-reason">Valor do plano cadastrado como zero: confira o valor e os adicionais.</div>'
        : '<div class="ixc-pending-reason">Contrato ausente no relatório completo do IXC. Confira se foi cancelado.</div>';
    const sugestoes = venda && !revisaoDeValor
      ? sugerirContratosIxc(venda, relatorioAtivo)
      : [];
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
      <td>${escapar(venda?.cliente || 'Cliente sem nome')}${motivoPendente}</td>
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

async function carregarRevisoesImportacaoIxc() {
  const corpo = document.getElementById('ixc-import-review-body');
  if (!corpo || !window.ADMIN_AUTENTICADO || !window._supabase) return;
  const filialId = Number(window.FILIAL_ATUAL_ID);
  if (!Number.isInteger(filialId) || filialId <= 0) return;
  corpo.innerHTML = '<tr><td colspan="6" class="adm-empty-state">Carregando linhas para revisão…</td></tr>';
  const { data, error } = await window._supabase.from('vendas_importacao_revisao_ixc')
    .select('*').eq('filial_contexto_id', filialId).eq('situacao', 'pendente').order('criado_em', { ascending: false });
  if (error) {
    console.error('[carregarRevisoesImportacaoIxc]', error);
    const mensagem = error.code === '42P01' || error.code === 'PGRST205'
      ? 'Ative a fila de revisão executando supabase/revisao-importacao-vendas-ixc.sql no SQL Editor do Supabase.'
      : error.message || 'Não foi possível carregar as linhas em revisão.';
    corpo.innerHTML = `<tr><td colspan="6" class="adm-empty-state">${escapeHtmlText(mensagem)}</td></tr>`;
    return;
  }
  _revisoesImportacaoIxc = data || [];
  if (!_revisoesImportacaoIxc.length) {
    corpo.innerHTML = '<tr><td colspan="6" class="adm-empty-state">Nenhuma linha incompleta aguardando correção.</td></tr>';
    return;
  }
  const escapar = valor => escapeHtmlText(String(valor ?? '—'));
  corpo.innerHTML = _revisoesImportacaoIxc.map(item => `<tr>
    <td>${escapar(item.numero_venda || 'Não identificado')}</td>
    <td>${escapar(item.cliente || 'Cliente não identificado')}</td>
    <td>${escapar(item.descricao_plano || 'Plano não identificado')}</td>
    <td>${escapar(item.vendedor_ixc_id || 'Sem código')}</td>
    <td>${escapar(item.motivo)}</td>
    <td><button type="button" class="adm-btn adm-btn-primary adm-btn-small" data-ixc-review-edit="${Number(item.id)}">${item.venda_id ? 'Vincular e atualizar venda' : 'Corrigir e importar'}</button></td>
  </tr>`).join('');
  corpo.querySelectorAll('[data-ixc-review-edit]').forEach(button => button.addEventListener('click', () => {
    abrirEdicaoRevisaoImportacaoIxc(Number(button.dataset.ixcReviewEdit));
  }));
}

async function enfileirarLinhasImportacaoIxc(linhas) {
  const filialId = Number(window.FILIAL_ATUAL_ID);
  if (!Number.isInteger(filialId) || filialId <= 0) throw new Error('Abra uma filial antes de enviar linhas incompletas à revisão.');
  const linhasFila = linhas.map(linha => {
    const dadosOrigem = {
      contrato: linha.contrato, cliente: linha.cliente, descricaoPlano: linha.descricaoPlano,
      ixcVendedorId: linha.ixcVendedorId, codigoFilialIxc: linha.codigoFilialIxc,
      dataAtivacao: linha.dataAtivacao, ultimaAtualizacao: linha.ultimaAtualizacao,
      status: linha.status, linha: linha.linha,
    };
    const chave = linha.contrato ? `contrato:${linha.contrato}` : `linha:${linha.linha}:${JSON.stringify(dadosOrigem)}`;
    return {
      filial_contexto_id: filialId, chave_origem: chave,
      numero_venda: linha.contrato || null, cliente: linha.cliente || null,
      descricao_plano: linha.descricaoPlano || null, vendedor_ixc_id: linha.ixcVendedorId || null,
      filial_ixc_id: linha.codigoFilialIxc || null, motivo: linha.erro || 'Dados incompletos no relatório.',
      dados_origem: dadosOrigem, situacao: 'pendente',
    };
  });
  if (!linhasFila.length) return 0;
  const { error } = await window._supabase.from('vendas_importacao_revisao_ixc')
    .upsert(linhasFila, { onConflict: 'filial_contexto_id,chave_origem', ignoreDuplicates: true });
  if (error) throw error;
  return linhasFila.length;
}

function idNumericoIxc(id) {
  const valor = document.getElementById(id)?.value?.trim() || '';
  return /^\d+$/.test(valor) ? valor : null;
}

function definirOpcoesSelectIxc(id, itens, valorAtual, rotulo, placeholder) {
  const select = document.getElementById(id);
  if (!select) return;
  const idAtual = valorAtual == null || String(valorAtual).trim().toLowerCase() === 'null'
    ? ''
    : String(valorAtual).trim();
  select.replaceChildren(new Option(placeholder, ''));
  (itens || []).forEach(item => select.add(new Option(rotulo(item), String(item.id))));
  if (idAtual && ![...select.options].some(option => option.value === idAtual)) {
    select.add(new Option(`Cadastro atual (${idAtual})`, idAtual));
  }
  select.value = idAtual;
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

async function abrirEdicaoVendaIxc(pendenciaId, vendaId, contratoSugerido = '', revisaoImportacao = null) {
  if (!window.ADMIN_AUTENTICADO || !window._supabase) return;
  const backdrop = document.getElementById('ixc-edit-backdrop');
  try {
    const [vendaResult, filiaisResult, vendedoresResult, planosResult, produtosResult, adicionaisResult] = await Promise.all([
      revisaoImportacao?.venda_id
        ? window._supabase.from('vendas_admin').select('*').eq('id', revisaoImportacao.venda_id).maybeSingle()
        : revisaoImportacao ? Promise.resolve({ data: null, error: null }) : window._supabase.from('vendas_admin').select('*').eq('id', vendaId).maybeSingle(),
      window._supabase.from('filiais').select('id, nome, ativo').order('nome'),
      window._supabase.from('vendedores').select('id, nome, filial_id, ativo').order('nome'),
      window._supabase.from('planos').select('*').order('nome'),
      window._supabase.from('produtos_adicionais').select('*').order('nome'),
      window._supabase.from('venda_adicionais').select('produto_adicional_id, quantidade, valor_unitario, produtos_adicionais(nome)').eq('venda_id', vendaId).order('id'),
    ]);
    for (const result of [vendaResult, filiaisResult, vendedoresResult, planosResult, produtosResult, adicionaisResult]) {
      if (result.error) throw result.error;
    }
    const venda = revisaoImportacao && !vendaResult.data ? (() => {
      const bruto = revisaoImportacao.dados_origem || {};
      const vendedor = (vendedoresResult.data || []).find(item => String(item.ixc_vendedor_id || '').trim() === String(revisaoImportacao.vendedor_ixc_id || ''));
      const plano = resolverPlanoIxc(revisaoImportacao.descricao_plano || '', planosResult.data || []);
      const dataAtivacao = bruto.dataAtivacao || String(bruto.ultimaAtualizacao || '').match(/^\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || '';
      const dataVenda = converterAtivacaoComHoraAtualizacaoIxcParaIso(dataAtivacao, bruto.ultimaAtualizacao) || '';
      const filiais = filiaisResult.data || [];
      const destino = resolverFilialDestinoIxc(revisaoImportacao.filial_ixc_id, filiais, Boolean(revisaoImportacao.filial_ixc_id));
      const valor = obterValorExplicitoRelatorioIxc(revisaoImportacao.descricao_plano || '') ?? obterValorPlanoIxc(plano);
      return {
        id: null, vendedor_id: vendedor?.id || null, vendedor_nome: vendedor?.nome || '',
        plano_id: plano?.id || null, filial_origem_id: vendedor?.filial_id || '',
        filial_destino_id: destino.filial?.id || (revisaoImportacao.filial_ixc_id ? '' : Number(window.FILIAL_ATUAL_ID)),
        numero_venda: revisaoImportacao.numero_venda || '', cliente: revisaoImportacao.cliente || '',
        data_venda: dataVenda, valor: valor ?? 0, fora_filial: false,
        observacao: `Importado do IXC; descrição original do plano: ${revisaoImportacao.descricao_plano || 'não identificada'}`,
      };
    })() : vendaResult.data;
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
    document.getElementById('ixc-edit-vendedor').onchange = event => {
      const vendedor = _opcoesEdicaoVendaIxc.vendedores.find(item => String(item.id) === event.target.value);
      const origem = document.getElementById('ixc-edit-origem');
      if (vendedor && origem) origem.value = String(vendedor.filial_id);
    };
    document.getElementById('ixc-edit-numero').value = contratoSugerido || venda.numero_venda || '';
    document.getElementById('ixc-edit-cliente').value = venda.cliente || '';
    document.getElementById('ixc-edit-data').value = dataHoraLocalInputIxc(venda.data_venda);
    document.getElementById('ixc-edit-valor').value = Number(venda.valor_plano ?? venda.valor ?? 0).toFixed(2);
    document.getElementById('ixc-edit-fora-filial').checked = venda.fora_filial === true;
    document.getElementById('ixc-edit-observacao').value = venda.observacao || '';
    const subtitulo = document.getElementById('ixc-edit-subtitle');
    if (subtitulo) subtitulo.textContent = `${venda.cliente || 'Venda sem cliente'} · ${venda.vendedor_nome || 'Sem vendedor'} · ${formatarMoedaCurtaIxc(venda.valor_total || venda.valor_plano || venda.valor || 0)}. Corrija os campos necessários antes de salvar.`;
    const blocoAdicionais = document.querySelector('.ixc-edit-additions');
    if (blocoAdicionais) blocoAdicionais.hidden = Boolean(revisaoImportacao);
    const titulo = document.getElementById('ixc-edit-title');
    if (titulo) titulo.textContent = revisaoImportacao ? 'Corrigir linha do relatório IXC' : 'Editar venda pendente';
    const botaoSalvar = document.getElementById('ixc-edit-save');
    const botaoVincular = document.getElementById('ixc-edit-link');
    if (botaoSalvar) botaoSalvar.hidden = Boolean(revisaoImportacao);
    if (botaoVincular) botaoVincular.textContent = revisaoImportacao?.venda_id ? 'Salvar vínculos da venda' : revisaoImportacao ? 'Corrigir e importar venda' : 'Salvar e vincular contrato';
    renderizarAdicionaisEdicaoIxc(revisaoImportacao ? [] : _opcoesEdicaoVendaIxc.adicionais);
    _edicaoVendaPendenteIxc = { pendenciaId, vendaId: revisaoImportacao?.venda_id || vendaId, revisaoImportacaoId: revisaoImportacao?.id || null };
    backdrop.hidden = false;
    document.body.classList.add('adm-modal-open');
    document.getElementById('ixc-edit-numero')?.focus();
  } catch (error) {
    console.error('[abrirEdicaoVendaIxc]', error);
    showToast(error.message || 'Não foi possível abrir a venda para edição.', 'error');
  }
}

async function abrirEdicaoRevisaoImportacaoIxc(id) {
  const item = _revisoesImportacaoIxc.find(revisao => Number(revisao.id) === Number(id));
  if (!item) return;
  await abrirEdicaoVendaIxc(null, null, '', item);
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
    vendedor_id: idNumericoIxc('ixc-edit-vendedor'),
    filial_origem_id: idNumericoIxc('ixc-edit-origem'),
    filial_destino_id: idNumericoIxc('ixc-edit-destino'),
    plano_id: idNumericoIxc('ixc-edit-plano'),
    data_venda: new Date(dataLocal).toISOString(),
    valor,
    observacao: document.getElementById('ixc-edit-observacao').value.trim(),
    fora_filial: document.getElementById('ixc-edit-fora-filial').checked,
  };
  if (!dados.filial_origem_id || !dados.filial_destino_id || !dados.plano_id || !dados.vendedor_id) {
    showToast('Selecione vendedor, plano e filiais usando as opções da lista.', 'warning');
    return;
  }
  const botoes = ['ixc-edit-save', 'ixc-edit-link'].map(id => document.getElementById(id)).filter(Boolean);
  botoes.forEach(botao => { botao.disabled = true; });
  try {
    const { error } = edicao.revisaoImportacaoId
      ? await window._supabase.rpc('importar_revisao_venda_ixc', {
        p_revisao_id: edicao.revisaoImportacaoId,
        p_venda: dados,
      })
      : await window._supabase.rpc('editar_venda_pendente_ixc', {
        p_pendencia_id: edicao.pendenciaId,
        p_venda: dados,
        p_adicionais: adicionais,
        p_vincular: vincular,
      });
    if (error) throw error;
    fecharEdicaoVendaIxc();
    showToast(edicao.revisaoImportacaoId
      ? edicao.vendaId ? 'Vínculos da venda atualizados; ela já estava contabilizada.' : 'Linha corrigida e venda importada para os indicadores.'
      : vincular ? 'Venda corrigida e contrato vinculado.' : 'Correções da venda salvas; ela continua pendente de conferência.', 'success');
    await carregarDados();
    await carregarPendenciasIxc();
    await carregarRevisoesImportacaoIxc();
  } catch (error) {
    console.error('[salvarEdicaoVendaIxc]', error);
    const mensagemBanco = String(error.message || '');
    const erroBigintNulo = /invalid input syntax for type bigint:\s*"null"/i.test(mensagemBanco);
    const mensagem = erroBigintNulo
      ? 'O Supabase está executando uma versão antiga da função de importação. Execute novamente supabase/revisao-importacao-vendas-ixc.sql e supabase/revisao-valor-planos-ixc.sql no projeto correto; depois recarregue a página.'
      : error.code === 'PGRST202'
        ? 'O Supabase não encontrou a função no cache da API. Execute o arquivo supabase/editar-venda-pendente-ixc.sql por completo no projeto correto e atualize a página.'
        : error.code === '42501'
          ? 'O banco negou a permissão para editar esta venda. Confirme que você está autenticado como administrador e execute o GRANT do arquivo SQL da função correspondente.'
          : mensagemBanco || 'Não foi possível salvar as correções da venda.';
    showToast(mensagem, 'error');
  } finally {
    botoes.forEach(botao => { botao.disabled = false; });
  }
}

async function limparPendenciasIxc() {
  if (!window.ADMIN_AUTENTICADO || !window._supabase || _limpezaPendenciasIxcEmAndamento) return;
  const ids = _pendenciasIxcCarregadas.map(item => Number(item.id)).filter(Number.isFinite);
  if (!ids.length) return;
  const escopoTexto = ` da filial ${window.FILIAL_ATUAL?.nome || window.FILIAL_ATUAL_ID}`;
  const confirmacao = confirm(
    `Limpar ${ids.length} pendência(s)${escopoTexto}? Elas serão marcadas como válidas. As vendas permanecerão cadastradas e continuarão contando nos indicadores.`
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
  const diferencasConferencia = document.getElementById('ixc-reconciliation-diff');
  _linhasImportacaoIxc = [];
  _relatorioIxcParaSugestoes = [];
  if (checkboxConferencia) checkboxConferencia.checked = false;
  if (statusConferencia) statusConferencia.textContent = '';
  if (diferencasConferencia) { diferencasConferencia.hidden = true; diferencasConferencia.replaceChildren(); }
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
      resultado.tipoPlanoValorVariavel = tipoPlanoValorVariavelIxc(linha.descricaoPlano, resultado.plano);
      resultado.requerRevisaoValor = Boolean(resultado.tipoPlanoValorVariavel);
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
        resultado.vendedorPendente = true;
        resultado.motivoVendedor = vendedoresDoCodigo.length > 1 ? 'ID IXC associado a mais de um vendedor' : 'Vendedor IXC sem cadastro único';
      } else {
        resultado.vendedor = vendedoresDoCodigo[0];
      }
      resultado.filialOrigemId = resultado.vendedor?.filial_id || resultado.filialDestinoId || Number(window.FILIAL_ATUAL_ID);
      resultado.filialOrigemNome = filiais.find(f => String(f.id) === String(resultado.filialOrigemId))?.nome || '';
      const dataAtivacao = linha.dataAtivacao || String(linha.ultimaAtualizacao).trim().match(/^\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] || '';
      const horaAtualizacao = extrairHoraAtualizacaoIxc(linha.ultimaAtualizacao);
      const instante = converterAtivacaoComHoraAtualizacaoIxcParaIso(dataAtivacao, linha.ultimaAtualizacao);
      if (!instante) { resultado.erro = 'Data de ativação ou hora da última atualização inválida'; return resultado; }
      resultado.dataAtivacao = dataAtivacao;
      resultado.horaAtualizacao = horaAtualizacao;
      resultado.dataVenda = instante;
      if (!resultado.plano) {
        resultado.planoPendente = true;
        resultado.motivoPlano = diagnosticarPlanoIxc(linha.descricaoPlano, planos);
      }
      resultado.valor = resultado.requerRevisaoValor
        ? 0
        : obterValorExplicitoRelatorioIxc(linha.descricaoPlano) ?? obterValorPlanoIxc(resultado.plano);
      if (resultado.valor == null) {
        resultado.valorPendente = true;
        resultado.valor = 0;
      }
      const motivosVinculo = [resultado.motivoVendedor, resultado.motivoPlano, resultado.valorPendente ? 'Valor iniciado em R$ 0,00; revisar o valor praticado' : ''].filter(Boolean);
      vistosNoArquivo.add(chaveContrato);
      resultado.podeImportarComRevisao = Boolean(motivosVinculo.length);
      resultado.erro = motivosVinculo.join(' · ');
      resultado.podeImportar = !resultado.podeImportarComRevisao;
      resultado.incluir = true;
      return resultado;
    });
    _linhasImportacaoIxc.forEach(linha => {
      if (linha.erro && !linha.duplicada && normalizarTextoIxc(linha.status) === 'ativo') linha.aguardaRevisao = true;
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
  const selecionadas = _linhasImportacaoIxc.filter(linha => (linha.podeImportar || linha.podeImportarComRevisao) && linha.incluir && !linha.importada && !linha.duplicada);
  const paraRevisao = _linhasImportacaoIxc.filter(linha => linha.aguardaRevisao && !linha.podeImportarComRevisao && !linha.revisaoSalva && !linha.duplicada);
  if (!selecionadas.length && !paraRevisao.length) { showToast('Não há vendas selecionadas nem linhas incompletas para enviar à revisão.', 'warning'); return; }
  botao.disabled = true;
  botao.textContent = 'Importando…';
  _importacaoIxcEmAndamento = true;
  atualizarBotaoLimparImportacaoIxc();
  const inputArquivo = document.getElementById('ixc-csv-file');
  if (inputArquivo) inputArquivo.disabled = true;
  let importadas = 0;
  let revisoesValor = 0;
  let vinculosPendentes = 0;
  let linhasEmRevisao = 0;
  let duplicadas = 0;
  let falhas = 0;
  try {
    if (paraRevisao.length) {
      linhasEmRevisao = await enfileirarLinhasImportacaoIxc(paraRevisao);
      paraRevisao.forEach(linha => { linha.revisaoSalva = true; });
      await carregarRevisoesImportacaoIxc();
    }
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
        const filialOrigemId = Number(linha.filialOrigemId || linha.vendedor?.filial_id || window.FILIAL_ATUAL_ID);
        const dadosVenda = {
          vendedor_id: linha.vendedor?.id || null,
          filial_origem_id: filialOrigemId,
          filial_destino_id: Number(linha.filialDestinoId),
          plano_id: linha.plano?.id || null,
          data_venda: linha.dataVenda,
          valor: linha.valor,
          cliente: linha.cliente,
          numero_venda: linha.contrato,
          observacao: `Importado do IXC${linha.codigoFilialIxc ? `; filial IXC ${linha.codigoFilialIxc}` : ''}; descrição original do plano: ${linha.descricaoPlano}`,
          fora_filial: false,
        };
        if (linha.podeImportarComRevisao) {
          const dadosOrigem = {
            contrato: linha.contrato, cliente: linha.cliente, descricaoPlano: linha.descricaoPlano,
            ixcVendedorId: linha.ixcVendedorId, codigoFilialIxc: linha.codigoFilialIxc,
            dataAtivacao: linha.dataAtivacao, ultimaAtualizacao: linha.ultimaAtualizacao,
            status: linha.status, linha: linha.linha,
          };
          const revisao = {
            filial_contexto_id: Number(window.FILIAL_ATUAL_ID),
            chave_origem: linha.contrato ? `contrato:${linha.contrato}` : `linha:${linha.linha}:${JSON.stringify(dadosOrigem)}`,
            descricao_plano: linha.descricaoPlano,
            vendedor_ixc_id: linha.ixcVendedorId,
            filial_ixc_id: linha.codigoFilialIxc,
            motivo: linha.erro || 'Vínculo de vendedor ou plano pendente.',
            dados_origem: dadosOrigem,
          };
          await window._supabase.rpc('registrar_venda_ixc_com_revisao', { p_venda: dadosVenda, p_revisao: revisao }).then(({ error }) => { if (error) throw error; });
          linha.enviadaConferenciaVinculo = true;
          vinculosPendentes++;
        } else if (linha.requerRevisaoValor) {
          const { error } = await window._supabase.rpc('importar_venda_variavel_ixc', { p_venda: dadosVenda });
          if (error) throw error;
          linha.enviadaConferenciaValor = true;
          revisoesValor++;
        } else {
          await saveVenda(dadosVenda);
        }
        linha.importada = true;
        linha.incluir = false;
        importadas++;
      } catch (error) {
        if (/já foi registrado/i.test(error.message || '')) {
          linha.duplicada = true;
          linha.erro = 'Contrato já cadastrado';
          duplicadas++;
        } else {
          linha.erro = /invalid input syntax for type bigint:\s*"null"/i.test(error.message || '')
            ? 'A função SQL de importação ainda converte "null" em bigint. Execute novamente supabase/revisao-valor-planos-ixc.sql e supabase/revisao-importacao-vendas-ixc.sql.'
            : linha.podeImportarComRevisao && error.code === 'PGRST202'
            ? 'Ative a revisão sem vínculo: execute supabase/revisao-importacao-vendas-ixc.sql no SQL Editor.'
            : linha.requerRevisaoValor && error.code === 'PGRST202'
              ? 'Ative a função de importação especial: execute supabase/revisao-valor-planos-ixc.sql no SQL Editor.'
            : error.message || 'Falha ao gravar a venda';
          falhas++;
        }
      }
      renderizarPreviaIxc();
    }
    if (importadas) await carregarDados();
    const revisoesImportadas = paraImportar.filter(linha => linha.importada && (linha.requerRevisaoValor || linha.podeImportarComRevisao));
    if (revisoesImportadas.length) {
      const filiaisParaRevisao = new Map(revisoesImportadas.map(linha => [
        String(linha.filialDestinoId),
        linha.filialDestinoNome || `Filial ${linha.filialDestinoId}`,
      ]));
      _filiaisFiltroPendenciasIxc = [...filiaisParaRevisao].map(([id, nome]) => ({ id: Number(id), nome }));
      await carregarPendenciasIxc();
      await carregarRevisoesImportacaoIxc();
    }
    if (resumo) resumo.innerHTML = `<div class="adm-preview-status">Importação concluída: ${importadas} venda(s) registrada(s), ${linhasEmRevisao} linha(s) com dados essenciais aguardando correção, ${revisoesValor} venda(s) já contabilizada(s) e aguardando vínculo ou revisão de valor, ${duplicadas} duplicada(s) ignorada(s), ${falhas} falha(s).</div>`;
    const mensagemRevisao = vinculosPendentes ? ` ${vinculosPendentes} já contam nas vendas e aguardam vínculo de vendedor/plano.` : '';
    const mensagemValor = revisoesValor ? ` ${revisoesValor} venda(s) aguardam conferência de valor.` : '';
    showToast(`${importadas} venda(s) importada(s), ${linhasEmRevisao} linha(s) aguardam dados essenciais.${mensagemRevisao}${mensagemValor}`, falhas ? 'warning' : 'success');
  } catch (error) {
    console.error('[confirmarImportacaoIxc]', error);
    const mensagem = ['42P01', 'PGRST205'].includes(error.code)
      ? 'A fila de revisão ainda não foi criada. Execute supabase/revisao-importacao-vendas-ixc.sql no SQL Editor do Supabase e tente novamente.'
      : error.message || 'A importação não foi concluída.';
    showToast(mensagem, 'error');
  } finally {
    _importacaoIxcEmAndamento = false;
    atualizarBotaoLimparImportacaoIxc();
    if (inputArquivo) inputArquivo.disabled = false;
    botao.textContent = 'Importar vendas novas';
    renderizarPreviaIxc();
  }
}
