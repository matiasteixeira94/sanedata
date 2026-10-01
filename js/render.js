/* ============ HELPERS DE RENDER ============ */
const svgNS = "http://www.w3.org/2000/svg";
function el(tag, attrs){ const e = document.createElementNS(svgNS, tag); for(const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function clear(node){ while(node.firstChild) node.removeChild(node.firstChild); }
function fmt(n, dec=0){ if(n===null || n===undefined || Number.isNaN(n)) return "—"; return n.toLocaleString('pt-BR', {minimumFractionDigits:dec, maximumFractionDigits:dec}); }

/* ============ PLACEHOLDER GENÉRICO (dado ainda não apurado) ============ */
function placeholderHTML(titulo, texto){
  return `<div class="placeholder-box"><h2>${titulo}</h2><p>${texto}</p></div>`;
}
/* mensagem sobre lacuna de dado de saneamento, adaptada ao componente — a cobertura real
   difere muito entre os três (água tem série quase completa 2015-2023; esgoto é parcial
   mesmo nos anos cobertos; resíduos não tem nenhuma fonte automatizada ainda). */
function avisoSaneamento(compKey){
  if(compKey === "deficitResiduos"){
    return 'O déficit de resíduos sólidos ainda não tem fonte automatizada: nem a Base dos Dados (BigQuery) nem o novo Painel de Indicadores do SINISA publicam esse indicador — o módulo de resíduos do SINISA está marcado como "em breve" pelo próprio Ministério das Cidades. Só o passo manual (data/scripts/README.md, seção 04) pode preenchê-lo quando for disponibilizado.';
  }
  if(compKey === "deficitAgua" || compKey === "deficitEsgoto"){
    const nome = compKey === "deficitAgua" ? "água" : "esgoto";
    return `O déficit de ${nome} ainda não foi apurado para este ano/município. A série automatizada cobre 2015-2022 (Base dos Dados/SNIS, data/scripts/04a) e, só para água, também 2023 (Painel de Indicadores do SINISA, data/scripts/04b) — 2024 e o componente de esgoto após 2022 continuam exigindo o passo manual (data/scripts/README.md, seção 04).`;
  }
  return "O déficit de saneamento ainda não foi importado para este painel — ver data/scripts/README.md.";
}

/* ============ BUSCA DE MUNICÍPIO (input + datalist compartilhado por todos os
   seletores de município do painel — o roster de 185 é o mesmo em todos os anos,
   só o valor dos indicadores muda, então o datalist só precisa ser populado uma vez) ============ */
function rotuloMunicipio(m){ return `${m.nome} — ${m.uf}`; }
function popularDatalistMunicipios(data){
  const dl = document.getElementById('dlMunicipiosPE');
  if(!dl || dl.options.length) return;
  data.forEach(m=>{
    const opt = document.createElement('option');
    opt.value = rotuloMunicipio(m);
    dl.appendChild(opt);
  });
}
/* remove acento e caixa — quem digita "petrolina" ou "Petrolina" sem o "— PE" que o
   datalist sugere não devia cair num "não encontrado" silencioso. */
function normalizarBusca(s){
  return s.normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase();
}
function encontrarMunicipioPorRotulo(data, rotulo){
  const exato = data.find(m => rotuloMunicipio(m) === rotulo);
  if(exato) return exato;
  const alvo = normalizarBusca(rotulo);
  if(!alvo) return null;
  // aceita o nome sem o "— PE" (ex.: "petrolina", com ou sem acento/maiúscula)
  const porNomeExato = data.find(m => normalizarBusca(m.nome) === alvo);
  if(porNomeExato) return porNomeExato;
  // só resolve por prefixo quando é inequívoco — nunca adivinha entre vários candidatos
  const porPrefixo = data.filter(m => normalizarBusca(m.nome).startsWith(alvo));
  return porPrefixo.length === 1 ? porPrefixo[0] : null;
}

/* ============ SELEÇÃO DE MUNICÍPIO NO TOPO DA PÁGINA (depende do ano, refeito a cada troca) ============ */
function popularSelectMunicipios(data){
  popularDatalistMunicipios(data);
  const input = document.getElementById('selMunicipio');
  const idx = Math.min(Math.max(state.municipioIdx || 0, 0), data.length-1);
  state.municipioIdx = idx;
  if(input && data[idx]){ input.value = rotuloMunicipio(data[idx]); input.classList.remove('campo-invalido'); }
}

function svgTexto(texto, W, H){
  const g = el('g',{});
  const linhas = quebrarTexto(texto, 56);
  linhas.forEach((linha,i)=>{
    const t = el('text',{x:W/2, y:H/2 - (linhas.length-1)*9 + i*18, 'text-anchor':'middle', 'font-size':13, 'font-family':'IBM Plex Sans', fill:'var(--text-muted)'});
    t.textContent = linha;
    g.appendChild(t);
  });
  return g;
}
function quebrarTexto(texto, larguraMax){
  const palavras = texto.split(' ');
  const linhas = []; let atual = '';
  palavras.forEach(p=>{
    if((atual+' '+p).trim().length > larguraMax){ linhas.push(atual.trim()); atual = p; }
    else atual = (atual+' '+p).trim();
  });
  if(atual) linhas.push(atual);
  return linhas;
}

function clear2(node){ node.innerHTML=""; }

/* forma compacta pra rótulo em cima de uma coluna estreita — "R$ 121.538.046,26" não caberia
   ali. O valor exato continua no tooltip (title do SVG) e na tabela alternativa, nunca só aqui. */
function fmtMoedaCompacta(v){
  if(v===null || v===undefined) return '';
  const abs = Math.abs(v);
  if(abs >= 1e6) return (v/1e6).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1}) + 'mi';
  if(abs >= 1e3) return (v/1e3).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:0}) + 'mil';
  return fmt(v,0);
}

