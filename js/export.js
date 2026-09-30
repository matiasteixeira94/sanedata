/* =========================================================================
   EXPORTAÇÃO — CSV, Excel (.xls via tabela HTML, sem depender de lib externa)
   e imagem PNG dos gráficos SVG, todos gerados a partir dos mesmos dados já
   carregados em tela (nenhum valor recalculado ou inventado na exportação).
   ========================================================================= */

function baixarBlob(blob, nomeArquivo){
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = nomeArquivo;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function exportarCSV(){
  const linhas = calcularLinhasRelatorio();
  const cab = COLUNAS_RELATORIO.map(c=>c.rotulo).join(";");
  const corpo = linhas.map(l => COLUNAS_RELATORIO.map(c=>{
    const v = l[c.chave];
    if(v===null || v===undefined || Number.isNaN(v)) return "";
    return String(typeof v === "number" ? round1(v) : v).replace(".", ",");
  }).join(";")).join("\n");
  const csv = String.fromCharCode(0xFEFF) + cab + "\n" + corpo; // BOM: acentuação abre correta no Excel
  baixarBlob(new Blob([csv], {type:"text/csv;charset=utf-8"}), `sanedata_ranking_${state.ano}.csv`);
}

function exportarExcel(){
  const linhas = calcularLinhasRelatorio();
  const tabela = construirTabelaHTML(linhas);
  const html = `<html><head><meta charset="UTF-8"></head><body><table border="1">${tabela}</table></body></html>`;
  baixarBlob(new Blob([html], {type:"application/vnd.ms-excel"}), `sanedata_ranking_${state.ano}.xls`);
}

/* substitui var(--token) pelo valor de cor computado — a imagem exportada é
   um SVG isolado (sem acesso ao css/styles.css), então as custom properties
   do painel não resolveriam sozinhas dentro dela. */
function resolverVarsCorSVG(svgEl){
  const regex = /var\((--[a-zA-Z0-9-]+)\)/g;
  const resolver = (attr) => svgEl.querySelectorAll(`[${attr}]`).forEach(node=>{
    const val = node.getAttribute(attr);
    if(val && val.includes("var(")) node.setAttribute(attr, val.replace(regex, (_, nome) => corCss(nome) || "#000"));
  });
  resolver("fill"); resolver("stroke");
  ["fill","stroke"].forEach(attr=>{
    const val = svgEl.getAttribute(attr);
    if(val && val.includes("var(")) svgEl.setAttribute(attr, val.replace(regex, (_, nome) => corCss(nome) || "#000"));
  });
}

function exportarImagemSVG(svgId, nomeArquivo){
  const svg = document.getElementById(svgId);
  if(!svg) return;
  const clone = svg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  resolverVarsCorSVG(clone);

  const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  bg.setAttribute("x","0"); bg.setAttribute("y","0");
  bg.setAttribute("width","100%"); bg.setAttribute("height","100%");
  bg.setAttribute("fill", corCss("--surface") || "#fff");
  clone.insertBefore(bg, clone.firstChild);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([svgStr], {type:"image/svg+xml;charset=utf-8"}));

  const img = new Image();
  img.onload = () => {
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const escala = 2; // exporta em resolução maior que a tela
    const w = (vb && vb.width ? vb.width : svg.clientWidth || 480) * escala;
    const h = (vb && vb.height ? vb.height : svg.clientHeight || 300) * escala;
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    URL.revokeObjectURL(url);
    canvas.toBlob(blob => baixarBlob(blob, nomeArquivo), "image/png");
  };
  img.src = url;
}

/* exporta uma ou mais tabelas já renderizadas na tela para CSV (;, BOM para o Excel) —
   o CSV sai exatamente com o que o usuário está vendo, inclusive "—" como célula vazia.
   Tabelas diferentes no mesmo arquivo ficam separadas por uma linha com o título delas. */
function exportarTabelasCSV(tabelas, nomeArquivo){
  const celula = (td) => {
    const txt = td.textContent.replace(/\s+/g,' ').trim(); // textContent: innerText aplicaria o text-transform (cabeçalho em CAIXA ALTA)
    if(txt === '—') return '';
    return /[;"\n]/.test(txt) ? `"${txt.replace(/"/g,'""')}"` : txt;
  };
  const blocos = tabelas.map(({id, titulo})=>{
    const tabela = document.getElementById(id);
    if(!tabela) return '';
    const linhas = [...tabela.rows].map(tr => [...tr.cells].map(celula).join(';'));
    return (titulo ? titulo + '\n' : '') + linhas.join('\n');
  }).filter(Boolean);
  const csv = String.fromCharCode(0xFEFF) + blocos.join('\n\n');
  baixarBlob(new Blob([csv], {type:'text/csv;charset=utf-8'}), nomeArquivo);
}

/* nome de arquivo seguro a partir de um nome de município ("São José do Egito" → "sao_jose_do_egito") */
function slugArquivo(s){
  return normalizarBusca(s).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
}
