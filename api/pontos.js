/* =========================================================================
   API — cadastro compartilhado de pontos de atenção (função serverless do Vercel)

   POST /api/pontos  { senha, ponto: {codigo_ibge, lat, lon, endereco, categoria, descricao, fonte} }

   Grava o ponto em data/processed/pontos_atencao.json DIRETO no repositório do
   GitHub (API de conteúdo, um commit por ponto). O Vercel republica o site a
   cada push, então o ponto aparece para todos em ~1 minuto — sem banco de
   dados, e o histórico de quem cadastrou o quê fica no próprio git.

   Variáveis de ambiente (Vercel → Project → Settings → Environment Variables):
     CURADORIA_SENHA  senha compartilhada da equipe de curadoria
     GITHUB_TOKEN     token fine-grained com permissão "Contents: Read and write"
                      SÓ neste repositório
     GITHUB_REPO      "usuario/repositorio" (ex.: matiasteixeira94/sanedata)
     GITHUB_BRANCH    opcional, padrão "main"
   Sem essas variáveis a API responde 503 e o painel volta ao modo antigo
   (registrar na sessão + baixar o JSON), então nada quebra.
   ========================================================================= */
const crypto = require('node:crypto');

const ARQUIVO = 'data/processed/pontos_atencao.json';
const CATEGORIAS = ['agua', 'esgoto', 'residuos', 'outro'];
// retângulo que contém PE continental + Fernando de Noronha, com folga
const LIMITES = { latMin: -10.0, latMax: -3.0, lonMin: -42.0, lonMax: -32.0 };

function senhaConfere(recebida, esperada){
  const a = Buffer.from(String(recebida || ''));
  const b = Buffer.from(String(esperada));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function texto(v, max){
  if(v === undefined || v === null) return '';
  if(typeof v !== 'string') throw new Error('campo de texto inválido');
  const t = v.trim();
  if(t.length > max) throw new Error(`texto maior que ${max} caracteres`);
  return t;
}

/* aceita só os campos conhecidos, com tipo e tamanho conferidos — nada do corpo da
   requisição é gravado sem passar por aqui */
function validarPonto(p){
  if(!p || typeof p !== 'object') throw new Error('ponto ausente');
  const lat = Number(p.lat), lon = Number(p.lon);
  if(!Number.isFinite(lat) || !Number.isFinite(lon) || lat < LIMITES.latMin || lat > LIMITES.latMax || lon < LIMITES.lonMin || lon > LIMITES.lonMax){
    throw new Error('coordenadas fora de Pernambuco');
  }
  const codigo = p.codigo_ibge === null || p.codigo_ibge === undefined ? null : Number(p.codigo_ibge);
  if(codigo !== null && !(Number.isInteger(codigo) && String(codigo).startsWith('26') && String(codigo).length === 7)){
    throw new Error('código IBGE inválido');
  }
  if(!CATEGORIAS.includes(p.categoria)) throw new Error('categoria inválida');
  const endereco = texto(p.endereco, 200);
  if(!endereco) throw new Error('endereço obrigatório');
  return {
    codigo_ibge: codigo,
    lat: Math.round(lat * 1e5) / 1e5,
    lon: Math.round(lon * 1e5) / 1e5,
    endereco,
    categoria: p.categoria,
    descricao: texto(p.descricao, 1000),
    fonte: texto(p.fonte, 200),
    registradoEm: new Date().toISOString(),
  };
}

async function github(caminho, opcoes = {}){
  const resp = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/${caminho}`, {
    ...opcoes,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'sanedata-curadoria',
      ...(opcoes.headers || {}),
    },
  });
  return resp;
}

/* lê o JSON atual, acrescenta o ponto e grava com o `sha` lido — se outro ponto foi
   gravado no meio tempo, o GitHub recusa (409) e tentamos de novo com a versão nova,
   em vez de sobrescrever o ponto do colega */
async function gravarPonto(ponto){
  const branch = process.env.GITHUB_BRANCH || 'main';
  for(let tentativa = 0; tentativa < 3; tentativa++){
    const atual = await github(`contents/${ARQUIVO}?ref=${encodeURIComponent(branch)}`);
    if(!atual.ok) throw new Error(`GitHub respondeu ${atual.status} ao ler ${ARQUIVO}`);
    const info = await atual.json();
    const payload = JSON.parse(Buffer.from(info.content, 'base64').toString('utf8'));
    const pontos = Array.isArray(payload.pontos) ? payload.pontos : [];
    pontos.push(ponto);
    const novo = JSON.stringify({ ...payload, pontos }, null, 2) + '\n';
    const gravar = await github(`contents/${ARQUIVO}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Curadoria: novo ponto de atenção (${ponto.categoria}) — ${ponto.endereco.slice(0, 60)}`,
        content: Buffer.from(novo, 'utf8').toString('base64'),
        sha: info.sha,
        branch,
      }),
    });
    if(gravar.ok) return pontos.length;
    if(gravar.status !== 409 && gravar.status !== 422) throw new Error(`GitHub respondeu ${gravar.status} ao gravar`);
  }
  throw new Error('arquivo alterado por outra pessoa ao mesmo tempo — tente de novo');
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if(req.method === 'GET'){
    // o painel pergunta se o cadastro compartilhado está ligado antes de mostrar o campo de senha
    return res.status(200).json({ ativo: Boolean(process.env.CURADORIA_SENHA && process.env.GITHUB_TOKEN && process.env.GITHUB_REPO) });
  }
  if(req.method !== 'POST'){
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ erro: 'método não permitido' });
  }
  if(!process.env.CURADORIA_SENHA || !process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO){
    return res.status(503).json({ erro: 'cadastro compartilhado não configurado neste servidor' });
  }

  let corpo = req.body;
  if(typeof corpo === 'string'){ try{ corpo = JSON.parse(corpo); }catch(e){ corpo = null; } }
  if(!corpo || !senhaConfere(corpo.senha, process.env.CURADORIA_SENHA)){
    return res.status(401).json({ erro: 'senha da curadoria incorreta' });
  }

  let ponto;
  try{ ponto = validarPonto(corpo.ponto); }
  catch(e){ return res.status(400).json({ erro: e.message }); }

  try{
    const total = await gravarPonto(ponto);
    return res.status(201).json({ ok: true, ponto, total });
  }catch(e){
    return res.status(502).json({ erro: e.message });
  }
};

module.exports.validarPonto = validarPonto; // exposto para os testes
