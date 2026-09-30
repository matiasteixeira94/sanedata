/* =========================================================================
   SIMULADOR DE CENÁRIOS — "e se o município X melhorasse o indicador Y?"
   Recalcula o índice de priorização do ano trocando só os valores do
   município selecionado e mostra o novo índice, a nova posição e a
   contribuição de cada indicador antes × depois.

   O recálculo é feito sobre o grupo inteiro (não só o município): o índice
   normaliza cada indicador pelo mínimo/máximo do ano, e os pesos de
   entropia/PCA dependem de todos os municípios — se o simulado era o
   máximo de um indicador, reduzir o valor dele muda a régua de todo mundo.
   Nenhum valor simulado é salvo nem aparece fora desta tela: o cenário é
   hipotético e explicitamente rotulado assim.
   ========================================================================= */

/* cenário atual: chave `${codigo}|${ano}` + valores ajustados. Trocar município ou
   ano descarta o cenário (valores de outro município/ano não fazem sentido aqui). */
let cenario = { chave:null, valores:{} };

function valoresReais(m){
  return Object.fromEntries(INDICADORES_INDICE.map(k => [k, m[k]]));
}

/* índice, posição e contribuições com os valores do município trocados pelos do cenário */
function simularIndice(ano, peso, municipio, novosValores){
  const { completos } = indiceCompletoCache(ano, 'igual');
  const pos = completos.indexOf(municipio);
  const dados = completos.map(m => m === municipio ? { ...m, ...novosValores } : m);
  const matrix = buildMatrix(dados, INDICADORES_INDICE);
  const pesos = computeWeights(peso, matrix);
  const idx = matrix.map(row => row.reduce((acc,v,j)=>acc+v*pesos[j],0)*100);
  return {
    dados, idx, pos,
    valor: idx[pos],
    rank: rankDesc(idx)[pos],
    contribuicoes: INDICADORES_INDICE.map((k,j) => matrix[pos][j]*pesos[j]*100),
  };
}

/* limite do controle deslizante: déficit vai de 0 a 100%; taxa de doença, de 0 ao
   maior valor observado no ano (com folga), senão um município extremo não caberia */
function limiteSimulacao(chave, completos){
  if(UNIDADE_INDICADOR[chave] === '%') return { max:100, passo:0.1 };
  const max = Math.max(...completos.map(m=>m[chave]));
  return { max: Math.ceil(max*1.1/10)*10 || 100, passo:1 };
}

const CENARIOS_PRONTOS = [
  { id:'universalizar', rotulo:'Universalizar água e esgoto', aplicar:(v)=>({ ...v, deficitAgua:0, deficitEsgoto:0 }) },
  { id:'metadeDeficit', rotulo:'Reduzir déficits pela metade', aplicar:(v)=>({ ...v, deficitAgua:v.deficitAgua/2, deficitEsgoto:v.deficitEsgoto/2 }) },
  { id:'metadeDoencas', rotulo:'Reduzir doenças pela metade', aplicar:(v)=>({ ...v, ...Object.fromEntries(INDICADORES_SAUDE.map(k=>[k, v[k]/2])) }) },
  { id:'media', rotulo:'Levar à média de PE o que está pior que ela', aplicar:(v, medias)=>
      Object.fromEntries(INDICADORES_INDICE.map(k=>[k, Math.min(v[k], medias[k])])) },
];

function renderSimulador(){
  const dataAno = getDataset(state.ano);
  const aviso = document.getElementById('simAviso');
  const conteudo = document.getElementById('simConteudo');
  const peso = state.peso || 'igual';
  document.getElementById('selSimPeso').value = peso;

  if(!dataAno.length){ aviso.innerHTML = placeholderHTML('Sem dados carregados', 'Aguarde o carregamento dos dados.'); conteudo.hidden = true; return; }

  const m = dataAno[state.municipioIdx] || dataAno[0];
  const { completos } = indiceCompletoCache(state.ano, 'igual');
  document.getElementById('simMunicipio').textContent = `${m.nome}-${m.uf}`;
  document.getElementById('simAno').textContent = state.ano;

  if(completos.length < 3 || !completos.includes(m)){
    const faltando = INDICADORES_INDICE.filter(k => m[k]===null || m[k]===undefined).map(k=>LABELS[k].toLowerCase());
    aviso.innerHTML = placeholderHTML('Simulação indisponível para este município/ano',
      completos.length < 3
        ? `Menos de 3 municípios têm os ${INDICADORES_INDICE.length} indicadores do índice completos em ${state.ano}. Escolha outro ano no topo da página.`
        : `${m.nome} não tem ${faltando.join(', ')} apurado em ${state.ano}, então não tem índice calculado — e o painel não inventa o valor que falta. Escolha outro ano ou outro município no topo da página.`);
    conteudo.hidden = true;
    return;
  }
  aviso.innerHTML = '';
  conteudo.hidden = false;

  const chave = `${m.codigo}|${state.ano}`;
  if(cenario.chave !== chave) cenario = { chave, valores: valoresReais(m) };

  montarControlesSimulacao(m, completos);
  atualizarResultadoSimulacao();
}

/* os controles só são recriados quando o município/ano muda — recriá-los a cada
   movimento do slider faria o usuário perder o arraste no meio do gesto */
let controlesMontadosPara = null;
function montarControlesSimulacao(m, completos){
  const host = document.getElementById('simControles');
  if(controlesMontadosPara === cenario.chave) return;
  controlesMontadosPara = cenario.chave;
  host.innerHTML = INDICADORES_INDICE.map(k=>{
    const { max, passo } = limiteSimulacao(k, completos);
    return `<div class="sim-controle" data-chave="${k}">
      <div class="sim-controle-topo">
        <label for="simRange_${k}">${LABELS[k]} <span class="hint">${UNIDADE_INDICADOR[k]}</span></label>
        <span class="sim-real">real: <strong>${fmtIndicador(m[k], k)}</strong></span>
      </div>
      <div class="sim-controle-linha">
        <input type="range" id="simRange_${k}" min="0" max="${max}" step="${passo}" data-chave="${k}">
        <input type="number" id="simNum_${k}" min="0" step="${passo}" data-chave="${k}" aria-label="${LABELS[k]} simulado">
      </div>
      <span class="sim-delta" id="simDelta_${k}"></span>
    </div>`;
  }).join('');
}

function atualizarResultadoSimulacao(){
  const dataAno = getDataset(state.ano);
  const m = dataAno[state.municipioIdx];
  const peso = state.peso || 'igual';
  const real = simularIndice(state.ano, peso, m, {});
  const sim = simularIndice(state.ano, peso, m, cenario.valores);

  /* controles refletem o cenário (preset ou reset também passam por aqui) */
  INDICADORES_INDICE.forEach(k=>{
    const v = cenario.valores[k];
    const range = document.getElementById('simRange_'+k), num = document.getElementById('simNum_'+k);
    if(Number(range.value) !== v) range.value = v;
    if(document.activeElement !== num) num.value = round1(v);
    const delta = v - m[k];
    const deltaHost = document.getElementById('simDelta_'+k);
    deltaHost.className = 'sim-delta ' + (delta < 0 ? 'delta-melhor' : delta > 0 ? 'delta-pior' : '');
    deltaHost.textContent = Math.abs(delta) < 0.05 ? 'sem alteração'
      : `${delta<0?'▼ −':'▲ +'}${fmt(Math.abs(delta),1)}${UNIDADE_INDICADOR[k]==='%' ? ' p.p.' : ''} em relação ao real`;
  });

  const alterado = INDICADORES_INDICE.some(k => Math.abs(cenario.valores[k]-m[k]) >= 0.05);
  const n = real.idx.length;
  const deltaIdx = sim.valor - real.valor;
  const deltaRank = sim.rank - real.rank; // positivo = número da posição aumentou = menos prioritário

  document.getElementById('simCards').innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Índice de priorização</span>
      <span class="card-value">${fmt(real.valor,1)} <span class="sim-seta">→</span> ${fmt(sim.valor,1)}</span>
      <span class="card-sub">${alterado ? `${deltaIdx<=0?'−':'+'}${fmt(Math.abs(deltaIdx),1)} ponto(s) no cenário` : 'ajuste um indicador para simular'}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Posição no ranking</span>
      <span class="card-value">${real.rank}ª <span class="sim-seta">→</span> ${sim.rank}ª</span>
      <span class="card-sub">de ${n} municípios · 1ª = maior prioridade</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Efeito no ranking</span>
      <span class="card-value">${deltaRank===0 ? '=' : (deltaRank>0?'↓ ':'↑ ')+Math.abs(deltaRank)}</span>
      <span class="card-sub">${deltaRank===0 ? 'mantém a posição' : deltaRank>0 ? `cai ${deltaRank} posição(ões) — passa a ser menos prioritário` : `sobe ${-deltaRank} posição(ões) — passa a ser mais prioritário`}</span>
    </div>`;

  desenharContribuicoesSimulacao(document.getElementById('chartSimContrib'), real.contribuicoes, sim.contribuicoes);
  renderVizinhancaSimulacao(document.getElementById('simVizinhanca'), sim, m);

  const escalaMudou = alterado && INDICADORES_INDICE.some(k=>{
    const outros = real.dados.filter(d=>d!==m).map(d=>d[k]);
    return m[k] > Math.max(...outros) || m[k] < Math.min(...outros);
  });
  document.getElementById('simNotaEscala').textContent = escalaMudou
    ? `Atenção: ${m.nome} é o máximo ou o mínimo do estado em algum indicador, então alterar o valor dele muda a régua (mínimo/máximo) usada para todos os municípios — por isso o índice de outros municípios também se move neste cenário.`
    : '';
}

/* barras horizontais pareadas: contribuição real (cinza) × simulada (bordô), em pontos do índice */
function desenharContribuicoesSimulacao(svg, reais, simuladas){
  clear(svg);
  const W=480, padL=130, padR=56, padT=8, barH=11, gapPar=3, gapGrupo=14;
  const H = padT + INDICADORES_INDICE.length*(barH*2+gapPar+gapGrupo);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const maxC = Math.max(...reais, ...simuladas)*1.1 || 1;
  INDICADORES_INDICE.forEach((k,i)=>{
    const y = padT + i*(barH*2+gapPar+gapGrupo);
    const lbl = el('text',{x:padL-10, y:y+barH+4, 'text-anchor':'end', 'font-size':11.5, 'font-family':'IBM Plex Sans', fill:'var(--text)'});
    lbl.textContent = LABELS[k]; svg.appendChild(lbl);
    [[reais[i],'var(--text-muted)',y,'real'],[simuladas[i],'var(--bordo)',y+barH+gapPar,'cenário']].forEach(([v,cor,by,rot])=>{
      const w = Math.max((v/maxC)*(W-padL-padR), 1);
      const r = el('rect',{x:padL, y:by, width:w, height:barH, rx:3, fill:cor});
      const t = document.createElementNS(svgNS,'title'); t.textContent = `${LABELS[k]} (${rot}): ${fmt(v,1)} pts`; r.appendChild(t);
      svg.appendChild(r);
      const val = el('text',{x:padL+w+6, y:by+barH-2, 'font-size':10, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
      val.textContent = fmt(v,1); svg.appendChild(val);
    });
  });
}

/* recorte do ranking simulado em torno do município (3 acima, 3 abaixo) */
function renderVizinhancaSimulacao(host, sim, m){
  const ordem = sim.dados.map((d,i)=>({d, v:sim.idx[i]})).sort((a,b)=>b.v-a.v);
  const pos = ordem.findIndex(o => o.d.codigo === m.codigo);
  const ini = Math.max(0, pos-3), fim = Math.min(ordem.length, pos+4);
  host.innerHTML = ordem.slice(ini, fim).map((o,i)=>{
    const sel = o.d.codigo === m.codigo;
    return `<div class="rank-item${sel?' rank-item-selecionado':''}">
      <span class="rank-pos">${ini+i+1}º</span>
      <span class="rank-name"><strong>${o.d.nome}</strong><span>${o.d.mesorregiao || ''}${sel?' · <strong>cenário simulado</strong>':''}</span></span>
      <span class="rank-value">${fmt(o.v,1)}</span>
    </div>`;
  }).join('');
}

/* ============ EVENTOS ============ */
document.getElementById('simControles').addEventListener('input', (e)=>{
  const k = e.target.dataset.chave;
  if(!k) return;
  const v = Number(e.target.value);
  if(e.target.value === '' || Number.isNaN(v) || v < 0) return; // campo numérico sendo apagado/digitado — espera um número válido
  cenario.valores[k] = v;
  atualizarResultadoSimulacao();
});
document.getElementById('simPresets').addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-preset]');
  if(!btn) return;
  const m = getDataset(state.ano)[state.municipioIdx];
  if(btn.dataset.preset === 'reset'){ cenario.valores = valoresReais(m); }
  else {
    const { completos } = indiceCompletoCache(state.ano, 'igual');
    const medias = Object.fromEntries(INDICADORES_INDICE.map(k=>[k, media(completos.map(d=>d[k]))]));
    const preset = CENARIOS_PRONTOS.find(c => c.id === btn.dataset.preset);
    cenario.valores = preset.aplicar(valoresReais(m), medias); // sempre a partir do real, não acumula presets
  }
  atualizarResultadoSimulacao();
});
document.getElementById('simPresets').innerHTML =
  CENARIOS_PRONTOS.map(c=>`<button class="pill" type="button" data-preset="${c.id}">${c.rotulo}</button>`).join('') +
  `<button class="pill pill-reset" type="button" data-preset="reset">↺ Voltar aos valores reais</button>`;
document.getElementById('selSimPeso').addEventListener('change', (e)=>{
  state.peso = e.target.value;
  // mantém as pílulas do Dashboard coerentes — é o mesmo esquema de pesos do painel inteiro
  document.querySelectorAll('#pillsPeso .pill').forEach(p=>p.classList.toggle('active', p.dataset.peso===state.peso));
  renderSimulador();
});
