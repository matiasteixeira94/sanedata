/* ============ NAVEGAÇÃO ============ */
let currentView = 'inicio';
const TITULOS_VIEW = {
  inicio:'Tela Inicial', apresentacao:'Apresentação', dashboard:'Dashboard', perfil:'Perfil do Município',
  series:'Séries Históricas', simulador:'Simulador de Cenários', relatorios:'Relatórios', comparacoes:'Comparações', metodologia:'Metodologia & Dados',
};
function renderCurrentView(){
  if(currentView==='dashboard') renderDashboard(); // já inclui o mapa geográfico (renderMapaGeo) e "Município em foco" (renderInicio)
  if(currentView==='perfil') renderPerfil();
  if(currentView==='series') renderSeries();
  if(currentView==='simulador') renderSimulador();
  if(currentView==='relatorios') renderRelatorios();
  if(currentView==='comparacoes') renderComparacoes();
  if(currentView==='metodologia') renderMetodologia();
  // 'inicio' e 'apresentacao' são conteúdo estático (institucional / texto explicativo), sem render dinâmico
  if(currentView==='perfil') atualizarHash(true); // o município pode ter mudado — o link compartilhável acompanha
}

/* ============ ENDEREÇO (URL) DE CADA TELA ============
   #dashboard, #series, #perfil/2611606 (código IBGE)... — permite compartilhar o link de
   uma tela ou da ficha de um município, e faz o botão "voltar" do navegador funcionar
   entre telas. O ano não entra no link de propósito: quem abre depois vê o ano padrão
   (o mais recente com índice calculável), não um ano que pode ter ficado desatualizado. */
function hashDaView(view){
  if(view === 'perfil'){
    const m = getDataset(state.ano)[state.municipioIdx];
    return m ? `#perfil/${m.codigo}` : '#perfil';
  }
  return view === 'inicio' ? '#' : '#'+view;
}
function atualizarHash(substituir){
  const novo = hashDaView(currentView);
  if((location.hash || '#') === novo) return;
  const url = novo === '#' ? location.pathname + location.search : novo;
  if(substituir) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
}
function aplicarHash(){
  const [view, codigo] = location.hash.replace(/^#/, '').split('/');
  if(codigo){
    const i = getDataset(state.ano).findIndex(m => String(m.codigo) === codigo);
    if(i >= 0) state.municipioIdx = i;
    popularSelectMunicipios(getDataset(state.ano));
  }
  setView(TITULOS_VIEW[view] ? view : 'inicio', {semHistorico:true});
}
window.addEventListener('popstate', aplicarHash);

function setView(view, {semHistorico=false} = {}){
  currentView = view;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-'+view).classList.add('active');
  document.querySelectorAll('.nav-item, .hero-nav-btn').forEach(b=>{
    const ativo = b.dataset.view===view;
    b.classList.toggle('active', ativo);
    if(ativo) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current');
  });
  document.getElementById('pageTitle').textContent = TITULOS_VIEW[view] || '';
  document.title = `${TITULOS_VIEW[view] || 'SaneData'} · SaneData — Saneamento & Saúde Pública em PE`;
  closeMobileMenu();
  if(!semHistorico) atualizarHash(false);
  window.scrollTo(0, 0);
  renderCurrentView();
}

/* qualquer elemento com data-view (menu lateral, atalhos da Tela Inicial) ou
   data-view-link (links dentro do texto, rodapé) troca de tela */
document.addEventListener('click', (e)=>{
  const btn = e.target.closest('.nav-item, .hero-nav-btn, [data-view-link]');
  if(!btn || btn.classList.contains('disabled')) return;
  setView(btn.dataset.view || btn.dataset.viewLink);
});

/* abre o Perfil de um município a partir de qualquer lista/tabela com data-codigo */
function abrirPerfilPorCodigo(codigo){
  const i = getDataset(state.ano).findIndex(m => m.codigo === Number(codigo));
  if(i < 0) return;
  state.municipioIdx = i;
  popularSelectMunicipios(getDataset(state.ano));
  setView('perfil');
}
document.addEventListener('click', (e)=>{
  const linha = e.target.closest('tr.linha-clicavel[data-codigo]');
  if(linha) abrirPerfilPorCodigo(linha.dataset.codigo);
});

/* ============ MENU MOBILE ============ */
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const btnMenu = document.getElementById('btnMenu');
function openMobileMenu(){ sidebar.classList.add('open'); overlay.classList.add('show'); btnMenu.setAttribute('aria-expanded','true'); }
function closeMobileMenu(){ sidebar.classList.remove('open'); overlay.classList.remove('show'); btnMenu.setAttribute('aria-expanded','false'); }
btnMenu.addEventListener('click', ()=> sidebar.classList.contains('open') ? closeMobileMenu() : openMobileMenu());
overlay.addEventListener('click', closeMobileMenu);

/* ============ TEMA CLARO/ESCURO ============
   O tema inicial (escolha salva ou tema do sistema) é aplicado por um script no <head>,
   antes do primeiro desenho. Aqui: botão de troca, que salva a escolha, e o seguimento
   do tema do sistema enquanto o usuário não tiver escolhido um. localStorage pode estar
   bloqueado (aba anônima, política do navegador) — sem ele, o tema só não é lembrado. */
const btnTheme = document.getElementById('btnTheme');
function aplicarTema(tema){
  document.documentElement.setAttribute('data-theme', tema);
  const escuro = tema === 'dark';
  document.getElementById('themeIcon').textContent = escuro ? '☀️' : '🌙';
  document.getElementById('themeLabel').textContent = escuro ? 'Tema claro' : 'Tema escuro';
  btnTheme.setAttribute('aria-pressed', String(escuro));
  if(PAINEL) renderCurrentView(); // mapa e ranking calculam cores a partir dos tokens do tema atual
}
function temaSalvo(){ try{ return localStorage.getItem('sanedata-tema'); }catch(e){ return null; } }
btnTheme.addEventListener('click', ()=>{
  const novo = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  try{ localStorage.setItem('sanedata-tema', novo); }catch(e){}
  aplicarTema(novo);
});
if(window.matchMedia){
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e)=>{
    if(!temaSalvo()) aplicarTema(e.matches ? 'dark' : 'light');
  });
}
aplicarTema(document.documentElement.getAttribute('data-theme') || 'light'); // sincroniza o rótulo do botão com o tema do <head>

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

/* ============ FILTROS — SÉRIES HISTÓRICAS ============ */
document.getElementById('selSerieIndicador').addEventListener('change', (e)=>{
  state.serieIndicador = e.target.value;
  state.serieDe = state.serieAte = null; // cada indicador tem cobertura diferente — recalcula o período padrão
  renderSeries();
});
document.getElementById('selSerieDe').addEventListener('change', (e)=>{ state.serieDe = Number(e.target.value); renderSeries(); });
document.getElementById('selSerieAte').addEventListener('change', (e)=>{ state.serieAte = Number(e.target.value); renderSeries(); });

/* ============ AÇÕES — PERFIL DO MUNICÍPIO ============ */
/* feedback curto no próprio botão (em vez de alert(), que trava a página) */
function confirmarNoBotao(btn, texto){
  const original = btn.textContent;
  btn.textContent = texto;
  btn.disabled = true;
  setTimeout(()=>{ btn.textContent = original; btn.disabled = false; }, 1800);
}
async function copiarTexto(texto, btn){
  try{ await navigator.clipboard.writeText(texto); confirmarNoBotao(btn, '✓ Copiado'); }
  catch(e){ confirmarNoBotao(btn, 'Não foi possível copiar'); }
}
document.getElementById('perfilCabecalho').addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-acao-perfil]');
  if(!btn) return;
  const acao = btn.dataset.acaoPerfil;
  if(acao === 'imprimir') window.print();
  if(acao === 'simular') setView('simulador');
  if(acao === 'copiar') copiarTexto(location.href, btn);
  if(acao === 'comparar'){
    state.compA = state.municipioIdx;
    if(state.compB === state.compA) state.compB = state.compA === 0 ? 1 : 0;
    setView('comparacoes');
  }
});
document.getElementById('btnCopiarCitacao').addEventListener('click', (e)=>{
  copiarTexto(document.getElementById('citacao').textContent.trim(), e.currentTarget);
});

/* ============ EXPORTAÇÃO — COMPARAÇÕES, SÉRIES E PERFIL ============ */
function municipioAtual(){ return getDataset(state.ano)[state.municipioIdx]; }
document.getElementById('btnCompCSV').addEventListener('click', ()=>{
  const d = getDataset(state.ano), A = d[state.compA], B = d[state.compB];
  exportarTabelasCSV([{id:'tabelaComparacao'}], `sanedata_comparacao_${slugArquivo(A.nome)}_x_${slugArquivo(B.nome)}_${state.ano}.csv`);
});
document.getElementById('btnCompPNG').addEventListener('click', ()=>{
  exportarImagemSVG('chartCompSaneamento', `sanedata_comparacao_saneamento_${state.ano}.png`);
  exportarImagemSVG('chartCompSaude', `sanedata_comparacao_saude_${state.ano}.png`);
});
document.getElementById('btnSerieCSV').addEventListener('click', ()=>{
  exportarTabelasCSV([
    {id:'tabelaSerieEstado', titulo:`${LABELS[state.serieIndicador]} — Pernambuco, por ano`},
    {id:'tabelaSerieMelhoras', titulo:`Maiores melhoras ${state.serieDe}-${state.serieAte}`},
    {id:'tabelaSeriePioras', titulo:`Maiores pioras ${state.serieDe}-${state.serieAte}`},
  ], `sanedata_serie_${state.serieIndicador}.csv`);
});
document.getElementById('btnSeriePNG').addEventListener('click', ()=>{
  exportarImagemSVG('chartSerieEstado', `sanedata_serie_${state.serieIndicador}_estado.png`);
  exportarImagemSVG('chartSerieMeso', `sanedata_serie_${state.serieIndicador}_mesorregioes.png`);
});
document.getElementById('btnPerfilCSV').addEventListener('click', ()=>{
  const m = municipioAtual();
  exportarTabelasCSV([{id:'tabelaPerfil', titulo:`${m.nome}-${m.uf} — ${state.ano}`}], `sanedata_perfil_${slugArquivo(m.nome)}_${state.ano}.csv`);
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
    atualizarVersaoDados();

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
/* data de geração do painel_pe.json no rodapé — quem lê um número sabe de quando ele é */
function atualizarVersaoDados(){
  const host = document.getElementById('rodapeVersao');
  if(!host || !PAINEL || !PAINEL.geradoEm) return;
  host.textContent = new Date(PAINEL.geradoEm).toLocaleDateString('pt-BR');
}

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
  atualizarVersaoDados();
  heroErro.innerHTML = '';
  if(location.hash) aplicarHash(); // link compartilhado (#dashboard, #perfil/<código IBGE>...) abre direto na tela
}
iniciar();
