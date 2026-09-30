/* ============ ESTATÍSTICA ============ */
function minMax(arr){ return [Math.min(...arr), Math.max(...arr)]; }
function normalizeCol(data, key){
  const vals = data.map(d=>d[key]);
  const [mn,mx] = minMax(vals);
  return vals.map(v => (mx-mn) ? (v-mn)/(mx-mn) : 0);
}
function buildMatrix(data, indicadores){
  const chaves = indicadores || INDICADORES_INDICE;
  const cols = chaves.map(k => normalizeCol(data,k));
  return data.map((_,i) => chaves.map((_,j)=>cols[j][i]));
}
function equalWeights(m){ return new Array(m).fill(1/m); }
function entropyWeights(matrix){
  const n = matrix.length, m = matrix[0].length, w=[];
  for(let j=0;j<m;j++){
    let col = matrix.map(r=>r[j]); let sum = col.reduce((a,b)=>a+b,0) || 1e-9;
    let e=0;
    col.forEach(v=>{ const p=v/sum; if(p>0) e += p*Math.log(p); });
    e = -e/Math.log(n);
    w.push(1-e);
  }
  const sw = w.reduce((a,b)=>a+b,0) || 1e-9;
  return w.map(x=>x/sw);
}
function pcaWeights(matrix){
  const n=matrix.length, m=matrix[0].length;
  const means = new Array(m).fill(0);
  matrix.forEach(row=>row.forEach((v,j)=>means[j]+=v/n));
  const cov = Array.from({length:m},()=>new Array(m).fill(0));
  for(let j=0;j<m;j++) for(let k=0;k<m;k++){
    let s=0; matrix.forEach(row=>s+=(row[j]-means[j])*(row[k]-means[k]));
    cov[j][k]=s/(n-1);
  }
  let v = new Array(m).fill(1/Math.sqrt(m));
  for(let it=0; it<200; it++){
    const nv = new Array(m).fill(0);
    for(let j=0;j<m;j++) for(let k=0;k<m;k++) nv[j]+=cov[j][k]*v[k];
    const norm = Math.sqrt(nv.reduce((a,b)=>a+b*b,0)) || 1e-9;
    v = nv.map(x=>x/norm);
  }
  const abs = v.map(Math.abs);
  const s = abs.reduce((a,b)=>a+b,0) || 1e-9;
  return abs.map(x=>x/s);
}
function computeWeights(scheme, matrix){
  if(scheme==="entropia") return entropyWeights(matrix);
  if(scheme==="pca") return pcaWeights(matrix);
  return equalWeights(matrix[0].length);
}
function computeIndex(data, scheme, indicadores){
  const matrix = buildMatrix(data, indicadores);
  const w = computeWeights(scheme, matrix);
  return matrix.map(row => row.reduce((acc,val,idx)=>acc+val*w[idx],0)*100);
}
function rank(arr){
  const idx = arr.map((v,i)=>i).sort((a,b)=>arr[a]-arr[b]);
  const r = new Array(arr.length);
  idx.forEach((originalIdx,pos)=>{ r[originalIdx]=pos+1; });
  return r;
}
/* rank em ordem decrescente (1 = maior valor) — usado nos rótulos "Nª maior..." da interface */
function rankDesc(arr){
  const n = arr.length;
  return rank(arr).map(r => n+1-r);
}
function spearman(a,b){
  const ra = rank(a), rb = rank(b), n=a.length;
  let d2 = 0;
  for(let i=0;i<n;i++){ const d = ra[i]-rb[i]; d2 += d*d; }
  return 1 - (6*d2)/(n*(n*n-1));
}
function forcaCorrelacao(rho){
  const a = Math.abs(rho);
  if(a < 0.3) return "fraca";
  if(a < 0.6) return "moderada";
  return "forte";
}
/* regressão linear simples (OLS) — usada só para desenhar a linha de tendência do gráfico de dispersão */
function linreg(xs, ys){
  const n = xs.length;
  const mx = xs.reduce((a,b)=>a+b,0)/n, my = ys.reduce((a,b)=>a+b,0)/n;
  let num=0, den=0;
  for(let i=0;i<n;i++){ num += (xs[i]-mx)*(ys[i]-my); den += (xs[i]-mx)**2; }
  const a = den ? num/den : 0;
  return {a, b: my - a*mx};
}
/* média e quantil (interpolação linear, mesmo método do numpy/Excel QUARTIL.INC) — usados
   nas Séries Históricas (mediana e faixa interquartil por ano) e no Perfil do Município.
   Ambos recebem só valores já filtrados (sem null) e devolvem null pra lista vazia, nunca 0. */
function media(arr){ return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null; }
function quantil(arr, p){
  if(!arr.length) return null;
  const ord = [...arr].sort((a,b)=>a-b);
  const pos = (ord.length-1)*p, base = Math.floor(pos), resto = pos-base;
  return ord[base+1]!==undefined ? ord[base]+resto*(ord[base+1]-ord[base]) : ord[base];
}
