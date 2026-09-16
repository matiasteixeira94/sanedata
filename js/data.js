/* =========================================================================
   DADOS — carregados em tempo de execução a partir de data/processed/painel_pe.json,
   gerado pelo pipeline em data/scripts/ (fontes oficiais: IBGE, SINAN/SIH-SUS,
   SINISA/SNIS — ver data/scripts/README.md). Este arquivo não contém nenhum
   valor de indicador embutido: se o JSON não existir ou algum campo não
   tiver sido apurado ainda, o dado aparece como ausente na interface, nunca
   como um número inventado.
   ========================================================================= */
const INDICADORES_DEFICIT = ["deficitAgua","deficitEsgoto","deficitResiduos"];
const INDICADORES_SAUDE   = ["taxaDengue","taxaChikungunya","taxaDiarreia"];
const TODOS_INDICADORES   = [...INDICADORES_DEFICIT, ...INDICADORES_SAUDE]; // todos os indicadores rastreados (tabelas, exportação, mapa por camada)
/* indicadores usados no ÍNDICE COMPOSTO de priorização — deficitResiduos fica de fora
   enquanto não houver nenhuma fonte de dado disponível (nem manual nem automatizada;
   ver data/scripts/README.md, seção 04/04b): incluí-lo faria o índice nunca fechar
   em nenhum município/ano, já que hoje é sempre nulo. Assim que resíduos tiver dado
   real, basta devolvê-lo a esta lista. */
const INDICADORES_INDICE  = ["deficitAgua","deficitEsgoto", ...INDICADORES_SAUDE];

/* taxas de investimento em saneamento (R$ por 100 mil habitantes), por entidade executora
   (prestador/município/estado) — ver data/scripts/04d_snis_investimento.py. Deliberadamente
   fora de INDICADORES_DEFICIT/INDICADORES_INDICE/TODOS_INDICADORES: são valores monetários,
   não uma taxa 0-100%, então misturá-los quebraria a escala de cor do mapa e o índice
   composto de priorização. Só água+esgoto, só 2015-2022 (mesma cobertura do 04a). */
const INDICADORES_INVESTIMENTO = ["investimentoPrestadorPer100k","investimentoMunicipioPer100k","investimentoEstadoPer100k"];

const LABELS = {
  deficitAgua:"Déficit de água", deficitEsgoto:"Déficit de esgoto", deficitResiduos:"Déficit de resíduos",
  taxaDengue:"Dengue", taxaChikungunya:"Chikungunya", taxaDiarreia:"Diarreia aguda",
  investimentoPrestadorPer100k:"Investimento — prestador", investimentoMunicipioPer100k:"Investimento — município", investimentoEstadoPer100k:"Investimento — estado"
};
const LABEL_PESO = { igual:"pesos iguais", entropia:"entropia de Shannon", pca:"PCA (1º componente)" };

let PAINEL = null; // payload bruto de data/processed/painel_pe.json
let state = { ano:null, indicador:"taxaDengue", componente:"deficitAgua", municipioIdx:0, peso:"igual", mapaCamada:"indice", compA:0, compB:1 };

/* ============ CARREGAMENTO DOS DADOS REAIS ============ */
async function carregarPainel(){
  const resp = await fetch('data/processed/painel_pe.json', { cache:'no-store' });
  if(!resp.ok) throw new Error(`HTTP ${resp.status} ao buscar data/processed/painel_pe.json`);
  PAINEL = await resp.json();
  state.ano = anoPadrao();
}

/* ano inicial: o mais recente em que o índice composto já é calculável (pelo menos 2
   municípios com os indicadores de INDICADORES_INDICE completos) — sem isso, o ano mais
   recente (anoFim) apareceria "vazio" no Dashboard sempre que a fonte de dado mais nova
   ainda não tiver saneamento apurado (ex.: 2024 no momento em que este código foi escrito).
   Cai para anoFim se nenhum ano tiver dado suficiente ainda. */
function anoPadrao(){
  for(let a = PAINEL.anoFim; a >= PAINEL.anoInicio; a--){
    if(indiceCompletoCache(a, 'igual').completos.length >= 2) return String(a);
  }
  return String(PAINEL.anoFim);
}

function anosDisponiveis(){
  if(!PAINEL) return [];
  const anos = [];
  for(let a = PAINEL.anoFim; a >= PAINEL.anoInicio; a--) anos.push(String(a));
  return anos;
}

/* município x ano -> objeto plano usado pelas telas (nomes de campo iguais aos do protótipo
   original). Cacheado por ano: várias partes do painel comparam município por referência de
   objeto (indexOf, ===, includes) — sem cache, duas chamadas de getDataset(mesmoAno) em
   pontos diferentes do código criavam objetos diferentes pro mesmo município, quebrando
   essas comparações. Como ninguém muta os objetos retornados, cachear é seguro; nunca
   precisa invalidar (PAINEL não muda durante a sessão). */
const _cacheDataset = new Map();
function getDataset(ano){
  if(!PAINEL) return [];
  const chave = String(ano);
  if(_cacheDataset.has(chave)) return _cacheDataset.get(chave);
  const resultado = PAINEL.municipios
    .filter(m => String(m.ano) === chave)
    .map(m => ({
      codigo: m.codigo_ibge, nome: m.municipio, uf: m.uf, pop: m.populacao, mesorregiao: m.mesorregiao,
      deficitAgua: m.deficitAgua, deficitEsgoto: m.deficitEsgoto, deficitResiduos: m.deficitResiduos,
      taxaDengue: m.taxaDengue, taxaChikungunya: m.taxaChikungunya, taxaDiarreia: m.taxaDiarreia,
      investimentoPrestadorPer100k: m.investimentoPrestadorPer100k, investimentoMunicipioPer100k: m.investimentoMunicipioPer100k, investimentoEstadoPer100k: m.investimentoEstadoPer100k,
    }))
    .sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  _cacheDataset.set(chave, resultado);
  return resultado;
}

/* mantém só os municípios com valor real (não nulo) nas chaves pedidas */
function comDadosCompletos(data, chaves){
  return data.filter(m => chaves.every(k => m[k] !== null && m[k] !== undefined && !Number.isNaN(m[k])));
}

/* cache do índice composto (municípios completos + valores) por (ano, peso) — a mesma
   conta era refeita do zero em Dashboard, Mapa, Relatórios e Comparações a cada render,
   mesmo quando nada relevante tinha mudado. Nunca precisa invalidar: os dados de PAINEL
   não mudam durante a sessão (só um novo carregarPainel() traria dado diferente). */
const _cacheIndice = new Map();
function indiceCompletoCache(ano, peso){
  const chave = ano + '|' + peso;
  if(_cacheIndice.has(chave)) return _cacheIndice.get(chave);
  const completos = comDadosCompletos(getDataset(ano), INDICADORES_INDICE);
  const idx = completos.length ? computeIndex(completos, peso) : [];
  const resultado = { completos, idx };
  _cacheIndice.set(chave, resultado);
  return resultado;
}

function round1(n){ return Math.round(n*10)/10; }

/* limpa os caches de município/ano e de índice composto — necessário antes de recarregar
   PAINEL (botão "Atualizar dados"), já que esses caches assumem que os dados não mudam
   durante a sessão (ver comentários em getDataset/indiceCompletoCache acima). */
function limparCachesPainel(){
  _cacheDataset.clear();
  _cacheIndice.clear();
}
