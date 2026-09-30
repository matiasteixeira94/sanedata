/* =========================================================================
   METODOLOGIA & DADOS — a parte estática (fórmula, dicionário de
   indicadores, como citar) está no index.html; aqui ficam só os blocos
   calculados a partir dos dados carregados: cobertura de dado por
   indicador × ano, pesos de cada esquema e a robustez do ranking entre os
   esquemas no ano selecionado.
   ========================================================================= */

function renderMetodologia(){
  if(!PAINEL) return;
  renderCoberturaDados(document.getElementById('tabelaCobertura'));
  renderPesosERobustez();

  const gerado = PAINEL.geradoEm ? new Date(PAINEL.geradoEm) : null;
  document.getElementById('metodologiaVersaoDados').textContent = gerado
    ? gerado.toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'})
    : 'data não informada no arquivo';
  // formato ABNT de data de acesso: "30 set. 2026" (o pt-BR do navegador gera "30 de set. de 2026")
  document.getElementById('citacaoAcesso').textContent =
    new Date().toLocaleDateString('pt-BR', {day:'numeric', month:'short', year:'numeric'}).replace(/\sde\s/g,' ');
}

/* matriz indicador × ano com quantos municípios têm valor apurado — a "regra de
   transparência" do painel (nunca estimar dado ausente) só é verificável se a lacuna
   estiver à vista; esta tabela é essa vista. */
function renderCoberturaDados(host){
  const anos = anosDaSerie();
  const total = getDataset(anos[0]).length || 1;
  const linhas = [
    ...INDICADORES_SERIE.filter(k=>k!==CHAVE_INDICE_FIXO).map(k=>({ rotulo:LABELS[k], contar: a => getDataset(a).filter(m=>valorIndicador(m,k)!==null).length })),
    { rotulo:`Índice (${INDICADORES_INDICE.length} indicadores completos)`, contar: a => indiceCompletoCache(a,'igual').completos.length, destaque:true },
  ];
  host.innerHTML = `<thead><tr><th>Indicador</th>${anos.map(a=>`<th>${a}</th>`).join('')}</tr></thead><tbody>` +
    linhas.map(l=>`<tr${l.destaque?' class="linha-destaque"':''}><td>${l.rotulo}</td>${anos.map(a=>{
      const n = l.contar(a), p = n/total;
      const fundo = n ? `color-mix(in srgb, var(--verde) ${Math.round(12+p*48)}%, var(--surface))` : 'var(--surface-alt)';
      return `<td class="celula-cobertura" style="background:${fundo}" title="${n} de ${total} municípios (${fmt(p*100,0)}%)">${n || '—'}</td>`;
    }).join('')}</tr>`).join('') + `</tbody>`;
  document.getElementById('coberturaHint').textContent = `— nº de municípios (de ${total}) com o indicador apurado em cada ano`;
}

/* pesos de cada esquema + concordância entre os rankings (Spearman ρ e sobreposição do
   top 10) — responde "o ranking muda muito se eu trocar o critério de peso?" */
function renderPesosERobustez(){
  const pesosHost = document.getElementById('tabelaPesos');
  const robustezHost = document.getElementById('tabelaRobustez');
  const { completos } = indiceCompletoCache(state.ano, 'igual');
  document.querySelectorAll('.metodologia-ano').forEach(n => n.textContent = state.ano);

  if(completos.length < 3){
    const msg = `<tbody><tr><td style="text-align:center; font-family:var(--font-body); white-space:normal; color:var(--text-muted)">Menos de 3 municípios com os ${INDICADORES_INDICE.length} indicadores completos em ${state.ano} — escolha outro ano no topo da página.</td></tr></tbody>`;
    pesosHost.innerHTML = msg; robustezHost.innerHTML = msg;
    return;
  }

  const esquemas = ['igual','entropia','pca'];
  const matrix = buildMatrix(completos, INDICADORES_INDICE);
  const pesos = Object.fromEntries(esquemas.map(e=>[e, computeWeights(e, matrix)]));
  pesosHost.innerHTML = `<thead><tr><th>Indicador</th>${esquemas.map(e=>`<th>${LABEL_PESO[e]}</th>`).join('')}</tr></thead><tbody>` +
    INDICADORES_INDICE.map((k,j)=>`<tr><td>${LABELS[k]}</td>${esquemas.map(e=>`<td>${fmt(pesos[e][j]*100,1)}%</td>`).join('')}</tr>`).join('') +
    `</tbody>`;

  const indices = Object.fromEntries(esquemas.map(e=>[e, indiceCompletoCache(state.ano, e).idx]));
  const topN = Math.min(10, completos.length);
  const top = (arr) => new Set(arr.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,topN).map(o=>o.i));
  const pares = [['igual','entropia'],['igual','pca'],['entropia','pca']];
  robustezHost.innerHTML = `<thead><tr><th>Comparação</th><th>Spearman ρ</th><th>Concordância</th><th>Top ${topN} em comum</th></tr></thead><tbody>` +
    pares.map(([a,b])=>{
      const rho = spearman(indices[a], indices[b]);
      const topA = top(indices[a]), topB = top(indices[b]);
      const comum = [...topA].filter(i=>topB.has(i)).length;
      return `<tr><td>${LABEL_PESO[a]} × ${LABEL_PESO[b]}</td><td>${rho>=0?'+':''}${fmt(rho,2)}</td><td style="text-align:left; font-family:var(--font-body)">${forcaCorrelacao(rho)}</td><td>${comum} de ${topN}</td></tr>`;
    }).join('') + `</tbody>`;
  document.getElementById('robustezHint').textContent = `— ${completos.length} municípios com índice em ${state.ano}`;
}
