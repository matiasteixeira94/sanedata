/* ============ RENDER: COMPARAÇÕES ============ */
function popularSelectComparacao(data){
  popularDatalistMunicipios(data);
  const configs = [
    {id:"selCompA", key:"compA", fallback:0},
    {id:"selCompB", key:"compB", fallback: data.length>1 ? 1 : 0},
  ];
  configs.forEach(cfg=>{
    const input = document.getElementById(cfg.id);
    let idx = state[cfg.key];
    if(idx===undefined || idx===null) idx = cfg.fallback;
    idx = Math.max(0, Math.min(idx, data.length-1));
    state[cfg.key] = idx;
    if(input && data[idx]){ input.value = rotuloMunicipio(data[idx]); input.classList.remove('campo-invalido'); }
  });
}

/* barras agrupadas: uma "série" por município/média, um grupo de barras por indicador */
function desenharBarrasAgrupadas(svg, indicadores, series){
  clear(svg);
  const W=420, H=210, padL=54, padR=16, padT=14, padB=34;
  const barW=18, barGap=4, groupGap=22;
  const groupW = series.length*barW + (series.length-1)*barGap;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const totalGroups = indicadores.length*groupW;
  const gapEntreGrupos = indicadores.length>1 ? Math.max((plotW-totalGroups)/indicadores.length, 14) : 0;

  const valores = [];
  indicadores.forEach(k => series.forEach(s => { const v=s.get(k); if(v!==null && v!==undefined && !Number.isNaN(v)) valores.push(v); }));
  const maxVal = (valores.length ? Math.max(...valores) : 1) * 1.15 || 1;

  if(!valores.length){
    svg.appendChild(svgTexto("Sem dados apurados para estes indicadores no ano selecionado.", W, H));
    return;
  }

  svg.appendChild(el("line",{x1:padL, y1:H-padB, x2:W-padR, y2:H-padB, stroke:"var(--border)", "stroke-width":1}));

  let x = padL + gapEntreGrupos/2;
  indicadores.forEach(k=>{
    series.forEach((s,si)=>{
      const v = s.get(k);
      if(v===null || v===undefined || Number.isNaN(v)) return;
      const h = Math.max((v/maxVal)*plotH, 1);
      const bx = x + si*(barW+barGap), by = H-padB-h;
      svg.appendChild(el("rect",{x:bx, y:by, width:barW, height:h, rx:4, fill:s.cor}));
      const t = el("text",{x:bx+barW/2, y:by-4, "text-anchor":"middle", "font-size":9, "font-family":"IBM Plex Mono", fill:"var(--text)"});
      t.textContent = round1(v); svg.appendChild(t);
    });
    const lbl = el("text",{x:x+groupW/2, y:H-12, "text-anchor":"middle", "font-size":10.5, "font-family":"IBM Plex Sans", fill:"var(--text-muted)"});
    lbl.textContent = LABELS[k] || k; svg.appendChild(lbl);
    x += groupW + gapEntreGrupos;
  });

  series.forEach((s,i)=>{
    const ly = 8 + i*14;
    svg.appendChild(el("rect",{x:W-padR-100, y:ly, width:9, height:9, rx:2, fill:s.cor}));
    const t = el("text",{x:W-padR-87, y:ly+8, "font-size":9.5, "font-family":"IBM Plex Sans", fill:"var(--text-muted)"});
    t.textContent = s.label; svg.appendChild(t);
  });
}

function renderComparacoes(){
  const dataAno = getDataset(state.ano);
  const anoEl = document.getElementById("compAno"); if(anoEl) anoEl.textContent = state.ano;
  popularSelectComparacao(dataAno);

  const cardsHost = document.getElementById("cardsComparacao");
  const svgSan = document.getElementById("chartCompSaneamento");
  const svgSau = document.getElementById("chartCompSaude");
  const tabelaHost = document.getElementById("tabelaComparacao");

  if(dataAno.length < 2){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML("Municípios insuficientes para comparar", "São necessários ao menos 2 municípios com população apurada no ano selecionado.");
    clear(svgSan); clear(svgSau); tabelaHost.innerHTML = "";
    return;
  }

  const A = dataAno[state.compA] || dataAno[0];
  const B = dataAno[state.compB] || dataAno[Math.min(1, dataAno.length-1)];

  const mediaDe = (chave) => {
    const vals = comDadosCompletos(dataAno, [chave]).map(d=>d[chave]);
    return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
  };

  const { completos, idx: idxTodos } = indiceCompletoCache(state.ano, state.peso || "igual");
  const idxDe = (m) => { const pos = completos.indexOf(m); return pos>=0 ? idxTodos[pos] : null; };
  const idxA = idxDe(A), idxB = idxDe(B);
  const posDe = (m) => { const pos = completos.indexOf(m); return pos>=0 ? rankDesc(idxTodos)[pos] : null; };

  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">${A.nome}-${A.uf}</span>
      <span class="card-value">${idxA===null?"—":fmt(idxA,1)}</span>
      <span class="card-sub">${idxA===null?"índice não calculável (dados incompletos)":`${posDe(A)}ª posição de ${completos.length}`}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">${B.nome}-${B.uf}</span>
      <span class="card-value">${idxB===null?"—":fmt(idxB,1)}</span>
      <span class="card-sub">${idxB===null?"índice não calculável (dados incompletos)":`${posDe(B)}ª posição de ${completos.length}`}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Diferença de índice</span>
      <span class="card-value">${(idxA===null||idxB===null) ? "—" : fmt(Math.abs(idxA-idxB),1)}</span>
      <span class="card-sub">${(idxA===null||idxB===null) ? `precisa dos ${INDICADORES_INDICE.length} indicadores do índice nos dois municípios` : (idxA>idxB ? `${A.nome} prioriza mais` : idxB>idxA ? `${B.nome} prioriza mais` : "empate")}</span>
    </div>`;

  desenharBarrasAgrupadas(svgSan, INDICADORES_DEFICIT, [
    {label:A.nome, cor:"var(--bordo)", get:(k)=>A[k]},
    {label:B.nome, cor:"var(--terracota)", get:(k)=>B[k]},
    {label:"Média do painel", cor:"var(--text-muted)", get:mediaDe},
  ]);
  desenharBarrasAgrupadas(svgSau, INDICADORES_SAUDE, [
    {label:A.nome, cor:"var(--bordo)", get:(k)=>A[k]},
    {label:B.nome, cor:"var(--terracota)", get:(k)=>B[k]},
    {label:"Média do painel", cor:"var(--text-muted)", get:mediaDe},
  ]);

  const mediaIndice = idxTodos.length ? idxTodos.reduce((a,v)=>a+v,0)/idxTodos.length : null;
  const linhasTabela = [
    {rotulo:"Índice de priorização", a:idxA, b:idxB, media:mediaIndice, un:""},
    ...TODOS_INDICADORES.map(k=>({rotulo:LABELS[k], a:A[k], b:B[k], media:mediaDe(k), un: INDICADORES_DEFICIT.includes(k)?"%":"/100k"})),
  ];
  tabelaHost.innerHTML =
    `<thead><tr><th>Indicador</th><th>${A.nome}</th><th>${B.nome}</th><th>Média do painel</th></tr></thead><tbody>` +
    linhasTabela.map(l => `<tr><td>${l.rotulo}</td><td>${l.a==null?"—":fmt(l.a,1)+l.un}</td><td>${l.b==null?"—":fmt(l.b,1)+l.un}</td><td>${l.media==null?"—":fmt(l.media,1)+l.un}</td></tr>`).join("") +
    "</tbody>";
}
