/* ============ NAVEGAÇÃO ============ */
let currentView = 'inicio';
function renderCurrentView(){
  if(currentView==='dashboard') renderDashboard(); // já inclui o mapa geográfico (renderMapaGeo) e "Município em foco" (renderInicio)
  if(currentView==='relatorios') renderRelatorios();
  if(currentView==='comparacoes') renderComparacoes();
  // 'inicio' e 'apresentacao' são conteúdo estático (institucional / texto explicativo), sem render dinâmico
}
function setView(view){
  currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-item, .hero-nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===view));
  const titles = {inicio:'Tela Inicial', apresentacao:'Apresentação', dashboard:'Dashboard', relatorios:'Relatórios', comparacoes:'Comparações'};
  document.getElementById('pageTitle').textContent = titles[view] || '';
  closeMobileMenu();
  renderCurrentView();
}

document.getElementById('nav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.nav-item');
  if(!btn || btn.classList.contains('disabled')) return;
  setView(btn.dataset.view);
});

document.getElementById('heroNav').addEventListener('click', (e)=>{
  const btn = e.target.closest('.hero-nav-btn');
  if(!btn || btn.classList.contains('disabled')) return;
  setView(btn.dataset.view);
});

/* ============ MENU MOBILE ============ */
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const btnMenu = document.getElementById('btnMenu');
function openMobileMenu(){ sidebar.classList.add('open'); overlay.classList.add('show'); btnMenu.setAttribute('aria-expanded','true'); }
function closeMobileMenu(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); btnMenu.setAttribute('aria-expanded','false'); }
btnMenu.addEventListener('click', ()=> sidebar.classList.contains('open') ? closeMobileMenu() : openMobileMenu());
overlay.addEventListener('click', closeMobileMenu);

/* ============ TEMA CLARO/ESCURO (estado em memória, sem localStorage) ============ */
const btnTheme = document.getElementById('btnTheme');
btnTheme.addEventListener('click', ()=>{
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('themeIcon').textContent = isDark ? '🌙' : '☀️';
  document.getElementById('themeLabel').textContent = isDark ? 'Tema escuro' : 'Tema claro';
  btnTheme.setAttribute('aria-pressed', String(!isDark));
});

/* ============ FILTROS — ANO (global) E INDICADOR/COMPONENTE (Dashboard) ============ */
['selAno','selIndicador','selComponente'].forEach(id=>{
  document.getElementById(id).addEventListener('change', (e)=>{
    if(id==='selAno'){
      state.ano = e.target.value;
      popularSelectMunicipios(getDataset(state.ano));
      /* um filtro por faixa de índice (0-10, 10-20...) é específico ao ano — a escala do
         índice muda de ano pra ano, então uma faixa "correta" no ano anterior pode não
         corresponder a nada no novo (o filtro por mesorregião continua válido, região
         não muda com o ano). */
      if(filtroRanking && filtroRanking.tipo === 'faixa') filtroRanking = null;
    }
    if(id==='selIndicador') state.indicador = e.target.value;
    if(id==='selComponente') state.componente = e.target.value;
    renderCurrentView();
  });
});

/* ============ BUSCA DE MUNICÍPIO (input + datalist compartilhado) ============
   Campo de texto (em vez de <select>) para buscar por nome entre os 185
   municípios. Antes, só um rótulo idêntico ao gerado pelo datalist ("Nome — PE")
   mudava o estado — quem digitava só o nome (sem "— PE"), com acento diferente
   ou letra maiúscula/minúscula trocada, tinha a busca ignorada em silêncio: o
   campo voltava pro município anterior sem nenhum aviso, então os dados do
   painel continuavam sendo de outro município sem o usuário perceber o motivo.
   Agora: (1) encontrarMunicipioPorRotulo aceita nome sem sufixo/acento/caixa e
   prefixo inequívoco (ver js/render.js); (2) quando mesmo assim não encontra
   nada, o campo fica com contorno de alerta e NÃO apaga o que foi digitado —
   dá pra ver que a busca não "pegou" em vez de só continuar mostrando o
   município antigo como se nada tivesse acontecido. */
function ligarBuscaMunicipio(input, aoEncontrar){
  const marcarInvalido = (invalido) => input.classList.toggle('campo-invalido', invalido);
  input.addEventListener('input', ()=>{
    const data = getDataset(state.ano);
    marcarInvalido(!encontrarMunicipioPorRotulo(data, input.value));
  });
  input.addEventListener('change', ()=>{
    const data = getDataset(state.ano);
    const m = encontrarMunicipioPorRotulo(data, input.value);
    if(m){
      marcarInvalido(false);
      aoEncontrar(m, data);
    } else {
      marcarInvalido(true); // mantém o texto digitado — não revert silencioso
    }
  });
}

ligarBuscaMunicipio(document.getElementById('selMunicipio'), (m, data)=>{
  state.municipioIdx = data.indexOf(m);
  renderCurrentView();
});

/* ============ FILTROS — DASHBOARD ============ */
document.getElementById('pillsPeso').addEventListener('click', (e)=>{
  const btn = e.target.closest('.pill'); if(!btn) return;
  document.querySelectorAll('#pillsPeso .pill').forEach(p=>p.classList.remove('active'));
  btn.classList.add('active');
  state.peso = btn.dataset.peso;
  renderDashboard();
});

/* esquema de pesos escondido atrás de "avançado" por padrão — a maioria não precisa
   entender entropia de Shannon/PCA pra usar o painel, só quem quer conferir robustez. */
const btnPesosAvancado = document.getElementById('btnPesosAvancado');
btnPesosAvancado.addEventListener('click', ()=>{
  const painel = document.getElementById('pesosAvancado');
  const aberto = painel.hidden;
  painel.hidden = !aberto;
  btnPesosAvancado.setAttribute('aria-expanded', String(aberto));
});

/* ============ FILTROS — MAPA GEOGRÁFICO (dentro do Dashboard) ============ */
document.getElementById('selCamadaMapa').addEventListener('change', (e)=>{
  state.mapaCamada = e.target.value;
  renderMapaGeo();
});

/* ============ PONTOS DE ATENÇÃO — MODO CURADORIA (ver data/processed/README.md) ============ */
const btnModoCuradoria = document.getElementById('btnModoCuradoria');
btnModoCuradoria.addEventListener('click', ()=>{
  modoCuradoria = !modoCuradoria;
  btnModoCuradoria.classList.toggle('btn-export-primary', modoCuradoria);
  btnModoCuradoria.textContent = modoCuradoria
    ? '📍 Modo curadoria ativo — clique no mapa pra adicionar um ponto'
    : '📍 Modo curadoria: adicionar ponto de atenção';
});
document.getElementById('btnBaixarPontos').addEventListener('click', ()=>{
  const payload = { pontos: PONTOS_ATENCAO };
  const json = JSON.stringify(payload, null, 2);
  baixarBlob(new Blob([json], {type:'application/json;charset=utf-8'}), 'pontos_atencao.json');
});

/* modal do formulário de novo ponto de atenção (substitui os prompt() encadeados) */
function fecharModalPonto(){
  document.getElementById('modalPontoOverlay').hidden = true;
  pontoPendente = null;
}
document.getElementById('btnPontoCancelar').addEventListener('click', fecharModalPonto);
document.getElementById('modalPontoOverlay').addEventListener('click', (e)=>{
  if(e.target.id === 'modalPontoOverlay') fecharModalPonto(); // clicar fora do card fecha, como o menu mobile
});
document.getElementById('btnPontoSalvar').addEventListener('click', ()=>{
  if(!pontoPendente) return;
  const endereco = document.getElementById('inputPontoEndereco').value.trim();
  if(!endereco){ document.getElementById('inputPontoEndereco').focus(); return; }
  PONTOS_ATENCAO.push({
    ...pontoPendente,
    endereco,
    categoria: document.getElementById('selPontoCategoria').value,
    descricao: document.getElementById('inputPontoDescricao').value.trim(),
    fonte: document.getElementById('inputPontoFonte').value.trim(),
  });
  fecharModalPonto();
  renderMapaGeo();
  document.getElementById('btnBaixarPontos').style.display = '';
});

/* ============ FILTROS — COMPARAÇÕES ============ */
ligarBuscaMunicipio(document.getElementById('selCompA'), (m, data)=>{
  state.compA = data.indexOf(m);
  renderComparacoes();
});
ligarBuscaMunicipio(document.getElementById('selCompB'), (m, data)=>{
  state.compB = data.indexOf(m);
  renderComparacoes();
});

/* ============ EXPORTAÇÃO — RELATÓRIOS ============ */
document.getElementById('btnExportCSV').addEventListener('click', exportarCSV);
document.getElementById('btnExportExcel').addEventListener('click', exportarExcel);
document.getElementById('btnExportPNG').addEventListener('click', ()=>{
  exportarImagemSVG('chartRankingRelatorio', `sanedata_ranking_${state.ano}.png`);
});
document.getElementById('btnImprimir').addEventListener('click', ()=> window.print());

/* ============ ATUALIZAR DADOS (botão na Tela Inicial) ============
   Reforça a busca de data/processed/painel_pe.json (+ malha geográfica e pontos de
   atenção) e re-renderiza Dashboard, Relatórios e Comparações com o resultado — mesmo
   estando na Tela Inicial no momento do clique, já que é daqui que o usuário dispara a
   atualização das outras telas. Mantém o ano e os municípios selecionados quando eles
   ainda existirem no dado recarregado; cai pro padrão quando não existirem mais. */
function municipioPorCodigo(data, codigo){
  const i = data.findIndex(m => m.codigo === codigo);
  return i === -1 ? 0 : i;
}

const btnAtualizarDados = document.getElementById('btnAtualizarDados');
const heroAtualizarStatus = document.getElementById('heroAtualizarStatus');

btnAtualizarDados.addEventListener('click', async ()=>{
  const dataAntiga = getDataset(state.ano);
  const anoAnterior = state.ano;
  const codigoMunicipioAnterior = dataAntiga[state.municipioIdx]?.codigo;
  const codigoCompAAnterior = dataAntiga[state.compA]?.codigo;
  const codigoCompBAnterior = dataAntiga[state.compB]?.codigo;

  btnAtualizarDados.disabled = true;
  const textoOriginal = btnAtualizarDados.textContent;
  btnAtualizarDados.textContent = '🔄 Atualizando...';
  heroAtualizarStatus.textContent = '';

  try{
    limparCachesPainel();
    await carregarPainel(); // já define state.ano = anoPadrao()
    try{ await carregarMalha(); malhaErro = null; } catch(erro){ malhaErro = erro; }
    await carregarPontosAtencao();

    const anos = anosDisponiveis();
    state.ano = anos.includes(anoAnterior) ? anoAnterior : anoPadrao();
    popularSelectAnos();
    clear2(document.getElementById('dlMunicipiosPE')); // recarrega a lista — pode ter mudado no dado novo
    const dataNova = getDataset(state.ano);
    state.municipioIdx = municipioPorCodigo(dataNova, codigoMunicipioAnterior);
    state.compA = municipioPorCodigo(dataNova, codigoCompAAnterior);
    state.compB = municipioPorCodigo(dataNova, codigoCompBAnterior);
    popularSelectMunicipios(dataNova);

    renderDashboard();
    renderRelatorios();
    renderComparacoes();

    const agora = new Date().toLocaleTimeString('pt-BR');
    heroAtualizarStatus.textContent = `Dados atualizados às ${agora} — Dashboard, Relatórios e Comparações recarregados.`;
  } catch(erro){
    heroAtualizarStatus.textContent = `Falha ao atualizar os dados (${erro.message}).`;
  } finally{
    btnAtualizarDados.disabled = false;
    btnAtualizarDados.textContent = textoOriginal;
  }
});

/* ============ INIT ============ */
function popularSelectAnos(){
  const sel = document.getElementById('selAno');
  clear(sel);
  anosDisponiveis().forEach(ano=>{
    const opt = document.createElement('option');
    opt.value = ano; opt.textContent = ano;
    sel.appendChild(opt);
  });
  sel.value = state.ano;
}

function mostrarErroCarregamento(erro){
  document.getElementById('heroErro').innerHTML =
    `<div class="placeholder-box"><h2>Não foi possível carregar os dados</h2>` +
    `<p>Falha ao buscar <code>data/processed/painel_pe.json</code> (${erro.message}). ` +
    `Rode o pipeline em <code>data/scripts/</code> (veja <code>data/scripts/README.md</code>) e sirva a pasta por HTTP ` +
    `(ex.: <code>python -m http.server</code>), já que navegadores bloqueiam <code>fetch</code> em arquivos abertos direto como <code>file://</code>.</p></div>`;
}

async function iniciar(){
  const heroErro = document.getElementById('heroErro');
  heroErro.innerHTML = `<p class="hero-carregando"><span class="spinner" aria-hidden="true"></span> Carregando dados oficiais (IBGE, SINAN/SIH-SUS, SINISA/SNIS)...</p>`;
  try{
    await carregarPainel();
  } catch(erro){
    mostrarErroCarregamento(erro);
    return;
  }
  try{
    await carregarMalha();
  } catch(erro){
    malhaErro = erro; // só afeta o mapa geográfico dentro do Dashboard — o resto do painel não depende da malha
  }
  await carregarPontosAtencao(); // opcional — sem arquivo/pontos ainda não é erro, ver js/geo.js
  popularSelectAnos();
  popularSelectMunicipios(getDataset(state.ano));
  heroErro.innerHTML = '';
}
iniciar();
