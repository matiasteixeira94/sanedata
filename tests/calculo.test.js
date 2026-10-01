/* Testes do cálculo do índice de priorização e das estatísticas do painel.
   Rodar na raiz do projeto:  node --test tests/
   Sem dependências — usa o executor de testes nativo do Node (18+).

   Três grupos:
   1. Estatística e índice com dados sintéticos, de resultado conhecido à mão.
   2. Integridade de data/processed/painel_pe.json (nenhum valor fora do domínio).
   3. Regressão com os dados reais: valores conferidos na versão atual. Se o pipeline
      for rodado de novo com dado novo, estes números PODEM mudar legitimamente —
      confira a diferença e atualize o valor esperado; se o dado não mudou e o teste
      quebrou, alguma alteração de código mudou o resultado do índice. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarPainel } = require('./carregar_painel');

const P = carregarPainel();
const quase = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (tolerância ${tol})`);

/* ---------- 1. estatística e índice (dados sintéticos) ---------- */
test('rank e rankDesc ordenam do menor/maior para o outro extremo', () => {
  assert.deepEqual([...P.rank([30, 10, 20])], [3, 1, 2]);
  assert.deepEqual([...P.rankDesc([30, 10, 20])], [1, 3, 2]);
});

test('Spearman: +1 para ordem igual, −1 para ordem inversa', () => {
  quase(P.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  quase(P.spearman([1, 2, 3, 4], [40, 30, 20, 10]), -1);
});

test('quantil com interpolação linear (mesmo método do numpy/Excel QUARTIL.INC)', () => {
  quase(P.quantil([1, 2, 3, 4], 0.5), 2.5);
  quase(P.quantil([1, 2, 3, 4, 5], 0.25), 2);
  quase(P.quantil([10], 0.75), 10);
  assert.equal(P.quantil([], 0.5), null);
  assert.equal(P.media([]), null); // lista vazia é "sem dado", nunca 0
});

test('índice com pesos iguais: normalização mín-máx e média × 100', () => {
  // 3 municípios x 5 indicadores do índice; o município B é o pior em tudo, A o melhor
  const k = P.INDICADORES_INDICE;
  const mk = (v) => Object.fromEntries(k.map((c, j) => [c, v[j]]));
  const dados = [mk([10, 20, 100, 5, 50]), mk([30, 60, 300, 15, 150]), mk([20, 40, 200, 10, 100])];
  const idx = P.computeIndex(dados, 'igual');
  quase(idx[0], 0);    // mínimo em todos
  quase(idx[1], 100);  // máximo em todos
  quase(idx[2], 50);   // meio em todos
});

test('pesos de entropia e PCA somam 1 e não são negativos', () => {
  const k = P.INDICADORES_INDICE;
  const { completos } = P.indiceCompletoCache('2022', 'igual');
  const matrix = P.buildMatrix(completos, k);
  for (const esquema of ['igual', 'entropia', 'pca']) {
    const w = P.computeWeights(esquema, matrix);
    assert.equal(w.length, k.length);
    quase(w.reduce((a, b) => a + b, 0), 1, 1e-9);
    assert.ok(w.every(x => x >= 0), `${esquema}: peso negativo`);
  }
});

test('índice fica sempre entre 0 e 100 em todos os anos e esquemas', () => {
  for (let a = 2015; a <= 2024; a++) {
    for (const esquema of ['igual', 'entropia', 'pca']) {
      const { idx } = P.indiceCompletoCache(String(a), esquema);
      assert.ok(idx.every(v => v >= -1e-9 && v <= 100 + 1e-9), `${a}/${esquema} fora de 0-100`);
    }
  }
});

test('simulador sem alteração reproduz exatamente o índice do painel', () => {
  for (const esquema of ['igual', 'entropia', 'pca']) {
    const { completos, idx } = P.indiceCompletoCache('2023', esquema);
    const m = completos[7];
    const sim = P.simularIndice('2023', esquema, m, {});
    quase(sim.valor, idx[7]);
    quase(sim.contribuicoes.reduce((a, b) => a + b, 0), idx[7], 1e-9); // contribuições somam o índice
  }
});

test('simulador: zerar todos os indicadores leva o município ao último lugar', () => {
  const { completos } = P.indiceCompletoCache('2023', 'igual');
  const m = completos[0];
  const zeros = Object.fromEntries(P.INDICADORES_INDICE.map(k => [k, 0]));
  const sim = P.simularIndice('2023', 'igual', m, zeros);
  quase(sim.valor, 0);
  assert.equal(sim.rank, completos.length);
});

/* ---------- 2. integridade dos dados ---------- */
test('painel_pe.json: 185 municípios em cada ano, códigos únicos', () => {
  for (let a = 2015; a <= 2024; a++) {
    const d = P.getDataset(String(a));
    assert.equal(d.length, 185, `ano ${a}`);
    assert.equal(new Set(d.map(m => m.codigo)).size, 185, `códigos repetidos em ${a}`);
  }
});

test('painel_pe.json: déficits entre 0 e 100, taxas e investimento não negativos, população positiva', () => {
  for (let a = 2015; a <= 2024; a++) {
    for (const m of P.getDataset(String(a))) {
      assert.ok(m.pop > 0, `${m.nome} ${a}: população`);
      for (const k of ['deficitAgua', 'deficitEsgoto', 'deficitResiduos']) {
        if (m[k] !== null) assert.ok(m[k] >= 0 && m[k] <= 100, `${m.nome} ${a}: ${k}=${m[k]}`);
      }
      for (const k of ['taxaDengue', 'taxaChikungunya', 'taxaDiarreia', 'investimentoPrestadorPer100k', 'investimentoMunicipioPer100k', 'investimentoEstadoPer100k']) {
        if (m[k] !== null) assert.ok(m[k] >= 0, `${m.nome} ${a}: ${k}=${m[k]}`);
      }
    }
  }
});

test('investimento total é null quando as 3 entidades estão sem dado (nunca 0 inventado)', () => {
  const m = { investimentoPrestadorPer100k: null, investimentoMunicipioPer100k: null, investimentoEstadoPer100k: null };
  assert.equal(P.valorIndicador(m, P.CHAVE_INVESTIMENTO_TOTAL), null);
  const m2 = { investimentoPrestadorPer100k: 10, investimentoMunicipioPer100k: null, investimentoEstadoPer100k: 5 };
  assert.equal(P.valorIndicador(m2, P.CHAVE_INVESTIMENTO_TOTAL), 15);
});

/* ---------- 3. regressão com os dados reais ---------- */
test('ano padrão é o mais recente com índice calculável', () => {
  assert.equal(P.state.ano, '2023');
});

test('regressão 2023, pesos iguais: 84 municípios no índice; Recife com 22,6 na 55ª posição', () => {
  const { completos, idx } = P.indiceCompletoCache('2023', 'igual');
  assert.equal(completos.length, 84);
  const pos = completos.findIndex(m => m.codigo === 2611606);
  quase(idx[pos], 22.6, 0.05);
  assert.equal(P.rankDesc(idx)[pos], 55);
});

test('régua fixa: mesma escala em todos os anos, entre 0 e 100', () => {
  const regua = P.reguaFixaDaSerie();
  for (let a = 2015; a <= 2024; a++) {
    const { completos, idx } = P.indiceReguaFixaCache(String(a));
    idx.forEach((v, i) => assert.ok(v >= -1e-9 && v <= 100 + 1e-9, `${a}: ${completos[i].nome}=${v}`));
  }
  // o mínimo global de cada indicador aparece em algum ano — a régua não é de um ano só
  assert.ok(Object.values(regua).every(r => r.max > r.min));
});

test('resumo executivo do Perfil: gera texto com e sem índice calculável, sem "NaN"/"undefined"', () => {
  for (const codigo of [2611606, 2608008]) { // Recife (com índice em 2023) e Jataúba (sem esgoto em 2023)
    P.state.ano = '2023';
    P.state.municipioIdx = P.getDataset('2023').findIndex(m => m.codigo === codigo);
    P.renderPerfil();
    const texto = P.document.getElementById('perfilResumo').innerHTML;
    assert.ok(texto.length > 200, `resumo vazio para ${codigo}`);
    assert.ok(!/NaN|undefined|null/.test(texto), `valor inválido no resumo de ${codigo}`);
  }
});

test('pontos de atenção no Perfil: todo texto do JSON sai escapado (inclusive categoria fora da lista)', () => {
  const ataque = '<img src=x onerror=alert(1)>';
  P.definirPontos([{ codigo_ibge: 2611606, lat: -8.05, lon: -34.88, categoria: ataque, endereco: ataque, descricao: ataque, fonte: ataque }]);
  try {
    P.state.ano = '2023';
    P.state.municipioIdx = P.getDataset('2023').findIndex(m => m.codigo === 2611606);
    P.renderPerfil();
    const html = P.document.getElementById('perfilPontos').innerHTML;
    assert.ok(html.includes('&lt;img'), 'ponto não apareceu escapado na tabela');
    assert.ok(!html.includes('<img'), 'HTML do ponto foi inserido sem escapar');
  } finally {
    P.definirPontos([]);
  }
});
