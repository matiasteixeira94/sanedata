/* Testes da função serverless api/pontos.js com um GitHub de mentira (fetch substituído):
   senha, validação dos campos e gravação com nova tentativa quando outra pessoa grava
   ao mesmo tempo (409). Não fazem nenhuma chamada de rede real. */
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/pontos.js');

const PONTO = { codigo_ibge: 2611606, lat: -8.05, lon: -34.9, endereco: 'Rua da Aurora, 100', categoria: 'esgoto', descricao: 'vazamento', fonte: 'equipe' };

function respostaFalsa(){
  const r = { statusCode: 200, corpo: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (c) => { r.corpo = c; return r; };
  return r;
}

/* GitHub em memória: guarda o arquivo e o sha; `conflitos` faz os N primeiros PUT falharem com 409 */
function githubFalso({ conflitos = 0 } = {}){
  const estado = { conteudo: JSON.stringify({ pontos: [] }), sha: 'v1', puts: 0 };
  global.fetch = async (url, op = {}) => {
    if(!op.method){
      return { ok: true, status: 200, json: async () => ({ sha: estado.sha, content: Buffer.from(estado.conteudo).toString('base64') }) };
    }
    estado.puts++;
    const corpo = JSON.parse(op.body);
    if(estado.puts <= conflitos || corpo.sha !== estado.sha) return { ok: false, status: 409, json: async () => ({}) };
    estado.conteudo = Buffer.from(corpo.content, 'base64').toString('utf8');
    estado.sha = 'v' + (estado.puts + 1);
    return { ok: true, status: 200, json: async () => ({}) };
  };
  return estado;
}

function configurar(){
  process.env.CURADORIA_SENHA = 'segredo-de-teste';
  process.env.GITHUB_TOKEN = 'token-falso';
  process.env.GITHUB_REPO = 'exemplo/repo';
}

test('GET informa se o cadastro compartilhado está ativo', async () => {
  delete process.env.CURADORIA_SENHA;
  let res = respostaFalsa(); await handler({ method: 'GET' }, res);
  assert.deepEqual(res.corpo, { ativo: false });
  configurar();
  res = respostaFalsa(); await handler({ method: 'GET' }, res);
  assert.deepEqual(res.corpo, { ativo: true });
});

test('POST sem configuração responde 503 (painel volta ao modo antigo)', async () => {
  delete process.env.GITHUB_TOKEN;
  const res = respostaFalsa();
  await handler({ method: 'POST', body: { senha: 'x', ponto: PONTO } }, res);
  assert.equal(res.statusCode, 503);
});

test('senha errada responde 401 e não grava nada', async () => {
  configurar();
  const gh = githubFalso();
  const res = respostaFalsa();
  await handler({ method: 'POST', body: { senha: 'errada', ponto: PONTO } }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(gh.puts, 0);
});

test('validação recusa coordenada fora de PE, categoria e código inválidos, texto longo', () => {
  assert.throws(() => handler.validarPonto({ ...PONTO, lat: -23.5, lon: -46.6 }), /fora de Pernambuco/);
  assert.throws(() => handler.validarPonto({ ...PONTO, categoria: 'x' }), /categoria/);
  assert.throws(() => handler.validarPonto({ ...PONTO, codigo_ibge: 3550308 }), /código IBGE/);
  assert.throws(() => handler.validarPonto({ ...PONTO, endereco: '' }), /endereço/);
  assert.throws(() => handler.validarPonto({ ...PONTO, descricao: 'a'.repeat(1001) }), /1000/);
  const ok = handler.validarPonto({ ...PONTO, campoExtra: '<script>' });
  assert.equal(ok.campoExtra, undefined); // só campos conhecidos são gravados
});

test('senha certa grava o ponto no arquivo do repositório (201)', async () => {
  configurar();
  const gh = githubFalso();
  const res = respostaFalsa();
  await handler({ method: 'POST', body: JSON.stringify({ senha: 'segredo-de-teste', ponto: PONTO }) }, res);
  assert.equal(res.statusCode, 201);
  const gravado = JSON.parse(gh.conteudo);
  assert.equal(gravado.pontos.length, 1);
  assert.equal(gravado.pontos[0].endereco, 'Rua da Aurora, 100');
});

test('gravação simultânea (409) tenta de novo com a versão nova, sem perder ponto', async () => {
  configurar();
  const gh = githubFalso({ conflitos: 1 });
  const res = respostaFalsa();
  await handler({ method: 'POST', body: { senha: 'segredo-de-teste', ponto: PONTO } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(gh.puts, 2);
  assert.equal(JSON.parse(gh.conteudo).pontos.length, 1);
});
