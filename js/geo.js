/* =========================================================================
   MAPA GEOGRÁFICO — projeção e render dos polígonos municipais de PE, a
   partir de data/processed/malha_municipios_pe.geojson (gerado pelo passo
   06 do pipeline, ver data/scripts/README.md). Fernando de Noronha (a
   ~350 km da costa) é excluído do bbox principal e desenhado à parte, num
   quadro menor (inset) — do contrário o continente encolheria a um ponto.
   ========================================================================= */
const CODIGO_FERNANDO_DE_NORONHA = 2605459;

let MALHA = null;            // FeatureCollection bruta
let malhaPorCodigo = null;   // Map<codigo_ibge:number, feature>
let malhaErro = null;
/* o município selecionado no mapa é o mesmo de todo o painel (state.municipioIdx,
   controlado também pela busca no topo da página e pelo ranking do Dashboard) —
   não existe mais uma seleção separada só do mapa. */

/* pontos de atenção: curadoria manual (ver data/processed/README.md) — carregados do
   arquivo publicado + o que for adicionado nesta sessão via "modo curadoria", antes de
   baixar o JSON atualizado pra substituir o arquivo e publicar de vez. */
let PONTOS_ATENCAO = [];
let modoCuradoria = false;
let mapaProjecaoAtual = null; // {box, largura, alturaContinente, padding} do último render, pro clique do modo curadoria

async function carregarMalha(){
  const resp = await fetch('data/processed/malha_municipios_pe.geojson', { cache:'no-cache' });
  if(!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar data/processed/malha_municipios_pe.geojson`);
  MALHA = await resp.json();
  malhaPorCodigo = new Map(MALHA.features.map(f => [Number(f.properties.codarea), f]));
}

async function carregarPontosAtencao(){
  try{
    const resp = await fetch('data/processed/pontos_atencao.json', { cache:'no-cache' });
    if(resp.ok){
      const payload = await resp.json();
      PONTOS_ATENCAO = Array.isArray(payload.pontos) ? payload.pontos : [];
    }
  }catch(e){ /* arquivo opcional — sem pontos ainda não é erro */ }
}

/* ============ GEOMETRIA / PROJEÇÃO ============ */
function bboxDeFeatures(features){
  let minLon=Infinity, maxLon=-Infinity, minLat=Infinity, maxLat=-Infinity;
  function walk(coords, depth){
    if(depth===0){
      const [lon,lat] = coords;
      if(lon<minLon) minLon=lon; if(lon>maxLon) maxLon=lon;
      if(lat<minLat) minLat=lat; if(lat>maxLat) maxLat=lat;
      return;
    }
    coords.forEach(c => walk(c, depth-1));
  }
  features.forEach(f => {
    const g = f.geometry;
    const depth = g.type==='Polygon' ? 2 : g.type==='MultiPolygon' ? 3 : 1;
    walk(g.coordinates, depth);
  });
  return {minLon,maxLon,minLat,maxLat};
}

/* projeção equiretangular com correção de cosseno de latitude (adequada
   para a extensão pequena de um estado; PE cabe em ~2,5° de latitude) */
function criarProjecao(box, width, height, padding){
  const latMedia = (box.minLat+box.maxLat)/2;
  const cosLat = Math.cos(latMedia * Math.PI/180);
  const lonSpan = Math.max((box.maxLon-box.minLon) * cosLat, 1e-9);
  const latSpan = Math.max(box.maxLat-box.minLat, 1e-9);
  const plotW = width - padding*2, plotH = height - padding*2;
  const escala = Math.min(plotW/lonSpan, plotH/latSpan);
  const offX = padding + (plotW - lonSpan*escala)/2;
  const offY = padding + (plotH - latSpan*escala)/2;
  return ([lon,lat]) => [
    offX + (lon-box.minLon)*cosLat*escala,
    offY + (box.maxLat-lat)*escala, // y invertido: norte fica pra cima
  ];
}

/* inversa de criarProjecao — usada só pelo modo curadoria, pra converter um clique no
   SVG (x,y do viewBox) de volta em [lon,lat] e registrar um ponto de atenção. */
function inverterProjecao(box, width, height, padding){
  const latMedia = (box.minLat+box.maxLat)/2;
  const cosLat = Math.cos(latMedia * Math.PI/180);
  const lonSpan = Math.max((box.maxLon-box.minLon) * cosLat, 1e-9);
  const latSpan = Math.max(box.maxLat-box.minLat, 1e-9);
  const plotW = width - padding*2, plotH = height - padding*2;
  const escala = Math.min(plotW/lonSpan, plotH/latSpan);
  const offX = padding + (plotW - lonSpan*escala)/2;
  const offY = padding + (plotH - latSpan*escala)/2;
  return (x,y) => [
    (x-offX)/(cosLat*escala) + box.minLon,
    box.maxLat - (y-offY)/escala,
  ];
}

function alturaParaLargura(box, width, padding){
  const latMedia = (box.minLat+box.maxLat)/2;
  const cosLat = Math.cos(latMedia * Math.PI/180);
  const lonSpan = Math.max((box.maxLon-box.minLon) * cosLat, 1e-9);
  const latSpan = Math.max(box.maxLat-box.minLat, 1e-9);
  const plotW = width - padding*2;
  return plotW * (latSpan/lonSpan) + padding*2;
}

function anelParaPath(anel, projetar){
  return anel.map((pt,i) => (i===0?'M':'L') + projetar(pt).map(v=>v.toFixed(2)).join(',')).join(' ') + 'Z';
}
function geometriaParaPath(geom, projetar){
  if(geom.type==='Polygon') return geom.coordinates.map(a=>anelParaPath(a,projetar)).join(' ');
  if(geom.type==='MultiPolygon') return geom.coordinates.map(poly=>poly.map(a=>anelParaPath(a,projetar)).join(' ')).join(' ');
  return '';
}

/* ============ ESCALA DE COR (reaproveita a paleta do painel) ============ */
function corCss(nomeVar){ return getComputedStyle(document.documentElement).getPropertyValue(nomeVar).trim(); }
function hexParaRgb(hex){
  hex = hex.replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const num = parseInt(hex,16);
  return [(num>>16)&255, (num>>8)&255, num&255];
}
function misturarCor(c1,c2,t){ return c1.map((v,i)=>Math.round(v+(c2[i]-v)*t)); }
function escalaCor(t){
  t = Math.max(0, Math.min(1, t));
  const verde = hexParaRgb(corCss('--verde')), ambar = hexParaRgb(corCss('--ambar')), terracota = hexParaRgb(corCss('--terracota'));
  const rgb = t<0.5 ? misturarCor(verde, ambar, t/0.5) : misturarCor(ambar, terracota, (t-0.5)/0.5);
  return `rgb(${rgb.join(',')})`;
}
function corSemDado(){ return corCss('--border'); }

/* ============ CAMADAS EXIBÍVEIS NO MAPA ============ */
/* "investimento" não é um dado novo — é a mesma leitura de sempre neste painel (déficit
   é sempre 100 - cobertura, ver data/scripts/README.md), só invertida: quanto menor o
   déficit de água/esgoto/resíduos, mais cobertura de infraestrutura o município tem, o
   que serve de proxy de quanto já foi investido nela historicamente. */
const CAMADA_INVESTIMENTO = { investAgua: 'deficitAgua', investEsgoto: 'deficitEsgoto', investResiduos: 'deficitResiduos' };
const LABEL_INVESTIMENTO = {
  investAgua: 'Investimento — Abastecimento de água',
  investEsgoto: 'Investimento — Esgotamento sanitário',
  investResiduos: 'Investimento — Resíduos sólidos',
};
const UNIDADE_CAMADA = {
  indice: '/ 100', deficitAgua: '%', deficitEsgoto: '%', deficitResiduos: '%',
  taxaDengue: '/100 mil hab.', taxaChikungunya: '/100 mil hab.', taxaDiarreia: '/100 mil hab.',
  investAgua: '%', investEsgoto: '%', investResiduos: '%',
};
function rotuloCamada(camada){
  if(camada === 'indice') return 'Índice de priorização (composto)';
  if(LABEL_INVESTIMENTO[camada]) return LABEL_INVESTIMENTO[camada];
  return LABELS[camada];
}

/* retorna Map<codigo_ibge, valor|null> para a camada e ano selecionados */
function valoresPorCamada(dataAno, camada){
  const mapa = new Map();
  if(camada === 'indice'){
    const { completos, idx } = indiceCompletoCache(state.ano, state.peso || 'igual');
    completos.forEach((m,i) => mapa.set(m.codigo, idx[i]));
  } else if(CAMADA_INVESTIMENTO[camada]){
    const chaveDeficit = CAMADA_INVESTIMENTO[camada];
    dataAno.forEach(m => {
      const d = m[chaveDeficit];
      mapa.set(m.codigo, (d===null || d===undefined) ? null : round1(100-d));
    });
  } else {
    dataAno.forEach(m => mapa.set(m.codigo, m[camada] ?? null));
  }
  return mapa;
}

/* ============ RENDER ============ */
function renderMapaGeo(){
  const svg = document.getElementById('mapaGeografico');
  const legendaHost = document.getElementById('mapaLegenda');
  const hintHost = document.getElementById('mapaCamadaHint');
  if(!svg) return;

  if(malhaErro){
    svg.parentElement.innerHTML = placeholderHTML('Não foi possível carregar a malha geográfica',
      `Falha ao buscar <code>data/processed/malha_municipios_pe.geojson</code> (${malhaErro.message}). ` +
      `Rode <code>python data/scripts/06_ibge_malha_municipios.py</code> (ver <code>data/scripts/README.md</code>).`);
    legendaHost.innerHTML = '';
    return;
  }

  const dataAno = getDataset(state.ano);
  const municipioSel = dataAno[state.municipioIdx] || null;
  const codigoSelecionado = municipioSel ? municipioSel.codigo : null;
  const camada = state.mapaCamada || 'indice';
  hintHost.textContent = `— ${rotuloCamada(camada)}, ${state.ano}`;

  const valores = valoresPorCamada(dataAno, camada);
  const valsValidos = [...valores.values()].filter(v => v !== null && v !== undefined);
  const min = valsValidos.length ? Math.min(...valsValidos) : 0;
  const max = valsValidos.length ? Math.max(...valsValidos) : 1;

  const featuresContinente = MALHA.features.filter(f => Number(f.properties.codarea) !== CODIGO_FERNANDO_DE_NORONHA);
  const boxContinente = bboxDeFeatures(featuresContinente);
  const largura = 640, padding = 10;
  const alturaContinente = alturaParaLargura(boxContinente, largura, padding);
  const alturaInset = 116;
  const alturaTotal = alturaContinente + alturaInset;

  svg.setAttribute('viewBox', `0 0 ${largura} ${alturaTotal}`);
  clear(svg);

  const projetar = criarProjecao(boxContinente, largura, alturaContinente, padding);
  /* guardado pro clique do "modo curadoria" conseguir inverter x,y -> lon,lat depois */
  mapaProjecaoAtual = { box: boxContinente, largura, alturaContinente, padding };

  function corDoMunicipio(codigo){
    const v = valores.get(codigo);
    if(v === null || v === undefined) return corSemDado();
    return escalaCor(max>min ? (v-min)/(max-min) : 0.5);
  }

  function desenharMunicipio(feature, projetarFn){
    const codigo = Number(feature.properties.codarea);
    const d = geometriaParaPath(feature.geometry, projetarFn);
    const path = el('path', {
      d, fill: corDoMunicipio(codigo), class: 'path-municipio',
      'data-codigo': codigo,
    });
    if(codigo === codigoSelecionado) path.classList.add('selecionado');
    svg.appendChild(path);
  }

  svg.appendChild(el('rect', {x:0, y:0, width:largura, height:alturaContinente, fill:'transparent', id:'mapaFundo'}));
  featuresContinente.forEach(f => desenharMunicipio(f, projetar));

  /* pontos de atenção: um marcador por ponto curado (ver data/processed/README.md),
     cor por categoria, sempre com título nativo — nunca só a cor carregando o sentido */
  const CATEGORIA_COR = { agua:'var(--bordo)', esgoto:'var(--terracota)', residuos:'var(--ambar)', outro:'var(--text-muted)' };
  PONTOS_ATENCAO.forEach(p=>{
    if(typeof p.lon !== 'number' || typeof p.lat !== 'number') return;
    const [x,y] = projetar([p.lon, p.lat]);
    if(x<0 || x>largura || y<0 || y>alturaContinente) return; // fora do continente (ex.: erro de digitação) — não desenha
    const cor = CATEGORIA_COR[p.categoria] || CATEGORIA_COR.outro;
    const marcador = el('path', {
      d: `M ${x} ${y-6} c -3.3 0 -6 2.7 -6 6 c 0 4.5 6 10 6 10 s 6 -5.5 6 -10 c 0 -3.3 -2.7 -6 -6 -6 Z`,
      fill: cor, stroke: 'var(--surface)', 'stroke-width': 1, class: 'ponto-atencao',
    });
    const title = document.createElementNS(svgNS, 'title');
    title.textContent = `${p.endereco || 'Ponto de atenção'}${p.categoria ? ' — ' + p.categoria : ''}${p.descricao ? ': ' + p.descricao : ''}`;
    marcador.appendChild(title);
    svg.appendChild(marcador);
  });

  // inset de Fernando de Noronha
  const featureNoronha = malhaPorCodigo.get(CODIGO_FERNANDO_DE_NORONHA);
  if(featureNoronha){
    const insetW = 130, insetH = alturaInset-26, insetX = largura-insetW-10, insetY = alturaContinente+10;
    svg.appendChild(el('rect', {x:insetX, y:insetY, width:insetW, height:insetH, rx:8, fill:'var(--surface-alt)', stroke:'var(--border)', 'stroke-width':1}));
    const boxNoronha = bboxDeFeatures([featureNoronha]);
    const projetarNoronha = criarProjecao(boxNoronha, insetW, insetH, 14);
    const dNoronha = geometriaParaPath(featureNoronha.geometry, ([lon,lat]) => {
      const [x,y] = projetarNoronha([lon,lat]);
      return [insetX+x, insetY+y];
    });
    const pathNoronha = el('path', { d: dNoronha, fill: corDoMunicipio(CODIGO_FERNANDO_DE_NORONHA), class:'path-municipio', 'data-codigo': CODIGO_FERNANDO_DE_NORONHA });
    if(CODIGO_FERNANDO_DE_NORONHA === codigoSelecionado) pathNoronha.classList.add('selecionado');
    svg.appendChild(pathNoronha);
    const rotulo = el('text', {x:insetX+insetW/2, y:insetY+insetH+16, 'text-anchor':'middle', 'font-size':10, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    rotulo.textContent = 'Fernando de Noronha (fora de escala)';
    svg.appendChild(rotulo);
  }

  renderLegenda(legendaHost, camada, min, max, valsValidos.length>0);
}

function renderLegenda(host, camada, min, max, temDados){
  if(!temDados){
    const ehSaneamento = INDICADORES_DEFICIT.includes(camada) || CAMADA_INVESTIMENTO[camada];
    host.innerHTML = `<span class="legenda-swatch" style="background:${corSemDado()}"></span> nenhum dado apurado para esta camada/ano ${camada!=='indice' && ehSaneamento ? '(SINISA/SNIS ainda não importado — ver data/scripts/README.md)' : ''}`;
    return;
  }
  host.innerHTML = `
    <span class="legenda-rotulo">${fmt(min,1)}${UNIDADE_CAMADA[camada]}</span>
    <span class="legenda-barra"></span>
    <span class="legenda-rotulo">${fmt(max,1)}${UNIDADE_CAMADA[camada]}</span>
    <span class="legenda-item"><span class="legenda-swatch" style="background:${corSemDado()}"></span>sem dado apurado</span>`;
}

/* ============ INTERAÇÃO (delegada, ligada uma única vez) ============ */
(function ligarEventosMapa(){
  const svg = document.getElementById('mapaGeografico');
  const tooltip = document.getElementById('mapaTooltip');
  if(!svg || !tooltip) return;

  svg.addEventListener('mousemove', (e) => {
    const path = e.target.closest('path.path-municipio');
    if(!path){ tooltip.style.display = 'none'; return; }
    const codigo = Number(path.dataset.codigo);
    const dataAno = getDataset(state.ano);
    const m = dataAno.find(d => d.codigo === codigo);
    if(!m){ tooltip.style.display = 'none'; return; }
    const valores = valoresPorCamada(dataAno, state.mapaCamada || 'indice');
    const v = valores.get(codigo);
    const camada = state.mapaCamada || 'indice';
    tooltip.innerHTML = `<strong>${m.nome}-${m.uf}</strong><br>${rotuloCamada(camada)}: ${v===null||v===undefined?'sem dado':fmt(v,1)+' '+UNIDADE_CAMADA[camada]}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX+14)+'px';
    tooltip.style.top = (e.clientY+14)+'px';
  });
  svg.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  svg.addEventListener('click', (e) => {
    if(modoCuradoria){ adicionarPontoAtencaoNoClique(svg, e); return; }
    const path = e.target.closest('path.path-municipio');
    if(!path) return;
    const codigo = Number(path.dataset.codigo);
    const dataAno = getDataset(state.ano);
    const idx = dataAno.findIndex(m => m.codigo === codigo);
    if(idx < 0) return;
    state.municipioIdx = idx;
    renderDashboard();
  });
})();

/* converte um clique do mouse (coordenadas de tela) pra x,y do viewBox do SVG —
   necessário porque o SVG é responsivo (width:100%), então 1px de tela != 1 unidade
   do viewBox. Técnica padrão via a matriz de transformação de tela do próprio SVG. */
function coordenadasSvg(svg, evt){
  if(!svg.createSVGPoint || !svg.getScreenCTM) return null;
  const ctm = svg.getScreenCTM();
  if(!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX; pt.y = evt.clientY;
  const p = pt.matrixTransform(ctm.inverse());
  return {x:p.x, y:p.y};
}

/* modo curadoria: clicar no mapa abre um formulário (endereço/categoria/descrição/fonte)
   em vez de encadear prompt()s — adiciona o ponto só nesta sessão do navegador; precisa
   baixar o JSON e substituir o arquivo no repositório pra o ponto aparecer pra quem mais
   visitar o site depois. */
let pontoPendente = null; // {codigo_ibge, lat, lon} do clique atual, enquanto o modal está aberto
function adicionarPontoAtencaoNoClique(svg, e){
  if(!mapaProjecaoAtual) return;
  const pos = coordenadasSvg(svg, e);
  if(!pos){ alert('Não foi possível calcular a posição clicada no mapa — tente de novo.'); return; }
  const { box, largura, alturaContinente, padding } = mapaProjecaoAtual;
  if(pos.y > alturaContinente){ alert('Clique dentro do mapa do continente (não no quadro de Fernando de Noronha) para registrar um ponto.'); return; }
  const inv = inverterProjecao(box, largura, alturaContinente, padding);
  const [lon, lat] = inv(pos.x, pos.y);

  const path = e.target.closest('path.path-municipio');
  const codigo = path ? Number(path.dataset.codigo) : null;
  const municipio = codigo!==null ? getDataset(state.ano).find(m=>m.codigo===codigo) : null;

  pontoPendente = { codigo_ibge: codigo, lat: Math.round(lat*1e5)/1e5, lon: Math.round(lon*1e5)/1e5 };
  abrirModalPonto(municipio);
}

function abrirModalPonto(municipio){
  const overlay = document.getElementById('modalPontoOverlay');
  document.getElementById('modalPontoLocal').textContent = municipio
    ? `Local clicado: ${municipio.nome}-${municipio.uf} (lat ${pontoPendente.lat}, lon ${pontoPendente.lon})`
    : `Local clicado: lat ${pontoPendente.lat}, lon ${pontoPendente.lon} (fora de qualquer município detectado)`;
  document.getElementById('inputPontoEndereco').value = '';
  document.getElementById('selPontoCategoria').value = 'agua';
  document.getElementById('inputPontoDescricao').value = '';
  document.getElementById('inputPontoFonte').value = `curadoria manual, ${new Date().toISOString().slice(0,10)}`;
  overlay.hidden = false;
  document.getElementById('inputPontoEndereco').focus();
}
