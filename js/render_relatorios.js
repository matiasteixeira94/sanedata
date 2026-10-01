/* ============ RENDER: RELATÓRIOS ============
   Uma única função monta as linhas (posição, indicadores, índice) usadas
   tanto pela tabela em tela quanto pelas exportações em js/export.js —
   assim o que é exportado é sempre exatamente o que está na tela. */
const COLUNAS_RELATORIO = [
  {chave:"pos", rotulo:"Posição"},
  {chave:"nome", rotulo:"Município"},
  {chave:"pop", rotulo:"População"},
  {chave:"indice", rotulo:"Índice de priorização"},
  {chave:"deficitAgua", rotulo:"Déficit água (%)"},
  {chave:"deficitEsgoto", rotulo:"Déficit esgoto (%)"},
  {chave:"deficitResiduos", rotulo:"Déficit resíduos (%)"},
  {chave:"taxaDengue", rotulo:"Dengue /100k"},
  {chave:"taxaChikungunya", rotulo:"Chikungunya /100k"},
  {chave:"taxaDiarreia", rotulo:"Diarreia aguda /100k"},
];

function calcularLinhasRelatorio(){
  const dataAno = getDataset(state.ano);
  const { completos, idx } = indiceCompletoCache(state.ano, state.peso || "igual");
  let ordenados = [];
  if(completos.length){
    ordenados = completos.map((m,i)=>({m, val: idx[i]})).sort((a,b)=>b.val-a.val);
  }
  return [
    ...ordenados.map((o,i)=>({pos:i+1, ...o.m, indice:o.val})),
    ...dataAno.filter(m=>!completos.includes(m)).map(m=>({pos:null, ...m, indice:null})),
  ];
}

function construirTabelaHTML(linhas, colunas){
  const cols = colunas || COLUNAS_RELATORIO;
  const head = "<thead><tr>" + cols.map(c=>`<th>${c.rotulo}</th>`).join("") + "</tr></thead>";
  const body = "<tbody>" + linhas.map(l => "<tr>" + cols.map(c=>{
    const v = l[c.chave];
    if(v===null || v===undefined || Number.isNaN(v)) return "<td>—</td>";
    if(typeof v === "number") return `<td>${fmt(v, c.chave==="pop"||c.chave==="pos" ? 0 : 1)}</td>`;
    return `<td>${v}</td>`;
  }).join("") + "</tr>").join("") + "</tbody>";
  return head + body;
}

/* ranking em barras: cor da barra segue a mesma escala verde→âmbar→terracota do mapa
   de calor (mesmo dado, mesmo significado — quanto mais terracota, mais prioridade),
   calculada sobre o intervalo de TODOS os municípios com índice no ano, não só do
   top 15 exibido, senão até o "menos urgente" do top 15 apareceria verde. */
function desenharRankingBarras(svg, itens, minGeral, maxGeral){
  clear(svg);
  const rowH=20, gapY=8, padL=172, padR=54, padT=6, W=480;
  const H = Math.max(padT + itens.length*(rowH+gapY) + 6, 60);
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  if(!itens.length){
    svg.appendChild(svgTexto(`Nenhum município com os ${INDICADORES_INDICE.length} indicadores do índice completos neste ano.`, W, H));
    return;
  }
  const plotR = W - padR;
  const maxEscala = Math.max(...itens.map(o=>o.indice)) * 1.12 || 1;
  const minCor = minGeral ?? Math.min(...itens.map(o=>o.indice));
  const maxCor = maxGeral ?? Math.max(...itens.map(o=>o.indice));

  itens.forEach((o,i)=>{
    if(i%2===1){
      const y = padT + i*(rowH+gapY) - gapY/2;
      svg.appendChild(el("rect",{x:0, y, width:W, height:rowH+gapY, fill:"var(--surface-alt)"}));
    }
  });
  [0,25,50,75,100].forEach(v=>{
    if(v > maxEscala) return;
    const x = padL + (v/maxEscala)*(plotR-padL);
    svg.appendChild(el("line",{x1:x, y1:1, x2:x, y2:H-1, stroke:"var(--border)", "stroke-width":1}));
  });

  itens.forEach((o,i)=>{
    const y = padT + i*(rowH+gapY);
    const w = Math.max((o.indice/maxEscala)*(plotR-padL), 2);
    const t = maxCor>minCor ? (o.indice-minCor)/(maxCor-minCor) : 0.5;
    const barra = el("rect",{x:padL, y, width:w, height:rowH, rx:5, fill:escalaCor(t)});
    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${o.pos}º — ${o.nome}: índice ${fmt(o.indice,1)} de 100`;
    barra.appendChild(title);
    svg.appendChild(barra);

    const lbl = el("text",{x:padL-8, y:y+rowH/2+4, "text-anchor":"end", "font-size":11, "font-family":"IBM Plex Sans", "font-weight": i<3?"600":"400", fill:"var(--text)"});
    lbl.textContent = `${o.pos}º ${o.nome}`; svg.appendChild(lbl);
    const val = el("text",{x:padL+w+8, y:y+rowH/2+4, "font-size":10.5, "font-family":"IBM Plex Mono", "font-weight":"600", fill:"var(--text)"});
    val.textContent = fmt(o.indice,1); svg.appendChild(val);
  });
}

function renderRelatorios(){
  const anoEl = document.getElementById("relAno"); if(anoEl) anoEl.textContent = state.ano;
  const badge = document.getElementById("relAnoBadge"); if(badge) badge.textContent = state.ano;

  const cardsHost = document.getElementById("cardsRelatorio");
  const chartHost = document.getElementById("chartRankingRelatorio");
  const hintHost = document.getElementById("relRankingHint");
  const tabelaHost = document.getElementById("tabelaRelatorio");

  const dataAno = getDataset(state.ano);

  /* independe do índice composto — mesmo motivo do Dashboard (ver renderDashboard). */
  desenharInvestimentoMunicipios(document.getElementById('chartInvestimentoRelatorio'), dataAno, document.getElementById('tabelaInvestimentoRelatorio'));

  if(dataAno.length === 0){
    clear2(cardsHost);
    cardsHost.innerHTML = placeholderHTML("Sem dados para este ano", "Rode o pipeline em data/scripts/ (ver README) para gerar data/processed/painel_pe.json.");
    clear(chartHost); tabelaHost.innerHTML = ""; if(hintHost) hintHost.textContent = "";
    return;
  }

  const linhas = calcularLinhasRelatorio();
  const comIndice = linhas.filter(l=>l.pos!==null);
  const mediaIdx = comIndice.length ? comIndice.reduce((a,l)=>a+l.indice,0)/comIndice.length : null;

  clear2(cardsHost);
  cardsHost.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Municípios no relatório</span>
      <span class="card-value">${dataAno.length}</span>
      <span class="card-sub">${comIndice.length} com os ${INDICADORES_INDICE.length} indicadores do índice completos · ${dataAno.length-comIndice.length} sem índice calculável</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Ano de referência</span>
      <span class="card-value">${state.ano}</span>
      <span class="card-sub">pesos: ${LABEL_PESO[state.peso||"igual"]}</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Índice médio do painel</span>
      <span class="card-value">${mediaIdx===null?"—":fmt(mediaIdx,1)}</span>
      <span class="card-sub">${comIndice.length ? `entre ${comIndice.length} municípios` : "aguardando dados completos"}</span>
    </div>`;

  const valoresIndice = comIndice.map(l=>l.indice);
  desenharRankingBarras(chartHost, comIndice.slice(0,15), Math.min(...valoresIndice), Math.max(...valoresIndice));
  if(hintHost) hintHost.textContent = comIndice.length
    ? `— top ${Math.min(15,comIndice.length)} de ${comIndice.length} municípios com os ${INDICADORES_INDICE.length} indicadores do índice completos`
    : `— nenhum município com os ${INDICADORES_INDICE.length} indicadores do índice completos ainda`;

  tabelaHost.innerHTML = construirTabelaHTML(linhas);
}

