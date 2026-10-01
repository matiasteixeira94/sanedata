/* Dashboard: ranking, histograma, mesorregiões, investimento e matriz de correlação. */

/* explicação em linguagem simples de cada esquema de pesos — sem isso, "Entropia de
   Shannon"/"PCA" não dizem nada pra quem não é da área de estatística. */
const EXPLICACAO_PESO = {
  igual: '<strong>Peso igual (padrão):</strong> os 5 indicadores contam 20% cada. Nenhum é tratado como mais importante — a opção mais simples de explicar e defender.',
  entropia: '<strong>Peso pela variação dos dados:</strong> o indicador que mais varia de um município pra outro em PE recebe peso maior — calculado automaticamente pelos dados (método: entropia de Shannon), não escolhido à mão.',
  pca: '<strong>Peso pela análise estatística (PCA):</strong> os pesos vêm de uma técnica (Análise de Componentes Principais) que resume a variação conjunta dos 5 indicadores. Também automático, mas mais sensível quando os indicadores se correlacionam entre si.',
};

/* filtro do ranking, disparado clicando numa barra da distribuição (faixa de índice)
   ou da mesorregião — nenhum dos dois muda o índice em si, só destaca/filtra a lista
   abaixo pra facilitar entender a distribuição/o agrupamento clicado. */
let filtroRanking = null; // { tipo:'mesorregiao', valor, label } | { tipo:'faixa', min, max, label } | null
function municipioPassaFiltro(m, val){
  if(!filtroRanking) return true;
  if(filtroRanking.tipo === 'mesorregiao') return m.mesorregiao === filtroRanking.valor;
  if(filtroRanking.tipo === 'faixa') return val!==undefined && val!==null && val>=filtroRanking.min && val<filtroRanking.max;
  return true;
}

/* ============ RENDER: DASHBOARD ============ */
function renderDashboard(){
  renderInicio(); // seção "Município em foco" (déficit x saúde de um município + dispersão) — independente do índice composto abaixo
  renderMapaGeo(); // mapa geográfico de PE (substitui o antigo mapa de calor esquemático), na mesma tela

  const pesosExplicacao = document.getElementById('pesosExplicacao');
  if(pesosExplicacao) pesosExplicacao.innerHTML = EXPLICACAO_PESO[state.peso || 'igual'];

  const dataAno = getDataset(state.ano);
  const { completos: data, idx } = indiceCompletoCache(state.ano, state.peso || 'igual');
  const hint = document.getElementById('rankingHint');
  if(hint) hint.textContent = `— do que mais precisa de investimento para o que menos precisa · ${data.length} de ${dataAno.length} municípios de PE com os ${INDICADORES_INDICE.length} indicadores do índice completos`;

  /* independe do índice composto (usa só o par déficit×saúde de cada célula), por isso
     roda mesmo quando o índice de 5 indicadores ainda não fecha para este ano. */
  renderMatrizCorrelacao(document.getElementById('matrizCorrelacao'), dataAno);

  const cardsHost = document.getElementById('cardsDashboard');
  const rankHost = document.getElementById('rankingList');
  const svgDecomp = document.getElementById('chartDecomposicao');
  const svgHistograma = document.getElementById('chartHistograma');
  const svgMesorregiao = document.getElementById('chartMesorregiao');
  const statPonderadoHost = document.getElementById('statPonderado');

  /* independe do índice composto (usa dataAno inteiro, não o par água+esgoto+3 indicadores
     de saúde do índice), por isso roda mesmo quando o índice de 5 indicadores ainda não
     fecha para este ano — mesmo motivo de renderMatrizCorrelacao acima. */
  desenharInvestimentoMunicipios(document.getElementById('chartInvestimentoDashboard'), dataAno, document.getElementById('tabelaInvestimentoDashboard'));

  const avisoForaIndice = document.getElementById('avisoMunicipioForaIndice');
  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    rankHost.innerHTML = ""; clear(svgDecomp); clear(svgHistograma); clear(svgMesorregiao);
    const tabHist = document.getElementById('tabelaHistograma'); if(tabHist) tabHist.innerHTML = '';
    const tabMeso = document.getElementById('tabelaMesorregiao'); if(tabMeso) tabMeso.innerHTML = '';
    const filtroBarVazio = document.getElementById('filtroRankingBar'); if(filtroBarVazio) filtroBarVazio.innerHTML = '';
    if(statPonderadoHost) statPonderadoHost.innerHTML = '';
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }
  if(data.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Índice ainda não calculável', `O índice composto precisa dos ${INDICADORES_INDICE.length} indicadores (água, esgoto, dengue, chikungunya, diarreia) em pelo menos 2 municípios para gerar um ranking, e nenhum município tem essa combinação neste ano. ` + avisoSaneamento('deficitEsgoto'));
    rankHost.innerHTML = ""; clear(svgDecomp); clear(svgHistograma); clear(svgMesorregiao);
    const tabHist = document.getElementById('tabelaHistograma'); if(tabHist) tabHist.innerHTML = '';
    const tabMeso = document.getElementById('tabelaMesorregiao'); if(tabMeso) tabMeso.innerHTML = '';
    const filtroBarVazio = document.getElementById('filtroRankingBar'); if(filtroBarVazio) filtroBarVazio.innerHTML = '';
    if(statPonderadoHost) statPonderadoHost.innerHTML = '';
    document.getElementById('topMunicipioNome').textContent = '';
    if(avisoForaIndice) avisoForaIndice.textContent = '';
    return;
  }

  const ordered = data.map((m,i)=>({m,val:idx[i]})).sort((a,b)=>b.val-a.val);
  const municipioSel = dataAno[state.municipioIdx] || dataAno[0];

  if(avisoForaIndice){
    if(data.includes(municipioSel)){
      avisoForaIndice.textContent = '';
    } else {
      const faltando = INDICADORES_INDICE.find(k => municipioSel[k]===null || municipioSel[k]===undefined);
      avisoForaIndice.textContent = `${municipioSel.nome}-${municipioSel.uf} (selecionado no topo da página) não aparece no ranking abaixo: falta o indicador "${LABELS[faltando]}" para esse município em ${state.ano}. Os cards de "Município em foco" mais abaixo continuam mostrando os indicadores que esse município tem.`;
    }
  }

  const top = ordered[0];
  const mediaIdx = idx.reduce((a,b)=>a+b,0)/idx.length;
  const piorAgua = data.reduce((acc,m)=> m.deficitAgua>acc.deficitAgua?m:acc, data[0]);
  const piorSaude = data.reduce((acc,m)=> m.taxaDengue>acc.taxaDengue?m:acc, data[0]);

  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Municípios com dados completos</span>
      <span class="card-value">${data.length}</span>
      <span class="card-sub">de ${dataAno.length} municípios de PE no ano selecionado</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Maior prioridade</span>
      <span class="card-value" style="font-size:19px">${top.m.nome}-${top.m.uf}</span>
      <span class="card-sub">índice ${fmt(top.val,1)} / 100</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Maior déficit de água</span>
      <span class="card-value" style="font-size:19px">${piorAgua.nome}-${piorAgua.uf}</span>
      <span class="card-sub">${fmt(piorAgua.deficitAgua,1)}% de déficit</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Índice médio do painel</span>
      <span class="card-value">${fmt(mediaIdx,1)}</span>
      <span class="card-sub">maior carga: ${piorSaude.nome} (${fmt(piorSaude.taxaDengue)} dengue/100k)</span>
    </div>`;

  const filtroBar = document.getElementById('filtroRankingBar');
  if(filtroBar){
    if(filtroRanking){
      filtroBar.innerHTML = `<div class="filtro-ativo">Filtro: <strong>${filtroRanking.label}</strong> <button type="button" id="btnLimparFiltroRanking">✕ limpar</button></div>`;
      document.getElementById('btnLimparFiltroRanking').addEventListener('click', ()=>{ filtroRanking = null; renderDashboard(); });
    } else {
      filtroBar.innerHTML = '';
    }
  }

  /* linha do ranking (com ou sem índice calculável) — clicar seleciona o município em
     todo o painel, igual à busca do topo da página. Extraído porque as duas listas
     abaixo (com índice / sem índice) tinham o mesmo HTML e o mesmo clique copiados. */
  function criarLinhaRanking({municipio, isSel, posLabel, valLabel, barPercent, semIndiceCalc, extra}){
    const row = document.createElement('div');
    row.className = 'rank-item' + (semIndiceCalc ? ' rank-item-sem-indice' : '') + (isSel ? ' rank-item-selecionado' : '');
    row.innerHTML = `
      <span class="rank-pos">${posLabel}</span>
      <span class="rank-name"><strong>${municipio.nome}</strong><span>${municipio.uf} · ${fmt(municipio.pop)} hab.${extra ? ' · '+extra : ''}${isSel ? ' · <strong>selecionado no topo da página</strong>' : ''}</span></span>
      <span class="rank-bar-wrap">${barPercent!==null ? `<span class="rank-bar" style="width:${barPercent}%"></span>` : ''}</span>
      <span class="rank-value">${valLabel}</span>`;
    row.style.cursor = 'pointer';
    row.addEventListener('click', ()=>{ state.municipioIdx = dataAno.indexOf(municipio); renderDashboard(); });
    if(isSel && row.scrollIntoView) row.scrollIntoView({block:'nearest'});
    return row;
  }

  rankHost.innerHTML = "";
  const maxVal = ordered[0].val || 1;
  let visiveis = 0;
  ordered.forEach((o,i)=>{
    if(!municipioPassaFiltro(o.m, o.val)) return;
    visiveis++;
    rankHost.appendChild(criarLinhaRanking({
      municipio: o.m, isSel: o.m === municipioSel,
      posLabel: `${i+1}º`, valLabel: fmt(o.val,1), barPercent: (o.val/maxVal*100).toFixed(0),
    }));
  });

  /* municípios sem os 5 indicadores completos: aparecem também na lista (todos os 185
     de PE, nunca só os que têm índice calculável), sem posição/barra — nunca inventamos
     um índice pra eles, só deixamos claro que faltam dados e qual indicador falta. */
  const semIndice = dataAno.filter(m => !data.includes(m) && municipioPassaFiltro(m)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
  if(semIndice.length){
    const divisor = document.createElement('div');
    divisor.className = 'rank-item-divisor';
    divisor.textContent = `${semIndice.length} município(s) sem os ${INDICADORES_INDICE.length} indicadores completos em ${state.ano} — não entram no índice, mas continuam listados abaixo`;
    rankHost.appendChild(divisor);
  }
  semIndice.forEach(m=>{
    const faltando = INDICADORES_INDICE.find(k => m[k]===null || m[k]===undefined);
    rankHost.appendChild(criarLinhaRanking({
      municipio: m, isSel: m === municipioSel, semIndiceCalc: true,
      posLabel: '—', valLabel: '—', barPercent: null, extra: `falta ${LABELS[faltando]}`,
    }));
  });
  if(filtroRanking && visiveis===0 && !semIndice.length){
    const vazio = document.createElement('div');
    vazio.className = 'hint';
    vazio.style.padding = '10px';
    vazio.textContent = 'Nenhum município corresponde a este filtro.';
    rankHost.appendChild(vazio);
  }

  /* decomposição do índice do município SELECIONADO no topo da página — antes ficava
     sempre no nº1 do ranking, então clicar em outro município no ranking/mapa não
     mudava nada aqui. */
  clear(svgDecomp);
  const nomeMunicipioNode = document.getElementById('topMunicipioNome');
  const W=480,H=200,padL=140,padR=50,padT=10;
  const posSelNaData = data.indexOf(municipioSel);
  if(posSelNaData < 0){
    nomeMunicipioNode.textContent = `${municipioSel.nome}-${municipioSel.uf}`;
    svgDecomp.appendChild(svgTexto(`${municipioSel.nome}-${municipioSel.uf} não tem os ${INDICADORES_INDICE.length} indicadores completos em ${state.ano}, então não dá pra decompor o índice dele (ver aviso acima).`, W, H));
  } else {
    nomeMunicipioNode.textContent = `${municipioSel.nome}-${municipioSel.uf}`;
    const matrix = buildMatrix(data, INDICADORES_INDICE);
    const weights = computeWeights(state.peso, matrix);
    const contribs = INDICADORES_INDICE.map((k,j)=> matrix[posSelNaData][j]*weights[j]*100);
    const barH = 22, gapY = 10;
    const maxC = Math.max(...contribs)*1.15 || 1;
    INDICADORES_INDICE.forEach((k,i)=>{
      const y = padT + i*(barH+gapY);
      const w = (contribs[i]/maxC) * (W-padL-padR);
      const isSaude = INDICADORES_SAUDE.includes(k);
      svgDecomp.appendChild(el('rect',{x:padL, y, width:Math.max(w,1), height:barH, rx:6, fill:isSaude?'var(--terracota)':'var(--bordo)'}));
      const lbl = el('text',{x:padL-10, y:y+barH/2+4, 'text-anchor':'end', 'font-size':12, 'font-family':'IBM Plex Sans', fill:'var(--text)'});
      lbl.textContent = LABELS[k]; svgDecomp.appendChild(lbl);
      const val = el('text',{x:padL+w+8, y:y+barH/2+4, 'font-size':11.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      val.textContent = contribs[i].toFixed(1)+' pts'; svgDecomp.appendChild(val);
    });
  }

  /* índice simples vs. ponderado por população — um município de 5 mil hab. com déficit
     alto pesa igual a um de 1,5 milhão no ranking; esta comparação mostra se isso muda
     o quadro geral do painel. */
  if(statPonderadoHost){
    const somaPop = data.reduce((a,m)=>a+(m.pop||0),0);
    const idxPonderado = somaPop ? data.reduce((a,m,i)=>a+idx[i]*(m.pop||0),0)/somaPop : null;
    statPonderadoHost.innerHTML = `
      <div class="stat-comp-item"><span class="stat-comp-label">Média simples</span><span class="stat-comp-value">${fmt(mediaIdx,1)}</span></div>
      <div class="stat-comp-item"><span class="stat-comp-label">Ponderada por população</span><span class="stat-comp-value">${idxPonderado===null?'—':fmt(idxPonderado,1)}</span></div>`;
  }

  desenharHistograma(svgHistograma, data, idx);
  desenharIndiceMesorregiao(svgMesorregiao, data, idx);
}

/* histograma: em quantas faixas de 10 pontos (0-10, 10-20, ...) os municípios com
   índice calculável se distribuem — a lista ordenada (ranking) já existe, isso mostra
   a forma da distribuição (concentrada, espalhada, bimodal) que o ranking não revela.
   Clicável: cada faixa filtra o ranking pra só os municípios daquele intervalo. */
function desenharHistograma(svg, data, idx){
  clear(svg);
  const tabelaHost = document.getElementById('tabelaHistograma');
  const W=420,H=200,padL=34,padR=12,padT=10,padB=28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  if(!idx.length){
    svg.appendChild(svgTexto('Sem índice calculável neste ano.', W, H));
    if(tabelaHost) tabelaHost.innerHTML = '';
    return;
  }
  const nFaixas = 10;
  const contagem = new Array(nFaixas).fill(0);
  const municipiosPorFaixa = Array.from({length:nFaixas}, ()=>[]);
  idx.forEach((v,i)=>{
    const faixa = Math.min(Math.floor(v/10), nFaixas-1);
    contagem[faixa]++;
    municipiosPorFaixa[faixa].push(data[i]);
  });

  /* tabela equivalente ao gráfico — pra quem usa leitor de tela ou só prefere ler números */
  if(tabelaHost){
    tabelaHost.innerHTML = `<thead><tr><th>Faixa do índice</th><th>Municípios</th><th>Nomes</th></tr></thead><tbody>` +
      contagem.map((c,i)=>`<tr><td>${i*10}-${(i+1)*10}</td><td>${c}</td><td style="text-align:left; font-family:var(--font-body); white-space:normal">${municipiosPorFaixa[i].map(m=>m.nome).join(', ') || '—'}</td></tr>`).join('') +
      `</tbody>`;
  }

  const plotW = W-padL-padR, plotH = H-padT-padB;
  const maxC = Math.max(...contagem)*1.15 || 1;
  const barW = plotW/nFaixas;

  [0,0.5,1].forEach(f=>{
    const y = padT + plotH*(1-f);
    svg.appendChild(el('line',{x1:padL,y1:y,x2:W-padR,y2:y,stroke:'var(--border)','stroke-width':1}));
    const t = el('text',{x:padL-6,y:y+3,'text-anchor':'end','font-size':9.5,'font-family':'IBM Plex Mono',fill:'var(--text-muted)'});
    t.textContent = fmt(Math.round(maxC*f),0); svg.appendChild(t);
  });

  contagem.forEach((c,i)=>{
    const h = (c/maxC)*plotH;
    const x = padL + i*barW;
    const y = padT + plotH - h;
    const min = i*10, max = (i+1)*10;
    const ativo = filtroRanking && filtroRanking.tipo==='faixa' && filtroRanking.min===min;
    const grupo = el('g', {class:'barra-clicavel'});
    grupo.appendChild(el('rect',{x, y:padT, width:barW, height:plotH, fill:'transparent'})); // alvo de clique maior que a barra visível
    const barra = el('rect',{x:x+1.5, y, width:Math.max(barW-3,1), height:Math.max(h,c?2:0), rx:3, fill:'var(--bordo)', stroke: ativo?'var(--terracota)':'none', 'stroke-width': ativo?2:0});
    const nomes = municipiosPorFaixa[i].map(m=>m.nome);
    const title = document.createElementNS(svgNS,'title');
    title.textContent = c
      ? `${c} município(s) entre ${min} e ${max} pontos: ${nomes.slice(0,8).join(', ')}${nomes.length>8 ? ` e mais ${nomes.length-8}` : ''} — clique pra filtrar o ranking`
      : `Nenhum município entre ${min} e ${max} pontos`;
    barra.appendChild(title);
    grupo.appendChild(barra);
    if(c>0){
      grupo.addEventListener('click', ()=>{
        filtroRanking = (ativo) ? null : { tipo:'faixa', min, max, label:`índice entre ${min} e ${max}` };
        renderDashboard();
      });
    }
    svg.appendChild(grupo);
    if(c>0){
      const val = el('text',{x:x+barW/2, y:y-4, 'text-anchor':'middle', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      val.textContent = c; svg.appendChild(val);
    }
    if(i%2===0){
      const lbl = el('text',{x:x+barW/2, y:H-10, 'text-anchor':'middle', 'font-size':8.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      lbl.textContent = `${i*10}`; svg.appendChild(lbl);
    }
  });
}

/* índice médio por mesorregião — agrupamento oficial do IBGE (Sertão, São Francisco,
   Agreste, Mata, Metropolitana de Recife), só entre os municípios com índice calculável.
   Clicável: cada barra filtra o ranking pra só os municípios daquela mesorregião. */
function desenharIndiceMesorregiao(svg, data, idx){
  clear(svg);
  const tabelaHost = document.getElementById('tabelaMesorregiao');
  const W=420,H=200,padL=150,padR=50,padT=8,padB=8;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const porRegiao = new Map();
  data.forEach((m,i)=>{
    const r = m.mesorregiao || 'Sem mesorregião';
    if(!porRegiao.has(r)) porRegiao.set(r, []);
    porRegiao.get(r).push({m, val:idx[i]});
  });
  const linhas = [...porRegiao.entries()]
    .map(([nome,itens])=>({
      nome,
      media: itens.reduce((a,it)=>a+it.val,0)/itens.length,
      n: itens.length,
      top3: [...itens].sort((a,b)=>b.val-a.val).slice(0,3).map(it=>it.m.nome),
    }))
    .sort((a,b)=>b.media-a.media);
  if(!linhas.length){
    svg.appendChild(svgTexto('Sem índice calculável neste ano.', W, H));
    if(tabelaHost) tabelaHost.innerHTML = '';
    return;
  }

  /* tabela equivalente ao gráfico — pra quem usa leitor de tela ou só prefere ler números */
  if(tabelaHost){
    tabelaHost.innerHTML = `<thead><tr><th>Mesorregião</th><th>Índice médio</th><th>Municípios</th><th>Maiores prioridades</th></tr></thead><tbody>` +
      linhas.map(l=>`<tr><td style="text-align:left; font-family:var(--font-body)">${l.nome}</td><td>${fmt(l.media,1)}</td><td>${l.n}</td><td style="text-align:left; font-family:var(--font-body); white-space:normal">${l.top3.join(', ')}</td></tr>`).join('') +
      `</tbody>`;
  }

  const rowH = (H-padT-padB)/linhas.length;
  const maxVal = Math.max(...linhas.map(l=>l.media))*1.15 || 1;
  linhas.forEach((l,i)=>{
    const y = padT + i*rowH + rowH*0.2;
    const barH = rowH*0.6;
    const w = (l.media/maxVal)*(W-padL-padR);
    const ativo = filtroRanking && filtroRanking.tipo==='mesorregiao' && filtroRanking.valor===l.nome;
    const grupo = el('g', {class:'barra-clicavel'});
    grupo.appendChild(el('rect',{x:0, y:padT+i*rowH, width:W, height:rowH, fill:'transparent'})); // alvo de clique maior que a barra visível
    const barra = el('rect',{x:padL, y, width:Math.max(w,1), height:barH, rx:5, fill:'var(--bordo)', stroke: ativo?'var(--terracota)':'none', 'stroke-width': ativo?2:0});
    const title = document.createElementNS(svgNS,'title');
    title.textContent = `${l.nome}: índice médio ${fmt(l.media,1)} entre ${l.n} município(s) — maiores prioridades: ${l.top3.join(', ')} — clique pra filtrar o ranking`;
    barra.appendChild(title);
    grupo.appendChild(barra);
    grupo.addEventListener('click', ()=>{
      filtroRanking = (ativo) ? null : { tipo:'mesorregiao', valor:l.nome, label:l.nome };
      renderDashboard();
    });
    svg.appendChild(grupo);
    const lbl = el('text',{x:padL-8, y:y+barH/2+4, 'text-anchor':'end', 'font-size':10.5, 'font-family':'IBM Plex Sans', fill:'var(--text)'});
    lbl.textContent = l.nome.replace(' Pernambucano','').replace(' Pernambucana',''); svg.appendChild(lbl);
    const val = el('text',{x:padL+w+8, y:y+barH/2+4, 'font-size':10, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    val.textContent = `${fmt(l.media,1)} (${l.n})`; svg.appendChild(val);
  });
}

/* investimento em saneamento (R$ por 100 mil habitantes) por município, 3 séries
   (prestador/município/estado — ver INDICADORES_INVESTIMENTO em js/data.js). Só água+esgoto,
   só 2015-2022 (mesma cobertura do 04a/04d; o portal público do SINISA que cobre 2023-2024 não
   publica nenhum indicador de investimento, só receita/despesa operacional — verificado, não
   presumido) — anos fora desse intervalo caem no placeholder "sem dado", igual aos outros
   gráficos desta seção.
   Colunas verticais agrupadas (mesmo padrão de desenharBarrasAgrupadas, usado em Comparações),
   com o valor de cada coluna em cima dela (texto rotacionado -90°, formato compacto — ver
   fmtMoedaCompacta) e o nome do município no eixo X rotacionado -45° (nomes longos não caberiam
   na horizontal com 15 grupos lado a lado).
   Ranking por município (não mesorregião) pra permitir análise no nível que a mesorregião
   escondia — mesmo padrão do "Ranking de priorização": mostra só os top N no gráfico, mas a
   tabela alternativa lista todos os municípios com dado, ordenados do maior pro menor
   investimento total.
   Diferente de desenharHistograma/desenharIndiceMesorregiao (que só são chamadas uma vez cada
   e por isso pegam o host da tabela via getElementById fixo), esta função é chamada duas vezes
   (Dashboard e Relatórios) com hosts de tabela diferentes, então recebe `tabelaHost` como
   parâmetro. */
function desenharInvestimentoMunicipios(svg, dataAno, tabelaHost){
  clear(svg);
  const TOP_N = 15;
  // painel-wide (largura total) — svg estica pra 100% da largura via `.panel svg{width:100%}`
  // em css/styles.css. padT/padB generosos: rótulo de valor (rotacionado, em cima) e nome do
  // município (rotacionado -45°, embaixo) precisam de espaço vertical, não só horizontal.
  // padL maior que padR: o rótulo do 1º grupo (ancorado no fim, rotacionado -45°) se estende
  // bem à esquerda do próprio eixo X — sem essa margem, o nome do primeiro município corta na
  // borda do SVG (grupos seguintes têm as barras anteriores como "espaço" pra esse mesmo efeito).
  const W=900, H=460, padL=130, padR=24, padT=100, padB=150;
  const plotW = W-padL-padR, plotH = H-padT-padB;

  const SERIES = [
    { chave:'investimentoPrestadorPer100k', label:'Prestador', cor:'var(--bordo)' },
    { chave:'investimentoMunicipioPer100k', label:'Município', cor:'var(--verde)' },
    { chave:'investimentoEstadoPer100k',    label:'Estado',    cor:'var(--ambar)' },
  ];

  /* pelo menos 1 dos 3 campos (não os 3 ao mesmo tempo, diferente de comDadosCompletos) — em PE,
     a COMPESA (prestador estadual) concentra quase todo o investimento em água/esgoto, então
     município e estado costumam ficar em branco na fonte pra maioria dos municípios (não é dado
     ausente por falha de coleta, é a estrutura real de quem investe). Exigir os 3 juntos jogaria
     fora ~70% dos municípios com dado real (178 → 51 em 2022, verificado); cada série ausente
     fica de fora do gráfico e como "—" na tabela, nunca vira 0 nem é inventada. */
  const comAlgumDado = dataAno.filter(m => INDICADORES_INVESTIMENTO.some(k => m[k]!==null && m[k]!==undefined));
  if(!comAlgumDado.length){
    svg.setAttribute('viewBox', `0 0 ${W} 230`);
    svg.appendChild(svgTexto('Sem dado de investimento neste ano.', W, 230));
    if(tabelaHost) tabelaHost.innerHTML = '';
    return;
  }

  const linhas = comAlgumDado
    .map(m => ({
      nome: `${m.nome}-${m.uf}`,
      valores: SERIES.map(s => m[s.chave]), // pode ter null — cada série trata isso na hora de desenhar/formatar
    }))
    .sort((a,b) => {
      const soma = arr => arr.reduce((s,v)=>s+(v||0),0);
      return soma(b.valores) - soma(a.valores);
    });

  /* tabela equivalente ao gráfico — lista TODOS os municípios com pelo menos 1 campo, não só o
     top N do gráfico; campos sem dado aparecem como "—" (fmt já trata null), nunca como 0 */
  if(tabelaHost){
    tabelaHost.innerHTML = `<thead><tr><th>Município</th>${SERIES.map(s=>`<th>${s.label} (R$/100 mil hab.)</th>`).join('')}</tr></thead><tbody>` +
      linhas.map(l=>`<tr><td style="text-align:left; font-family:var(--font-body)">${l.nome}</td>${l.valores.map(v=>`<td>${fmt(v,2)}</td>`).join('')}</tr>`).join('') +
      `</tbody>`;
  }

  const topLinhas = linhas.slice(0, TOP_N);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const maxVal = Math.max(...topLinhas.flatMap(l=>l.valores.filter(v=>v!==null)))*1.15 || 1;

  const barW=13, barGap=2;
  const groupW = SERIES.length*barW + (SERIES.length-1)*barGap;
  const totalGroups = topLinhas.length*groupW;
  // sem piso mínimo aqui de propósito: com padL maior (pro rótulo do 1º grupo caber, ver acima)
  // e até 15 grupos fixos, um piso alto podia empurrar os últimos grupos pra fora do viewBox.
  const gapEntreGrupos = topLinhas.length>1 ? Math.max((plotW-totalGroups)/topLinhas.length, 0) : 0;
  const axisY = padT + plotH;

  svg.appendChild(el('line',{x1:padL, y1:axisY, x2:W-padR, y2:axisY, stroke:'var(--border)', 'stroke-width':1}));

  let x = padL + gapEntreGrupos/2;
  topLinhas.forEach((l,i)=>{
    SERIES.forEach((s,si)=>{
      const valor = l.valores[si];
      if(valor===null || valor===undefined) return; // sem dado — não desenha coluna nenhuma (não confundir com 0)
      const h = Math.max((valor/maxVal)*plotH, 1);
      const bx = x + si*(barW+barGap), by = axisY - h;
      const barra = el('rect',{x:bx, y:by, width:barW, height:h, rx:2, fill:s.cor});
      const title = document.createElementNS(svgNS,'title');
      title.textContent = `${l.nome} — ${s.label}: R$ ${fmt(valor,2)} por 100 mil habitantes`;
      barra.appendChild(title);
      svg.appendChild(barra);

      const cx = bx+barW/2, ty = by-4;
      const val = el('text',{x:cx, y:ty, 'text-anchor':'start', 'font-size':9, 'font-family':'IBM Plex Mono', fill:'var(--text)', transform:`rotate(-90 ${cx} ${ty})`});
      val.textContent = fmtMoedaCompacta(valor);
      svg.appendChild(val);
    });

    const cxGroup = x + groupW/2;
    const lbl = el('text',{x:cxGroup, y:axisY+12, 'text-anchor':'end', 'font-size':9.5, 'font-family':'IBM Plex Sans', fill:'var(--text)', transform:`rotate(-45 ${cxGroup} ${axisY+12})`});
    lbl.textContent = `${i+1}º ${l.nome}`;
    svg.appendChild(lbl);
    x += groupW + gapEntreGrupos;
  });
}

/* matriz de correlação: Spearman ρ entre cada déficit de saneamento e cada indicador de
   saúde — a correlação em "Município em foco" só mostra um par por vez (o selecionado
   nos campos ali); esta matriz dá o quadro completo dos 9 pares de uma vez. Fundo
   divergente (terracota = correlação positiva/esperada pela literatura, verde =
   negativa/inesperada) mas o valor com sinal sempre aparece em texto — a cor nunca
   carrega sozinha o significado. */
function renderMatrizCorrelacao(host, dataAno){
  const corDeCorrelacao = (rho) => {
    const a = Math.min(Math.abs(rho), 0.7)/0.7;
    return rho >= 0
      ? `color-mix(in srgb, var(--terracota) ${Math.round(a*55)}%, var(--surface))`
      : `color-mix(in srgb, var(--verde) ${Math.round(a*55)}%, var(--surface))`;
  };
  let html = `<div class="table-scroll"><table class="tabela-relatorio matriz-correlacao"><thead><tr><th></th>`;
  INDICADORES_SAUDE.forEach(s => html += `<th>${LABELS[s]}</th>`);
  html += `</tr></thead><tbody>`;
  INDICADORES_DEFICIT.forEach(d=>{
    html += `<tr><th>${LABELS[d]}</th>`;
    INDICADORES_SAUDE.forEach(s=>{
      const completos = comDadosCompletos(dataAno, [d,s]);
      if(completos.length < 4){
        html += `<td class="celula-correlacao" style="background:var(--surface-alt)" title="Dados insuficientes (${completos.length} município(s), mínimo 4)">insuf.</td>`;
      } else {
        const rho = spearman(completos.map(m=>m[d]), completos.map(m=>m[s]));
        html += `<td class="celula-correlacao" style="background:${corDeCorrelacao(rho)}" title="${completos.length} municípios">${(rho>=0?'+':'')}${rho.toFixed(2)}</td>`;
      }
    });
    html += `</tr>`;
  });
  html += `</tbody></table></div>`;
  host.innerHTML = html;
}

