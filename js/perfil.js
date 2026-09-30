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
      <button class="btn-export" type="button" data-acao-perfil="copiar">Copiar link</button>
      <button class="btn-export btn-export-primary" type="button" data-acao-perfil="imprimir">Imprimir / salvar PDF</button>
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
      <span class="card-sub">${invest===null ? 'sem dado no ano (série cobre 2015-2022)' : 'por 100 mil hab. · prestador + município + estado'}</span>
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

/* texto vindo do cadastro de pontos de atenção é digitado à mão — nunca injetar como HTML cru */
function escaparHTML(s){
  if(s===null || s===undefined) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
