/* Seção "Município em foco" do Dashboard — helpers comuns (el, clear, fmt, svgTexto…) em js/render.js. */

/* linha do tempo do índice de priorização (pesos iguais) do município selecionado
   vs. a média do painel, ano a ano — anos em que o índice não é calculável (menos de
   2 municípios com os indicadores completos, ou o próprio município sem dado naquele
   ano) ficam como um vão na linha, nunca interpolados ou inventados. */
function desenharIndiceTemporal(svg, codigoMunicipio, nomeMunicipio){
  clear(svg);
  if(!PAINEL) return;
  const anos = [];
  for(let a = PAINEL.anoInicio; a <= PAINEL.anoFim; a++) anos.push(a);

  const pontosMunicipio = [], pontosMedia = [];
  anos.forEach(a=>{
    // régua fixa = mesma normalização em todos os anos (comparável); régua do ano = posição relativa
    const { completos, idx } = state.reguaTemporal === 'fixa' ? indiceReguaFixaCache(a) : indiceCompletoCache(a, "igual");
    if(completos.length < 2){ pontosMunicipio.push(null); pontosMedia.push(null); return; }
    pontosMedia.push(idx.reduce((s,v)=>s+v,0)/idx.length);
    const pos = completos.findIndex(m=>m.codigo===codigoMunicipio);
    pontosMunicipio.push(pos>=0 ? idx[pos] : null);
  });

  const W=900,H=220,padL=44,padR=120,padT=16,padB=32;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const valoresValidos = [...pontosMunicipio, ...pontosMedia].filter(v=>v!==null);
  if(!valoresValidos.length){
    svg.appendChild(svgTexto("Índice não calculável em nenhum ano para os filtros atuais.", W, H));
    return 0;
  }
  const maxV = Math.max(...valoresValidos)*1.15 || 1;
  const sx = i => padL + (anos.length>1 ? i/(anos.length-1)*plotW : plotW/2);
  const sy = v => padT + plotH - (v/maxV)*plotH;

  for(let i=0;i<=4;i++){
    const v = maxV*i/4;
    const y = sy(v);
    svg.appendChild(el("line",{x1:padL, y1:y, x2:W-padR, y2:y, stroke:"var(--border)", "stroke-width":1}));
    const t = el("text",{x:padL-8, y:y+3, "text-anchor":"end", "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
    t.textContent = fmt(v,0); svg.appendChild(t);
  }
  anos.forEach((a,i)=>{
    const t = el("text",{x:sx(i), y:H-8, "text-anchor":"middle", "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
    t.textContent = a; svg.appendChild(t);
  });

  function desenharLinha(pontos, cor, rotulo){
    let pathD = "", ultimo = null, anteriorNulo = true;
    pontos.forEach((v,i)=>{
      if(v===null){ anteriorNulo = true; return; } // ano sem dado quebra a linha (vão visível, nunca ligado por cima)
      const x = sx(i), y = sy(v);
      pathD += (anteriorNulo ? " M" : " L") + x + " " + y;
      anteriorNulo = false;
      ultimo = {x,y,v};
    });
    if(pathD) svg.appendChild(el("path",{d:pathD, fill:"none", stroke:cor, "stroke-width":2, "stroke-linecap":"round", "stroke-linejoin":"round"}));
    pontos.forEach((v,i)=>{
      if(v===null) return;
      svg.appendChild(el("circle",{cx:sx(i), cy:sy(v), r:4, fill:cor, stroke:"var(--surface)", "stroke-width":1.5}));
    });
    if(ultimo){
      const lbl = el("text",{x:ultimo.x+8, y:ultimo.y+4, "font-size":11, "font-family":"IBM Plex Sans", "font-weight":600, fill:cor});
      lbl.textContent = rotulo; svg.appendChild(lbl);
      const val = el("text",{x:ultimo.x+8, y:ultimo.y+18, "font-size":10, "font-family":"IBM Plex Mono", fill:"var(--text-muted)"});
      val.textContent = fmt(ultimo.v,1); svg.appendChild(val);
    }
  }

  desenharLinha(pontosMedia, "var(--text-muted)", "Média do painel");
  desenharLinha(pontosMunicipio, "var(--bordo)", nomeMunicipio);
  return pontosMunicipio.filter(v=>v!==null).length;
}

/* ============ RENDER: MUNICÍPIO EM FOCO (seção do Dashboard) ============
   Mantém o nome renderInicio por ora — renderiza a seção "Município em foco"
   do Dashboard (cards, comparação com a média, mapa esquemático e a
   correlação/dispersão déficit×saúde), chamada a partir de renderDashboard(). */
function renderInicio(){
  const data = getDataset(state.ano);
  const cardsHost = document.getElementById('cardsInicio');
  const svgComp = document.getElementById('chartComparacao');

  if(data.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML('Sem dados para este ano', 'Nenhum município com população apurada para o ano selecionado. Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.');
    clear(svgComp); clear(document.getElementById('chartCorrelacaoDispersao')); clear(document.getElementById('chartIndiceTemporal'));
    document.getElementById('corrValue').textContent = '—';
    document.getElementById('interpretacaoTexto').textContent = '';
    document.getElementById('corrChartHint').textContent = '';
    document.getElementById('temporalHint').textContent = '';
    return;
  }

  const m = data[state.municipioIdx] || data[0];
  const inputMunicipio = document.getElementById('selMunicipio');
  if(inputMunicipio) inputMunicipio.value = rotuloMunicipio(m);
  const compKey = state.componente, saudeKey = state.indicador;

  const completosComp = comDadosCompletos(data, [compKey]);
  const completosSaude = comDadosCompletos(data, [saudeKey]);
  const completosAmbos = comDadosCompletos(data, [compKey, saudeKey]);

  const semComp = m[compKey] === null || m[compKey] === undefined;
  const semSaude = m[saudeKey] === null || m[saudeKey] === undefined;

  const { completos: idxData, idx } = indiceCompletoCache(state.ano, 'igual');
  const posNoIdx = idxData.indexOf(m);
  const idxRank = posNoIdx>=0 ? rankDesc(idx)[posNoIdx] : null;

  const compRank = !semComp ? rankDesc(completosComp.map(d=>d[compKey]))[completosComp.indexOf(m)] : null;
  const saudeRank = !semSaude ? rankDesc(completosSaude.map(d=>d[saudeKey]))[completosSaude.indexOf(m)] : null;

  /* cards */
  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Índice de priorização</span>
      <span class="card-value">${idxRank ? fmt(idx[posNoIdx],1) : '—'}</span>
      <span class="card-sub">${idxData.length ? `de 0 a 100 · pesos iguais · ${idxData.length} municípios com os ${INDICADORES_INDICE.length} indicadores do índice completos` : 'aguardando dados completos (ver aviso abaixo)'}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Posição no painel (índice)</span>
      <span class="card-value">${idxRank ? idxRank+'ª' : '—'}</span>
      <span class="card-sub">${idxData.length ? `entre ${idxData.length} municípios com dados completos` : '—'}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">${LABELS[compKey]}</span>
      <span class="card-value">${semComp ? '—' : fmt(m[compKey],1)+'%'}</span>
      <span class="card-sub">${semComp ? 'dado de saneamento ainda não importado' : `${compRank}ª maior deficiência entre ${completosComp.length} municípios`}</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">${LABELS[saudeKey]}</span>
      <span class="card-value">${semSaude ? '—' : fmt(m[saudeKey])}</span>
      <span class="card-sub">${semSaude ? 'sem casos/notificações apuradas' : `casos / 100 mil hab. · ${saudeRank}ª posição de ${completosSaude.length}`}</span>
    </div>`;

  /* evolução do índice do município ao longo dos anos, vs. média do painel em cada ano */
  const svgTemporal = document.getElementById('chartIndiceTemporal');
  const temporalHint = document.getElementById('temporalHint');
  if(svgTemporal && temporalHint){
    const anosComPonto = desenharIndiceTemporal(svgTemporal, m.codigo, `${m.nome}-${m.uf}`);
    document.querySelectorAll('#pillsRegua .pill').forEach(p=>p.classList.toggle('active', p.dataset.regua===state.reguaTemporal));
    document.getElementById('notaRegua').innerHTML = state.reguaTemporal === 'fixa'
      ? 'Régua fixa: todos os anos são normalizados pelo mesmo mínimo/máximo (o de toda a série 2015-2024), com pesos iguais — então <strong>uma queda na linha é melhora real</strong> dos indicadores, não só mudança de posição. Ressalva: em 2023 água e esgoto passam a vir do SINISA, com método diferente do SNIS (ver Metodologia &amp; Dados). Vãos são anos sem dado completo.'
      : 'Régua de cada ano: cada ano é normalizado (mínimo/máximo) só entre os municípios com os 5 indicadores completos <em>naquele</em> ano, com pesos iguais — o valor mostra a <strong>posição relativa</strong> dentro do grupo daquele ano, e não é comparável entre anos. Para ver se o município melhorou de fato, use a régua fixa. Vãos são anos sem dado completo (nunca interpolados).';
    temporalHint.textContent = anosComPonto
      ? `— ${m.nome}-${m.uf} vs. média do painel, ${PAINEL.anoInicio}-${PAINEL.anoFim} (pesos iguais)`
      : `— ${m.nome}-${m.uf} não tem os ${INDICADORES_INDICE.length} indicadores do índice completos em nenhum ano; só a média do painel aparece no gráfico`;
  }

  /* gráfico de comparação (barras SVG) — só quando há os dois valores para o município */
  clear(svgComp);
  if(semComp || semSaude){
    const aviso = semComp ? avisoSaneamento(compKey) : `Sem notificações/internações apuradas para "${LABELS[saudeKey]}" em ${m.nome} neste ano.`;
    svgComp.appendChild(svgTexto(aviso, 420, 230));
  } else {
    const mediaComp = completosAmbos.reduce((a,b)=>a+b[compKey],0)/completosAmbos.length;
    const mediaSaude = completosAmbos.reduce((a,b)=>a+b[saudeKey],0)/completosAmbos.length;
    desenharComparacao(svgComp, m, compKey, saudeKey, mediaComp, mediaSaude);
  }

  /* correlação + interpretação — só com os dois indicadores presentes em ao menos 4 municípios */
  const corrHost = document.getElementById('corrValue');
  const textoHost = document.getElementById('interpretacaoTexto');
  const chartCorr = document.getElementById('chartCorrelacaoDispersao');
  const chartCorrHint = document.getElementById('corrChartHint');
  if(completosAmbos.length < 4){
    const avisoFalta = semComp ? avisoSaneamento(compKey) : '';
    corrHost.textContent = '—';
    textoHost.textContent = `Dados insuficientes para calcular a correlação (${completosAmbos.length} município(s) com ambos os indicadores apurados; são necessários ao menos 4). ${avisoFalta}`;
    clear(chartCorr);
    chartCorr.appendChild(svgTexto(`Dados insuficientes para o gráfico de dispersão (mínimo de 4 municípios com os dois indicadores apurados). ${avisoFalta}`, 420, 230));
    chartCorrHint.textContent = '';
  } else {
    const compVals = completosAmbos.map(d=>d[compKey]);
    const saudeVals = completosAmbos.map(d=>d[saudeKey]);
    const rho = spearman(compVals, saudeVals);
    corrHost.textContent = (rho>=0?'+':'') + rho.toFixed(2);
    const forca = forcaCorrelacao(rho);
    const direcao = rho >= 0 ? "positiva" : "negativa";
    const esperado = rho >= 0
      ? "na direção esperada pela literatura (mais déficit associado a mais carga da doença)"
      : "na direção oposta à esperada pela literatura — vale investigar outros fatores antes de priorizar só por este par de variáveis";
    const posicaoTxt = (semComp || semSaude) ? '' :
      ` Em <strong>${m.nome}-${m.uf}</strong>, o ${LABELS[compKey].toLowerCase()} está em <strong>${fmt(m[compKey],1)}%</strong> e a taxa de ${LABELS[saudeKey].toLowerCase()} é de <strong>${fmt(m[saudeKey])} casos/100 mil hab.</strong>`;
    textoHost.innerHTML = `Considerando os <strong>${completosAmbos.length} municípios</strong> de PE com ambos os indicadores apurados neste ano, a correlação de Spearman entre ${LABELS[compKey].toLowerCase()} e ${LABELS[saudeKey].toLowerCase()} é <strong>${forca}</strong> e <strong>${direcao}</strong> (ρ = ${rho.toFixed(2)}) — ${esperado}.${posicaoTxt} Texto gerado automaticamente a partir dos filtros selecionados.`;

    desenharDispersaoCorrelacao(chartCorr, completosAmbos, compKey, saudeKey, semComp||semSaude ? null : m);
    chartCorrHint.textContent = `— ${completosAmbos.length} municípios com os dois indicadores apurados em ${state.ano}, ρ = ${rho.toFixed(2)}`;
  }
}

/* dispersão déficit×saúde: um ponto por município, linha de tendência (OLS) e o município
   selecionado em destaque — a mesma leitura da correlação em Spearman acima, mas mostrando
   a posição (ranking) de cada município nos dois eixos ao mesmo tempo. */
function desenharDispersaoCorrelacao(svg, dados, compKey, saudeKey, municipioSel){
  clear(svg);
  const W=420, H=230, padL=46, padR=18, padT=16, padB=38;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const xs = dados.map(d=>d[compKey]), ys = dados.map(d=>d[saudeKey]);
  const [xMinD,xMaxD] = minMax(xs), [yMinD,yMaxD] = minMax(ys);
  const xPad = (xMaxD-xMinD)*0.08 || Math.max(xMaxD,1)*0.1;
  const yPad = (yMaxD-yMinD)*0.08 || Math.max(yMaxD,1)*0.1;
  const xMin = Math.max(0, xMinD-xPad), xMax = xMaxD+xPad;
  const yMin = Math.max(0, yMinD-yPad), yMax = yMaxD+yPad;
  const sx = v => padL + ((v-xMin)/((xMax-xMin)||1))*plotW;
  const sy = v => H-padB - ((v-yMin)/((yMax-yMin)||1))*plotH;

  for(let i=0;i<=4;i++){
    const v = yMin + (yMax-yMin)*i/4;
    const y = sy(v);
    svg.appendChild(el('line',{x1:padL, y1:y, x2:W-padR, y2:y, stroke:'var(--border)', 'stroke-width':1}));
    const t = el('text',{x:padL-6, y:y+3, 'text-anchor':'end', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = fmt(v,0); svg.appendChild(t);
  }
  [xMin, (xMin+xMax)/2, xMax].forEach(v=>{
    const t = el('text',{x:sx(v), y:H-padB+16, 'text-anchor':'middle', 'font-size':9.5, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = fmt(v,0)+'%'; svg.appendChild(t);
  });
  const xTitle = el('text',{x:padL+plotW/2, y:H-4, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
  xTitle.textContent = `${LABELS[compKey]} (%)`; svg.appendChild(xTitle);
  const yTitle = el('text',{x:12, y:padT+plotH/2, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)', transform:`rotate(-90 12 ${padT+plotH/2})`});
  yTitle.textContent = `${LABELS[saudeKey]} (/100k)`; svg.appendChild(yTitle);

  const {a,b} = linreg(xs, ys);
  const y1 = Math.max(yMin, Math.min(yMax, a*xMin+b));
  const y2 = Math.max(yMin, Math.min(yMax, a*xMax+b));
  svg.appendChild(el('line',{x1:sx(xMin), y1:sy(y1), x2:sx(xMax), y2:sy(y2), stroke:'var(--text-muted)', 'stroke-width':2, 'stroke-linecap':'round', opacity:0.55}));

  dados.forEach(d=>{
    if(d === municipioSel) return;
    const cx = sx(d[compKey]), cy = sy(d[saudeKey]);
    const hit = el('circle',{cx, cy, r:12, fill:'transparent'});
    const hitTitle = document.createElementNS(svgNS,'title');
    hitTitle.textContent = `${d.nome}: ${LABELS[compKey]} ${fmt(d[compKey],1)}% · ${LABELS[saudeKey]} ${fmt(d[saudeKey])}/100k`;
    hit.appendChild(hitTitle);
    svg.appendChild(hit);
    svg.appendChild(el('circle',{cx, cy, r:5, fill:'var(--bordo)', 'fill-opacity':0.55, stroke:'var(--surface)', 'stroke-width':1.5}));
  });

  if(municipioSel){
    const cx = sx(municipioSel[compKey]), cy = sy(municipioSel[saudeKey]);
    svg.appendChild(el('circle',{cx, cy, r:9, fill:'none', stroke:'var(--terracota)', 'stroke-width':1.4}));
    const dot = el('circle',{cx, cy, r:6, fill:'var(--terracota)', stroke:'var(--surface)', 'stroke-width':1.5});
    const dotTitle = document.createElementNS(svgNS,'title');
    dotTitle.textContent = `${municipioSel.nome} (selecionado): ${LABELS[compKey]} ${fmt(municipioSel[compKey],1)}% · ${LABELS[saudeKey]} ${fmt(municipioSel[saudeKey])}/100k`;
    dot.appendChild(dotTitle);
    svg.appendChild(dot);
    const labelY = cy < padT+16 ? cy+18 : cy-12;
    const anchor = cx > W-padR-60 ? 'end' : (cx < padL+60 ? 'start' : 'middle');
    const lbl = el('text',{x:cx, y:labelY, 'text-anchor':anchor, 'font-size':10.5, 'font-family':'IBM Plex Sans', 'font-weight':600, fill:'var(--text)'});
    lbl.textContent = municipioSel.nome;
    svg.appendChild(lbl);
  }
}

function desenharComparacao(svg, m, compKey, saudeKey, mediaComp, mediaSaude){
  const W=420,H=230, padL=44, padB=30, padT=14, gap=70;
  const groups = [
    {label: LABELS[compKey].replace('Déficit de ','Déficit\n'), muni:m[compKey], media:mediaComp, unit:'%'},
    {label: LABELS[saudeKey], muni:m[saudeKey], media:mediaSaude, unit:'/100k'}
  ];
  const maxVal = Math.max(...groups.map(g=>Math.max(g.muni,g.media))) * 1.25 || 1;
  const plotH = H-padT-padB;
  svg.appendChild(el('line',{x1:padL,y1:H-padB,x2:W-16,y2:H-padB,stroke:'var(--border)','stroke-width':1}));
  groups.forEach((g,gi)=>{
    const baseX = padL + gi*(gap+120) + 20;
    [ {v:g.muni, color:'var(--bordo)', dx:0, label:m.nome},
      {v:g.media, color:'var(--text-muted)', dx:44, label:'Média painel'} ].forEach(bar=>{
        const h = (bar.v/maxVal)*plotH;
        const x = baseX+bar.dx, y = H-padB-h;
        svg.appendChild(el('rect',{x, y, width:32, height:h, rx:5, fill:bar.color}));
        const t = el('text',{x:x+16, y:y-6, 'text-anchor':'middle', 'font-size':11, 'font-family':'IBM Plex Mono', fill:'var(--text)'});
        t.textContent = bar.v.toLocaleString('pt-BR',{maximumFractionDigits:1});
        svg.appendChild(t);
    });
    const gl = el('text',{x:baseX+38, y:H-10, 'text-anchor':'middle', 'font-size':11.5, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    gl.textContent = g.label + ' ('+g.unit+')';
    svg.appendChild(gl);
  });
  svg.appendChild(el('rect',{x:W-150,y:10,width:10,height:10,rx:2,fill:'var(--bordo)'}));
  const leg1 = el('text',{x:W-134,y:19,'font-size':10.5,'font-family':'IBM Plex Sans',fill:'var(--text-muted)'}); leg1.textContent = m.nome; svg.appendChild(leg1);
  svg.appendChild(el('rect',{x:W-150,y:26,width:10,height:10,rx:2,fill:'var(--text-muted)'}));
  const leg2 = el('text',{x:W-134,y:35,'font-size':10.5,'font-family':'IBM Plex Sans',fill:'var(--text-muted)'}); leg2.textContent = 'Média do painel'; svg.appendChild(leg2);
}

