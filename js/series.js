/* =========================================================================
   SÉRIES HISTÓRICAS — evolução estadual de cada indicador ao longo de toda a
   série (2015-2024), independente do ano selecionado no topo da página.
   Também define o gráfico de linhas por ano (desenharLinhasAnos) e os helpers
   de indicador reaproveitados pelo Perfil do Município (js/perfil.js).
   ========================================================================= */

/* investimento total = soma das 3 entidades executoras (prestador/município/estado) que
   tiverem valor — null só quando as 3 estão sem dado. Mesma regra do gráfico de
   investimento do Dashboard: série ausente não entra como zero. */
const CHAVE_INVESTIMENTO_TOTAL = 'investimentoTotalPer100k';
LABELS[CHAVE_INVESTIMENTO_TOTAL] = 'Investimento em saneamento';

/* indicadores exibíveis nas telas de série — os 6 rastreados + investimento total */
const INDICADORES_SERIE = [...TODOS_INDICADORES, CHAVE_INVESTIMENTO_TOTAL];

const UNIDADE_INDICADOR = {
  deficitAgua:'%', deficitEsgoto:'%', deficitResiduos:'%',
  taxaDengue:'/100 mil hab.', taxaChikungunya:'/100 mil hab.', taxaDiarreia:'/100 mil hab.',
  [CHAVE_INVESTIMENTO_TOTAL]:'R$/100 mil hab.',
};
/* em déficit e em taxa de doença, valor maior é pior; em investimento, maior é "mais investido"
   — define o que conta como melhora/piora nas listas de variação e na situação do Perfil. */
function maiorEhPior(chave){ return chave !== CHAVE_INVESTIMENTO_TOTAL; }

function valorIndicador(m, chave){
  if(!m) return null;
  if(chave === CHAVE_INVESTIMENTO_TOTAL){
    const vals = INDICADORES_INVESTIMENTO.map(k=>m[k]).filter(v=>v!==null && v!==undefined);
    return vals.length ? vals.reduce((a,b)=>a+b,0) : null;
  }
  const v = m[chave];
  return (v===null || v===undefined || Number.isNaN(v)) ? null : v;
}

function fmtIndicador(v, chave){
  if(v===null || v===undefined) return '—';
  if(chave === CHAVE_INVESTIMENTO_TOTAL) return 'R$ ' + fmtMoedaCompacta(v);
  if(UNIDADE_INDICADOR[chave] === '%') return fmt(v,1) + '%';
  return fmt(v, v < 10 ? 1 : 0);
}

function anosDaSerie(){
  const anos = [];
  if(!PAINEL) return anos;
  for(let a = PAINEL.anoInicio; a <= PAINEL.anoFim; a++) anos.push(a);
  return anos;
}

/* estatística estadual de um indicador em cada ano — n = municípios com valor apurado */
function estatisticaPorAno(chave, filtro){
  return anosDaSerie().map(a=>{
    const vals = getDataset(a).filter(m => !filtro || filtro(m)).map(m=>valorIndicador(m, chave)).filter(v=>v!==null);
    return { ano:a, n:vals.length, media:media(vals), mediana:quantil(vals,.5), p25:quantil(vals,.25), p75:quantil(vals,.75) };
  });
}

/* ============ GRÁFICO DE LINHAS POR ANO (genérico) ============
   series: [{rotulo, cor, valores:[v|null por ano], largura?, tracejado?}]
   faixa (opcional): {inf:[...], sup:[...], cor} — área sombreada (ex.: P25-P75).
   Valor null quebra a linha (vão explícito) — nunca é interpolado nem ligado por cima do vão. */
function desenharLinhasAnos(svg, {anos, series, faixa, chave, W=900, H=260, compacto=false}){
  clear(svg);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const padL = compacto ? 40 : 56, padR = compacto ? 10 : 18, padT = compacto ? 12 : 16, padB = compacto ? 24 : 30;
  const plotW = W-padL-padR, plotH = H-padT-padB;
  const todos = [...series.flatMap(s=>s.valores), ...(faixa ? faixa.sup : [])].filter(v=>v!==null && v!==undefined);
  if(!todos.length){
    svg.appendChild(svgTexto('Sem dado apurado para este indicador em nenhum ano da série.', W, H));
    return;
  }
  const maxV = Math.max(...todos)*1.12 || 1;
  const sx = i => padL + (anos.length>1 ? i/(anos.length-1)*plotW : plotW/2);
  const sy = v => padT + plotH - (v/maxV)*plotH;
  const fs = compacto ? 9 : 10;
  const rotuloEixo = v => chave===CHAVE_INVESTIMENTO_TOTAL ? fmtMoedaCompacta(v) : fmt(v, maxV<10 ? 1 : 0);

  for(let i=0;i<=4;i++){
    const v = maxV*i/4, y = sy(v);
    svg.appendChild(el('line',{x1:padL, y1:y, x2:W-padR, y2:y, stroke:'var(--border)', 'stroke-width':1}));
    const t = el('text',{x:padL-6, y:y+3, 'text-anchor':'end', 'font-size':fs, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = rotuloEixo(v); svg.appendChild(t);
  }
  anos.forEach((a,i)=>{
    if(compacto && anos.length>6 && i%3!==0 && i!==anos.length-1) return;
    const t = el('text',{x:sx(i), y:H-8, 'text-anchor':'middle', 'font-size':fs, 'font-family':'IBM Plex Mono', fill:'var(--text-muted)'});
    t.textContent = a; svg.appendChild(t);
  });

  /* segmentos contínuos (sem null) — cada vão começa um trecho novo */
  const trechos = (valores) => {
    const out = []; let atual = [];
    valores.forEach((v,i)=>{ if(v===null || v===undefined){ if(atual.length) out.push(atual); atual=[]; } else atual.push(i); });
    if(atual.length) out.push(atual);
    return out;
  };

  if(faixa){
    trechos(faixa.inf.map((v,i)=> (v===null || faixa.sup[i]===null) ? null : v)).forEach(tr=>{
      const topo = tr.map(i=>`${sx(i)} ${sy(faixa.sup[i])}`);
      const base = [...tr].reverse().map(i=>`${sx(i)} ${sy(faixa.inf[i])}`);
      svg.appendChild(el('path',{d:'M'+topo.join(' L')+' L'+base.join(' L')+' Z', fill:faixa.cor, 'fill-opacity':0.16, stroke:'none'}));
    });
  }

  series.forEach(s=>{
    trechos(s.valores).forEach(tr=>{
      const d = tr.map((i,k)=>(k?'L':'M')+sx(i)+' '+sy(s.valores[i])).join(' ');
      const attrs = {d, fill:'none', stroke:s.cor, 'stroke-width':s.largura||2, 'stroke-linecap':'round', 'stroke-linejoin':'round'};
      if(s.tracejado) attrs['stroke-dasharray'] = '5 4';
      svg.appendChild(el('path', attrs));
    });
    s.valores.forEach((v,i)=>{
      if(v===null || v===undefined) return;
      const c = el('circle',{cx:sx(i), cy:sy(v), r:compacto?3:3.6, fill:s.cor, stroke:'var(--surface)', 'stroke-width':1.3});
      const title = document.createElementNS(svgNS,'title');
      title.textContent = `${s.rotulo} · ${anos[i]}: ${fmtIndicador(v, chave)}${chave && UNIDADE_INDICADOR[chave] && UNIDADE_INDICADOR[chave]!=='%' ? ' '+UNIDADE_INDICADOR[chave] : ''}`;
      c.appendChild(title);
      svg.appendChild(c);
    });
  });
}

/* legenda HTML (fora do SVG) — com 5 mesorregiões, rótulo na ponta da linha se sobrepunha */
function legendaHTML(itens){
  return itens.map(it=>`<span class="legenda-item"><span class="legenda-swatch${it.tracejado?' legenda-swatch-tracejado':''}" style="background:${it.cor}"></span>${it.rotulo}</span>`).join('');
}

/* 5 cores distinguíveis pras mesorregiões, dentro da paleta do painel */
const CORES_MESORREGIAO = ['var(--bordo)','var(--terracota)','var(--ambar)','var(--verde)','var(--azul)'];

/* ============ RENDER: SÉRIES HISTÓRICAS ============ */
function popularSelectSerieAnos(){
  const anos = anosDaSerie();
  ['selSerieDe','selSerieAte'].forEach(id=>{
    const sel = document.getElementById(id);
    if(!sel || sel.options.length === anos.length) return;
    clear(sel);
    anos.forEach(a=>{ const o = document.createElement('option'); o.value = a; o.textContent = a; sel.appendChild(o); });
  });
}

/* anos padrão pra comparação De→Até: primeiro e último ano em que o indicador tem dado
   em pelo menos metade dos municípios — senão a comparação cairia num ano quase vazio
   (ex.: esgoto em 2024, resíduos antes de 2023). */
function anosPadraoComparacao(chave){
  const est = estatisticaPorAno(chave);
  const total = getDataset(anosDaSerie()[0]).length || 1;
  const bons = est.filter(e => e.n >= total/2).map(e=>e.ano);
  const comDado = est.filter(e => e.n > 0).map(e=>e.ano);
  const base = bons.length >= 2 ? bons : comDado;
  return base.length ? { de: base[0], ate: base[base.length-1] } : null;
}

function renderSeries(){
  const chave = state.serieIndicador;
  const svgEstado = document.getElementById('chartSerieEstado');
  const svgMeso = document.getElementById('chartSerieMeso');
  if(!PAINEL){ clear(svgEstado); clear(svgMeso); return; }
  popularSelectSerieAnos();

  if(state.serieDe === null || state.serieAte === null){
    const padrao = anosPadraoComparacao(chave);
    state.serieDe = padrao ? padrao.de : PAINEL.anoInicio;
    state.serieAte = padrao ? padrao.ate : PAINEL.anoFim;
  }
  document.getElementById('selSerieIndicador').value = chave;
  document.getElementById('selSerieDe').value = state.serieDe;
  document.getElementById('selSerieAte').value = state.serieAte;

  const anos = anosDaSerie();
  const est = estatisticaPorAno(chave);
  const unidade = UNIDADE_INDICADOR[chave];
  const total = getDataset(anos[0]).length;

  /* --- gráfico estadual: mediana + faixa interquartil + média --- */
  desenharLinhasAnos(svgEstado, {
    anos, chave,
    faixa: { inf: est.map(e=>e.p25), sup: est.map(e=>e.p75), cor:'var(--bordo)' },
    series: [
      { rotulo:'Média', cor:'var(--text-muted)', valores: est.map(e=>e.media), tracejado:true },
      { rotulo:'Mediana', cor:'var(--bordo)', valores: est.map(e=>e.mediana), largura:2.6 },
    ],
  });
  document.getElementById('legendaSerieEstado').innerHTML = legendaHTML([
    { rotulo:'Mediana dos municípios', cor:'var(--bordo)' },
    { rotulo:'Média', cor:'var(--text-muted)', tracejado:true },
    { rotulo:'Faixa interquartil (50% centrais dos municípios)', cor:'color-mix(in srgb, var(--bordo) 22%, transparent)' },
  ]);
  document.getElementById('serieEstadoHint').textContent = `— ${LABELS[chave]} (${unidade}), ${anos[0]}-${anos[anos.length-1]}`;
  document.getElementById('tabelaSerieEstado').innerHTML =
    `<thead><tr><th>Ano</th><th>Municípios com dado</th><th>P25</th><th>Mediana</th><th>P75</th><th>Média</th></tr></thead><tbody>` +
    est.map(e=>`<tr><td>${e.ano}</td><td>${e.n} de ${total}</td><td>${fmtIndicador(e.p25,chave)}</td><td>${fmtIndicador(e.mediana,chave)}</td><td>${fmtIndicador(e.p75,chave)}</td><td>${fmtIndicador(e.media,chave)}</td></tr>`).join('') +
    `</tbody>`;

  /* --- média por mesorregião --- */
  const mesos = [...new Set(getDataset(anos[0]).map(m=>m.mesorregiao).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const seriesMeso = mesos.map((meso,i)=>({
    rotulo: meso, cor: CORES_MESORREGIAO[i % CORES_MESORREGIAO.length],
    valores: estatisticaPorAno(chave, m=>m.mesorregiao===meso).map(e=>e.media),
  }));
  desenharLinhasAnos(svgMeso, { anos, chave, series: seriesMeso });
  document.getElementById('legendaSerieMeso').innerHTML = legendaHTML(seriesMeso.map(s=>({rotulo:s.rotulo.replace(/ Pernambucan[oa]/,''), cor:s.cor})));

  /* --- variação De → Até, por município --- */
  const de = Number(state.serieDe), ate = Number(state.serieAte);
  const dadosDe = getDataset(de), dadosAte = getDataset(ate);
  const porCodigoDe = new Map(dadosDe.map(m=>[m.codigo, m]));
  const variacoes = dadosAte.map(m=>{
    const vDe = valorIndicador(porCodigoDe.get(m.codigo), chave), vAte = valorIndicador(m, chave);
    return (vDe===null || vAte===null) ? null : { m, vDe, vAte, delta: vAte - vDe };
  }).filter(Boolean);

  const sinalMelhora = maiorEhPior(chave) ? -1 : 1; // em déficit/doença, melhorar = diminuir
  const melhoraram = variacoes.filter(v => v.delta*sinalMelhora > 0);
  const pioraram = variacoes.filter(v => v.delta*sinalMelhora < 0);
  const estDe = est.find(e=>e.ano===de), estAte = est.find(e=>e.ano===ate);
  const deltaMediana = (estDe && estAte && estDe.mediana!==null && estAte.mediana!==null) ? estAte.mediana - estDe.mediana : null;

  const cards = document.getElementById('cardsSeries');
  const mesmoAno = de === ate;
  cards.innerHTML = `
    <div class="card accent-bordo">
      <span class="card-label">Mediana em ${ate}</span>
      <span class="card-value">${fmtIndicador(estAte && estAte.mediana, chave)}</span>
      <span class="card-sub">${estAte ? `${estAte.n} de ${total} municípios com dado` : '—'}</span>
    </div>
    <div class="card accent-terracota">
      <span class="card-label">Variação da mediana</span>
      <span class="card-value">${deltaMediana===null ? '—' : (deltaMediana>=0?'+':'') + (chave===CHAVE_INVESTIMENTO_TOTAL ? fmtMoedaCompacta(deltaMediana) : fmt(deltaMediana,1))}</span>
      <span class="card-sub">${de} → ${ate}${unidade==='%' ? ' · pontos percentuais' : ' · '+unidade}</span>
    </div>
    <div class="card accent-verde">
      <span class="card-label">Municípios que melhoraram</span>
      <span class="card-value">${mesmoAno || !variacoes.length ? '—' : melhoraram.length}</span>
      <span class="card-sub">${variacoes.length ? `de ${variacoes.length} com dado nos dois anos` : 'nenhum município com dado nos dois anos'}</span>
    </div>
    <div class="card accent-ambar">
      <span class="card-label">Municípios que pioraram</span>
      <span class="card-value">${mesmoAno || !variacoes.length ? '—' : pioraram.length}</span>
      <span class="card-sub">${maiorEhPior(chave) ? 'valor aumentou no período' : 'investimento diminuiu no período'}</span>
    </div>`;

  const TOP = 10;
  const tabelaVariacao = (lista, host) => {
    if(mesmoAno || !lista.length){
      host.innerHTML = `<tbody><tr><td style="text-align:center; font-family:var(--font-body); color:var(--text-muted); white-space:normal">${mesmoAno ? 'Escolha dois anos diferentes para comparar.' : 'Nenhum município nesta situação no período.'}</td></tr></tbody>`;
      return;
    }
    host.innerHTML = `<thead><tr><th>#</th><th>Município</th><th>${de}</th><th>${ate}</th><th>Variação</th></tr></thead><tbody>` +
      lista.slice(0,TOP).map((v,i)=>`<tr class="linha-clicavel" data-codigo="${v.m.codigo}"><td>${i+1}</td><td>${v.m.nome}</td><td>${fmtIndicador(v.vDe,chave)}</td><td>${fmtIndicador(v.vAte,chave)}</td><td>${v.delta>=0?'+':''}${chave===CHAVE_INVESTIMENTO_TOTAL ? fmtMoedaCompacta(v.delta) : fmt(v.delta,1)}</td></tr>`).join('') +
      `</tbody>`;
  };
  tabelaVariacao([...melhoraram].sort((a,b)=>(b.delta-a.delta)*sinalMelhora), document.getElementById('tabelaSerieMelhoras'));
  tabelaVariacao([...pioraram].sort((a,b)=>(a.delta-b.delta)*sinalMelhora), document.getElementById('tabelaSeriePioras'));
  document.querySelectorAll('.serie-periodo').forEach(n => n.textContent = `${de} → ${ate}`);
}
