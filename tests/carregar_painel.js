/* Carrega os scripts do front-end (js/*.js) num contexto isolado do Node, com um DOM
   mínimo de mentira — os testes exercitam as MESMAS funções que o navegador usa, sem
   copiar nenhuma lógica de cálculo para cá. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPTS = ['data','stats','render','geo','export','series','perfil','metodologia','simulador'];

function elementoFalso(){
  return {
    children:[], options:[], style:{}, dataset:{}, innerHTML:'', textContent:'', value:'', hidden:false,
    classList:{ add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    appendChild(c){ this.children.push(c); this.options.push(c); return c; },
    removeChild(){ this.children.shift(); }, get firstChild(){ return this.children[0]; },
    setAttribute(){}, getAttribute(){ return null; }, removeAttribute(){}, addEventListener(){},
    insertBefore(){}, querySelectorAll(){ return []; }, closest(){ return null; }, focus(){}, scrollIntoView(){},
  };
}

function carregarPainel({ painel } = {}){
  const elementos = {};
  const ctx = {
    console, Map, Set, Promise, setTimeout,
    document: {
      getElementById: id => elementos[id] || (elementos[id] = elementoFalso()),
      createElement: elementoFalso, createElementNS: elementoFalso,
      querySelectorAll: () => [], addEventListener(){}, documentElement: elementoFalso(),
    },
    window: { addEventListener(){}, scrollTo(){} },
    location: { hash:'', pathname:'/', search:'' },
    history: { replaceState(){}, pushState(){} },
    getComputedStyle: () => ({ getPropertyValue: () => '#123456' }),
    navigator: {},
  };
  vm.createContext(ctx);
  const codigo = SCRIPTS.map(n => fs.readFileSync(path.join(RAIZ, 'js', n + '.js'), 'utf8')).join('\n;\n');
  // `let`/`const` de nível de script não viram propriedades do contexto — este trecho final
  // expõe o que os testes precisam, sem alterar os arquivos do front-end.
  vm.runInContext(codigo + `
    ;globalThis.__painel = {
      definirPainel: (p) => { PAINEL = p; limparCachesPainel(); state.ano = anoPadrao(); },
      state, getDataset, indiceCompletoCache, indiceReguaFixaCache, reguaFixaDaSerie, valorIndicador,
      computeIndex, computeWeights, buildMatrix, rank, rankDesc, spearman, quantil, media, minMax,
      simularIndice, estatisticaPorAno, INDICADORES_INDICE, CHAVE_INDICE_FIXO, CHAVE_INVESTIMENTO_TOTAL,
    };`, ctx);
  const api = ctx.__painel;
  const dados = painel || JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'processed', 'painel_pe.json'), 'utf8'));
  api.definirPainel(dados);
  return api;
}

module.exports = { carregarPainel, RAIZ };
