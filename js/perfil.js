/* =========================================================================
   PERFIL DO MUNICÍPIO — ficha técnica de um município só (o selecionado no
   topo da página), pensada pra ser impressa/enviada a um gestor: todos os
   indicadores do ano com a média estadual e da mesorregião como referência,
   posição no estado, variação em relação ao ano anterior e a trajetória de
   cada indicador na série inteira.
   ========================================================================= */

/* faixa de ±10% em torno da média estadual tratada como "próximo da média" — evita
   rotular como "pior que a média" um município 0,3 ponto acima dela. */
const TOLERANCIA_MEDIA = 0.10;

function situacaoFrenteMedia(valor, mediaRef, chave){
  if(valor===null || mediaRef===null || mediaRef===0) return null;
  const razao = (valor - mediaRef)/Math.abs(mediaRef);
  if(Math.abs(razao) <= TOLERANCIA_MEDIA) return { classe:'tag-neutra', texto:'Próximo da média' };
  const pior = maiorEhPior(chave) ? razao > 0 : razao < 0;
  return pior ? { classe:'tag-alerta', texto:'Pior que a média' } : { classe:'tag-ok', texto:'Melhor que a média' };
}

/* posição do valor entre os municípios com dado (1ª = maior valor = pior em déficit/doença) */
function posicaoNoEstado(dataAno, m, chave){
  const comDado = dataAno.filter(d => valorIndicador(d, chave) !== null);
  const pos = comDado.indexOf(m);
  if(pos < 0) return null;
  return { pos: rankDesc(comDado.map(d=>valorIndicador(d, chave)))[pos], total: comDado.length };
}

function mediaIndicador(lista, chave){
  return media(lista.map(d=>valorIndicador(d, chave)).filter(v=>v!==null));
}

function renderPerfil(){
  const dataAno = getDataset(state.ano);
  const cabecalho = document.getElementById('perfilCabecalho');
  const cards = document.getElementById('cardsPerfil');
  const tabela = document.getElementById('tabelaPerfil');
  const multiplos = document.getElementById('perfilMultiplos');
  const pontosHost = document.getElementById('perfilPontos');

  if(!dataAno.length){
    cabecalho.innerHTML = '';
    cards.innerHTML = placeholderHTML('Sem dados carregados', 'Aguarde o carregamento de data/processed/painel_pe.json ou rode o pipeline em data/scripts/.');
    tabela.innerHTML = ''; multiplos.innerHTML = ''; pontosHost.innerHTML = '';
    return;
  }

  const m = dataAno[state.municipioIdx] || dataAno[0];
  const mesmaMeso = dataAno.filter(d => d.mesorregiao === m.mesorregiao);

  /* --- cabeçalho --- */
  cabecalho.innerHTML = `
    <div class="perfil-identidade">
      <span class="perfil-sobretitulo">Ficha do município · ${state.ano}</span>
      <h2 class="perfil-nome">${m.nome} <span>— ${m.uf}</span></h2>
      <div class="perfil-chips">
        <span class="chip"><strong>Mesorregião</strong> ${m.mesorregiao || '—'}</span>
        <span class="chip"><strong>População</strong> ${fmt(m.pop)} hab.</span>
        <span class="chip"><strong>Código IBGE</strong> ${m.codigo}</span>
      </div>
    </div>
    <div class="perfil-acoes">
      <button class="btn-export" type="button" data-acao-perfil="comparar">Comparar com outro</button>
      <button class="btn-export" type="button" data-acao-perfil="simular">Simular cenário</button>
      <button class="btn-export" type="button" data-acao-perfil="copiar">Copiar link</button>
      <button class="btn-export btn-export-primary" type="button" data-acao-perfil="imprimir">Relatório executivo (PDF)</button>
    </div>`;

  /* --- cards --- */
  const { completos, idx } = indiceCompletoCache(state.ano, state.peso || 'igual');
  const posIdx = completos.indexOf(m);
  const valorIdx = posIdx >= 0 ? idx[posIdx] : null;
  const rankIdx = posIdx >= 0 ? rankDesc(idx)[posIdx] : null;
  const completosMeso = completos.map((d,i)=>({d, v:idx[i]})).filter(o => o.d.mesorregiao === m.mesorregiao);
  const rankMeso = valorIdx!==null ? completosMeso.filter(o => o.v > valorIdx).length + 1 : null;

  const avaliados = TODOS_INDICADORES
    .map(k => situacaoFrenteMedia(valorIndicador(m,k), mediaIndicador(dataAno,k), k))
    .filter(Boolean);
  const nPior = avaliados.filter(s => s.classe === 'tag-alerta').length;
  const invest = valorIndicador(m, CHAVE_INVESTIMENTO_TOTAL);
  const faltando = INDICADORES_INDICE.filter(k => valorIndicador(m,k) === null);

  cards.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Índice de priorização</span>
      <span class="card-value">${valorIdx===null ? '—' : fmt(valorIdx,1)}</span>
      <span class="card-sub">${valorIdx===null ? `fora do índice: falta ${faltando.map(k=>LABELS[k].toLowerCase()).join(', ')}` : `${rankIdx}ª maior prioridade de ${completos.length} em PE`}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Posição na mesorregião</span>
      <span class="card-value">${rankMeso===null ? '—' : rankMeso+'ª'}</span>
      <span class="card-sub">${rankMeso===null ? 'sem índice calculável neste ano' : `de ${completosMeso.length} municípios do ${m.mesorregiao} com índice`}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Indicadores piores que a média</span>
      <span class="card-value">${avaliados.length ? `${nPior}/${avaliados.length}` : '—'}</span>
      <span class="card-sub">comparado à média estadual (margem de ±${TOLERANCIA_MEDIA*100}%)</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Investimento em saneamento</span>
      <span class="card-value">${invest===null ? '—' : 'R$ '+fmtMoedaCompacta(invest)}</span>
      <span class="card-sub">${invest===null ? 'sem dado no ano (série cobre 2015-2022)' : `R$ de ${PAINEL.investimentoPrecosDe || '—'} por 100 mil hab. · prestador + município + estado`}</span>
    </div>`;

  /* --- tabela de indicadores --- */
  const anoAnterior = getDataset(Number(state.ano)-1);
  const mAnterior = anoAnterior.find(d => d.codigo === m.codigo);
  const linhas = [
    { chave:'indice', rotulo:'Índice de priorização', valor:valorIdx, mediaPE: media(idx), mediaMeso: media(completosMeso.map(o=>o.v)),
      posicao: rankIdx ? {pos:rankIdx, total:completos.length} : null, delta:null, unidade:'/100' },
    ...TODOS_INDICADORES.map(k=>{
      const v = valorIndicador(m,k), vAnt = valorIndicador(mAnterior,k);
      return { chave:k, rotulo:LABELS[k], valor:v, mediaPE:mediaIndicador(dataAno,k), mediaMeso:mediaIndicador(mesmaMeso,k),
        posicao: v===null ? null : posicaoNoEstado(dataAno, m, k), delta: (v===null || vAnt===null) ? null : v-vAnt, unidade:UNIDADE_INDICADOR[k] };
    }),
  ];
  const fmtLinha = (v,l) => l.chave==='indice' ? (v===null?'—':fmt(v,1)) : fmtIndicador(v,l.chave);
  tabela.innerHTML = `<thead><tr><th>Indicador</th><th>Unidade</th><th>${m.nome}</th><th>Média PE</th><th>Média mesorregião</th><th>Posição em PE</th><th>vs. ${Number(state.ano)-1}</th><th>Situação</th></tr></thead><tbody>` +
    linhas.map(l=>{
      const sit = l.chave==='indice' ? situacaoFrenteMedia(l.valor, l.mediaPE, 'indice') : situacaoFrenteMedia(l.valor, l.mediaPE, l.chave);
      const deltaTxt = l.delta===null ? '—' : `<span class="${(maiorEhPior(l.chave) ? l.delta>0 : l.delta<0) ? 'delta-pior' : l.delta===0 ? '' : 'delta-melhor'}">${l.delta>0?'▲ +':l.delta<0?'▼ −':''}${fmt(Math.abs(l.delta),1)}</span>`;
      return `<tr>
        <td>${l.rotulo}</td><td style="text-align:left">${l.unidade}</td>
        <td><strong>${fmtLinha(l.valor,l)}</strong></td><td>${fmtLinha(l.mediaPE,l)}</td><td>${fmtLinha(l.mediaMeso,l)}</td>
        <td>${l.posicao ? `${l.posicao.pos}ª de ${l.posicao.total}` : '—'}</td>
        <td>${deltaTxt}</td>
        <td style="text-align:left; font-family:var(--font-body)">${sit ? `<span class="tag ${sit.classe}">${sit.texto}</span>` : '<span class="hint">sem dado</span>'}</td>
      </tr>`;
    }).join('') + `</tbody>`;
  document.getElementById('perfilTabelaHint').textContent = `— ${state.ano}; posição 1ª = maior valor do estado (mais crítico em déficit e doenças)`;

  /* --- resumo executivo (texto gerado a partir dos mesmos números da ficha) --- */
  document.getElementById('perfilResumo').innerHTML = resumoExecutivo(m, linhas, { completos, idx, posIdx, valorIdx, rankIdx });
  document.getElementById('relatorioData').textContent = new Date().toLocaleDateString('pt-BR');
  document.getElementById('relatorioTitulo').textContent = `${m.nome}-${m.uf} · ${state.ano}`;

  /* --- trajetória: um mini-gráfico por indicador (município × média PE) --- */
  const anos = anosDaSerie();
  const seriesMunicipio = new Map(), seriesMedia = new Map();
  INDICADORES_SERIE.forEach(k=>{
    seriesMunicipio.set(k, anos.map(a => valorIndicador(getDataset(a).find(d=>d.codigo===m.codigo), k)));
    seriesMedia.set(k, estatisticaPorAno(k).map(e=>e.media));
  });
  clear2(multiplos);
  INDICADORES_SERIE.forEach(k=>{
    const cartao = document.createElement('div');
    cartao.className = 'multiplo';
    const temDado = seriesMunicipio.get(k).some(v=>v!==null);
    cartao.innerHTML = `<h3>${LABELS[k]} <span class="hint">${UNIDADE_INDICADOR[k]}</span></h3>`;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label', `Evolução de ${LABELS[k]} em ${m.nome} comparada à média de Pernambuco, ${anos[0]}-${anos[anos.length-1]}`);
    cartao.appendChild(svg);
    multiplos.appendChild(cartao);
    desenharLinhasAnos(svg, { anos, chave:k, W:320, H:170, compacto:true, series:[
      { rotulo:'Média PE', cor:'var(--text-muted)', valores:seriesMedia.get(k), tracejado:true, largura:1.6 },
      { rotulo:m.nome, cor:'var(--bordo)', valores:seriesMunicipio.get(k), largura:2.2 },
    ]});
    if(!temDado){
      const aviso = document.createElement('p');
      aviso.className = 'hint'; aviso.style.display = 'block';
      aviso.textContent = `${m.nome} não tem ${LABELS[k].toLowerCase()} apurado em nenhum ano — só a média do estado aparece.`;
      cartao.appendChild(aviso);
    }
  });
  document.getElementById('legendaPerfil').innerHTML = legendaHTML([
    { rotulo:m.nome, cor:'var(--bordo)' },
    { rotulo:'Média de Pernambuco', cor:'var(--text-muted)', tracejado:true },
  ]);

  /* --- pontos de atenção registrados no município --- */
  const pontos = PONTOS_ATENCAO.filter(p => p.codigo_ibge === m.codigo);
  const ROTULO_CATEGORIA = { agua:'Água', esgoto:'Esgoto', residuos:'Resíduos', outro:'Outro' };
  pontosHost.innerHTML = pontos.length
    ? `<div class="table-scroll"><table class="tabela-relatorio"><thead><tr><th>Categoria</th><th>Endereço / local</th><th>Descrição</th><th>Fonte</th></tr></thead><tbody>` +
      pontos.map(p=>`<tr><td>${ROTULO_CATEGORIA[p.categoria] || p.categoria || '—'}</td><td>${escaparHTML(p.endereco)}</td><td style="text-align:left; font-family:var(--font-body); white-space:normal">${escaparHTML(p.descricao) || '—'}</td><td style="text-align:left; font-family:var(--font-body)">${escaparHTML(p.fonte) || '—'}</td></tr>`).join('') +
      `</tbody></table></div>`
    : `<p class="hint" style="display:block">Nenhum ponto de atenção registrado para ${m.nome} até o momento. Pontos são cadastrados pela equipe de pesquisa no mapa do Dashboard (modo curadoria).</p>`;
}

/* ============ RESUMO EXECUTIVO ============
   Parágrafos em linguagem de gestor montados só com números já exibidos na ficha —
   nenhuma afirmação que o dado não sustente (ex.: não recomenda obra; aponta qual
   componente mais pesa no índice). Indicador sem dado é omitido, nunca estimado. */
function resumoExecutivo(m, linhas, { completos, idx, posIdx, valorIdx, rankIdx }){
  const pars = [];
  const n = completos.length;

  if(valorIdx !== null){
    const quartil = rankIdx <= n/4 ? 'entre os 25% <strong>mais prioritários</strong> do estado'
      : rankIdx > n*3/4 ? 'entre os 25% <strong>menos prioritários</strong> do estado' : 'na faixa <strong>intermediária</strong> de prioridade';
    pars.push(`Em ${state.ano}, <strong>${m.nome}</strong> (${m.mesorregiao}, ${fmt(m.pop)} hab.) tem índice de priorização <strong>${fmt(valorIdx,1)}</strong> de 100 e ocupa a <strong>${rankIdx}ª posição</strong> entre ${n} municípios com dados completos — ${quartil} (${LABEL_PESO[state.peso||'igual']}).`);

    const matrix = buildMatrix(completos, INDICADORES_INDICE);
    const pesos = computeWeights(state.peso || 'igual', matrix);
    const contrib = INDICADORES_INDICE.map((k,j)=>({ k, v: matrix[posIdx][j]*pesos[j]*100 })).sort((a,b)=>b.v-a.v);
    const total = contrib.reduce((s,c)=>s+c.v,0) || 1;
    const sanMaior = contrib.find(c => INDICADORES_DEFICIT.includes(c.k));
    pars.push(`O indicador que mais pesa no índice do município é <strong>${LABELS[contrib[0].k].toLowerCase()}</strong> (${fmt(contrib[0].v,1)} pontos, ${fmt(contrib[0].v/total*100,0)}% do total)` +
      (sanMaior && sanMaior !== contrib[0] ? `; entre os componentes de saneamento, o de maior peso é <strong>${LABELS[sanMaior.k].toLowerCase()}</strong> (${fmt(sanMaior.v,1)} pontos).` : '.'));
  } else {
    const faltando = INDICADORES_INDICE.filter(k => valorIndicador(m,k) === null).map(k=>LABELS[k].toLowerCase());
    pars.push(`Em ${state.ano}, <strong>${m.nome}</strong> (${m.mesorregiao}, ${fmt(m.pop)} hab.) não tem índice de priorização calculado porque falta ${faltando.join(', ')} na fonte oficial. Os demais indicadores estão abaixo.`);
  }

  const situacao = (l) => l.chave === 'indice' ? null : situacaoFrenteMedia(l.valor, l.mediaPE, l.chave);
  const criticos = linhas.filter(l => situacao(l) && situacao(l).classe === 'tag-alerta');
  const favoraveis = linhas.filter(l => situacao(l) && situacao(l).classe === 'tag-ok');
  const lista = (ls) => ls.map(l => `${l.rotulo.toLowerCase()} (${fmtIndicador(l.valor,l.chave)} vs. ${fmtIndicador(l.mediaPE,l.chave)} na média de PE)`).join('; ');
  if(criticos.length) pars.push(`<strong>Pontos críticos</strong> — piores que a média estadual: ${lista(criticos)}.`);
  if(favoraveis.length) pars.push(`<strong>Pontos favoráveis</strong> — melhores que a média estadual: ${lista(favoraveis)}.`);

  /* tendência na régua fixa: primeiro × último ano com índice do município */
  const serie = anosDaSerie().map(a => ({ a, v: valorIndicador(getDataset(a).find(d=>d.codigo===m.codigo), CHAVE_INDICE_FIXO) })).filter(p => p.v !== null);
  if(serie.length >= 2){
    const p0 = serie[0], p1 = serie[serie.length-1], d = p1.v - p0.v;
    const sentido = Math.abs(d) < 1 ? 'ficou estável' : d < 0 ? `<strong>melhorou</strong> (caiu ${fmt(Math.abs(d),1)} pontos)` : `<strong>piorou</strong> (subiu ${fmt(d,1)} pontos)`;
    pars.push(`<strong>Tendência</strong> — no índice de régua fixa (comparável entre anos), o município ${sentido} entre ${p0.a} (${fmt(p0.v,1)}) e ${p1.a} (${fmt(p1.v,1)}). A partir de 2023, água e esgoto vêm do SINISA, com método diferente do SNIS.`);
  }

  /* investimento: ano mais recente com dado */
  const comInvest = anosDaSerie().map(a => {
    const lista = getDataset(a);
    return { a, v: valorIndicador(lista.find(d=>d.codigo===m.codigo), CHAVE_INVESTIMENTO_TOTAL), lista };
  }).filter(p => p.v !== null);
  if(comInvest.length){
    const ult = comInvest[comInvest.length-1];
    const mediana = quantil(ult.lista.map(d=>valorIndicador(d, CHAVE_INVESTIMENTO_TOTAL)).filter(v=>v!==null), .5);
    pars.push(`<strong>Investimento</strong> — em ${ult.a} (último ano com dado), foram investidos R$ ${fmtMoedaCompacta(ult.v)} por 100 mil hab. em água e esgoto (R$ de ${PAINEL.investimentoPrecosDe || '—'}), ${ult.v >= mediana ? 'acima' : 'abaixo'} da mediana estadual de R$ ${fmtMoedaCompacta(mediana)}.`);
  }

  pars.push(`<span class="hint">Texto gerado automaticamente pelo SaneData a partir de dados oficiais (IBGE, DATASUS, SNIS/SINISA). A comparação com a média usa margem de ±${TOLERANCIA_MEDIA*100}%.</span>`);
  return pars.map(p => `<p>${p}</p>`).join('');
}

/* texto vindo do cadastro de pontos de atenção é digitado à mão — nunca injetar como HTML cru */
function escaparHTML(s){
  if(s===null || s===undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
